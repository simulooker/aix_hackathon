import logging
from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

TMAP_API_KEY = settings.tmap_api_key or ""
TMAP_PEDESTRIAN_URL = "https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1"
MAX_WALKING_DISTANCE_M = 10_000


@dataclass(frozen=True)
class RouteResult:
    geometry: list[dict[str, float]]
    distance_m: float
    hazards_avoided: int
    used_fallback: bool = False


@dataclass(frozen=True)
class _RouteCandidate:
    geometry: list[dict[str, float]]
    distance_m: float
    hazards: tuple[Any, ...]


def distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """두 위경도 좌표 간의 직선 거리(미터)를 계산합니다."""
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    value = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    )
    return 6_371_000 * 2 * asin(sqrt(value))


def _nearby_hazards(
    geometry: list[dict[str, float]], hazards: list[Any], radius_m: float = 25
) -> tuple[Any, ...]:
    """Return unique reports close enough to affect this candidate route."""
    nearby: list[Any] = []
    for hazard in hazards:
        h_lat = getattr(hazard, "latitude", None)
        h_lon = getattr(hazard, "longitude", None)
        if h_lat is None or h_lon is None:
            continue
        if any(
            distance_meters(h_lat, h_lon, pt["latitude"], pt["longitude"]) <= radius_m
            for pt in geometry
        ):
            nearby.append(hazard)
    return tuple(nearby)


def _parse_tmap_candidate(
    data: dict[str, Any], hazards: list[Any]
) -> _RouteCandidate:
    geometry: list[dict[str, float]] = []
    total_distance = 0.0
    for feature in data.get("features", []):
        geom = feature.get("geometry", {})
        if geom.get("type") == "LineString":
            for lon, lat in geom.get("coordinates", []):
                point = {"latitude": float(lat), "longitude": float(lon)}
                if not geometry or geometry[-1] != point:
                    geometry.append(point)
        value = feature.get("properties", {}).get("totalDistance")
        if value is not None:
            total_distance = float(value)
    if len(geometry) < 3:
        raise ValueError("실제 보행 경로를 찾지 못했습니다.")
    if total_distance <= 0:
        total_distance = sum(
            distance_meters(
                geometry[index - 1]["latitude"],
                geometry[index - 1]["longitude"],
                point["latitude"],
                point["longitude"],
            )
            for index, point in enumerate(geometry[1:], start=1)
        )
    return _RouteCandidate(
        geometry=geometry,
        distance_m=round(total_distance),
        hazards=_nearby_hazards(geometry, hazards),
    )


def _candidate_score(candidate: _RouteCandidate, profile: str) -> float:
    penalty_per_full_risk = {
        "general": 80,
        "elderly": 180,
        "wheelchair": 260,
    }[profile]
    risk = sum(max(0.0, min(1.0, float(getattr(item, "severity", 0) or 0))) for item in candidate.hazards)
    return candidate.distance_m + risk * penalty_per_full_risk


def _select_candidate(
    candidates: list[_RouteCandidate], profile: str, prefer_safe_route: bool
) -> tuple[_RouteCandidate, int]:
    shortest = min(candidates, key=lambda item: item.distance_m)
    if not prefer_safe_route or not any(item.hazards for item in candidates):
        return shortest, 0
    max_detour_ratio = {"general": 1.15, "elderly": 1.25, "wheelchair": 1.35}[profile]
    reasonable = [
        item
        for item in candidates
        if item.distance_m <= shortest.distance_m * max_detour_ratio
    ]
    selected = min(reasonable, key=lambda item: _candidate_score(item, profile))
    return selected, max(0, len(shortest.hazards) - len(selected.hazards))


def calculate_walking_route(
    origin: Any,
    destination: Any,
    hazards: list[Any] | None = None,
    profile: str = "general",
    prefer_safe_route: bool = True,
) -> RouteResult:
    direct_distance = distance_meters(
        origin.latitude, origin.longitude, destination.latitude, destination.longitude
    )
    if direct_distance > MAX_WALKING_DISTANCE_M:
        raise ValueError(
            f"도보 경로는 {MAX_WALKING_DISTANCE_M // 1000}km 이내에서 검색해 주세요."
        )

    hazards = hazards or []

    headers = {
        "appKey": TMAP_API_KEY,
        "Content-Type": "application/json",
    }

    base_payload = {
        "startX": origin.longitude,
        "startY": origin.latitude,
        "endX": destination.longitude,
        "endY": destination.latitude,
        "startName": "출발지",
        "endName": "도착지",
        "reqCoordType": "WGS84GEO",
        "resCoordType": "WGS84GEO",
        "sort": "index",
    }

    try:
        if not TMAP_API_KEY:
            raise RuntimeError("TMAP_API_KEY가 설정되지 않았습니다.")
        candidates: list[_RouteCandidate] = []
        signatures: set[tuple[tuple[float, float], ...]] = set()
        with httpx.Client(timeout=12.0) as client:
            # 10 is the pedestrian shortest-distance option. The other options
            # provide alternatives that can be compared against reported risks.
            for search_option in (10, 0, 4):
                try:
                    response = client.post(
                        TMAP_PEDESTRIAN_URL,
                        headers=headers,
                        json={**base_payload, "searchOption": search_option},
                    )
                    response.raise_for_status()
                    candidate = _parse_tmap_candidate(response.json(), hazards)
                    signature = tuple(
                        (round(point["latitude"], 5), round(point["longitude"], 5))
                        for point in candidate.geometry[:: max(1, len(candidate.geometry) // 20)]
                    )
                    if signature not in signatures:
                        signatures.add(signature)
                        candidates.append(candidate)
                except (httpx.HTTPError, ValueError) as exc:
                    logger.warning("Tmap route option %s failed: %s", search_option, exc)
        if not candidates:
            raise RuntimeError("Tmap에서 실제 보행 경로를 반환하지 않았습니다.")

        selected, avoided_count = _select_candidate(
            candidates, profile, prefer_safe_route and bool(hazards)
        )

        return RouteResult(
            geometry=selected.geometry,
            distance_m=selected.distance_m,
            hazards_avoided=avoided_count,
            used_fallback=False,
        )

    except Exception as exc:  # noqa: BLE001
        logger.error("Tmap 보행자 API 호출 실패: %s", exc)
        return RouteResult(
            geometry=[
                {"latitude": origin.latitude, "longitude": origin.longitude},
                {"latitude": destination.latitude, "longitude": destination.longitude},
            ],
            distance_m=round(direct_distance),
            hazards_avoided=0,
            used_fallback=True,
        )
