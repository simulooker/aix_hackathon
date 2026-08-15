import logging
from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

ORS_API_KEY = settings.ors_api_key or ""

# ORS 공식 v2 기본 엔드포인트
ORS_BASE_URL = "https://api.openrouteservice.org"
MAX_WALKING_DISTANCE_M = 10_000


@dataclass(frozen=True)
class RouteResult:
    geometry: list[dict[str, float]]
    distance_m: float
    hazards_avoided: int
    hazards_on_route: tuple[Any, ...] = ()
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
    """경로 선 주변 반경 내에 존재하는 위험 요소들을 추출합니다."""
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


def _candidate_score(candidate: _RouteCandidate, profile: str) -> float:
    """테스트 코드 및 위험도 평가를 위한 스코어 함수"""
    penalty_per_full_risk = {
        "general": 35,
        "elderly": 80,
        "wheelchair": 130,
    }.get(profile, 35)
    risk = sum(
        max(0.0, min(1.0, float(getattr(item, "severity", 0) or 0)))
        for item in candidate.hazards
    )
    return candidate.distance_m + risk * penalty_per_full_risk


def _select_candidate(
    candidates: list[_RouteCandidate], profile: str, prefer_safe_route: bool
) -> tuple[_RouteCandidate, int]:
    """CI 테스트(test_route_service.py) 호환 및 최적 경로 선택 함수"""
    if not candidates:
        raise ValueError("후보 경로가 없습니다.")
    shortest = min(candidates, key=lambda item: item.distance_m)
    if not prefer_safe_route or not any(item.hazards for item in candidates):
        return shortest, 0
    max_detour_ratio = {"general": 1.05, "elderly": 1.10, "wheelchair": 1.15}.get(
        profile, 1.05
    )
    reasonable = [
        item
        for item in candidates
        if item.distance_m <= shortest.distance_m * max_detour_ratio
    ]
    selected = min(reasonable, key=lambda item: _candidate_score(item, profile))
    return selected, max(0, len(shortest.hazards) - len(selected.hazards))


def _parse_ors_candidate(
    data: dict[str, Any], hazards: list[Any]
) -> _RouteCandidate:
    features = data.get("features", [])
    if not features:
        raise ValueError("OpenRouteService에서 경로 features를 찾지 못했습니다.")

    feature = features[0]
    coordinates = feature.get("geometry", {}).get("coordinates", [])
    if len(coordinates) < 2:
        raise ValueError("유효한 좌표 목록이 부족합니다.")

    # GeoJSON: [경도(lon), 위도(lat)] -> dict: {latitude, longitude}
    geometry = [
        {"latitude": float(lat), "longitude": float(lon)}
        for lon, lat in coordinates
    ]

    total_distance = (
        feature.get("properties", {})
        .get("summary", {})
        .get("distance", 0.0)
    )

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
    ors_profile = "wheelchair" if profile == "wheelchair" else "foot-walking"
    url = f"{ORS_BASE_URL}/v2/directions/{ors_profile}/geojson"

    raw_key = (ORS_API_KEY or "").strip()
    if not raw_key:
        raise RuntimeError("ORS_API_KEY가 설정되지 않았습니다.")
    headers = {
        "Authorization": f"Bearer {raw_key}" if not raw_key.startswith("Bearer ") else raw_key,
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json, application/geo+json",
    }

    body = {
        "coordinates": [
            [float(origin.longitude), float(origin.latitude)],
            [float(destination.longitude), float(destination.latitude)],
        ],
        "radiuses": [-1, -1],
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.post(
                url,
                headers=headers,
                json=body,
            )
            if response.status_code != 200:
                logger.error(
                    "❌ ORS API 호출 실패 [%s]: %s",
                    response.status_code,
                    response.text,
                )
            response.raise_for_status()
            candidate = _parse_ors_candidate(response.json(), hazards)

        selected, avoided_count = _select_candidate(
            [candidate], profile, prefer_safe_route and bool(hazards)
        )

        return RouteResult(
            geometry=selected.geometry,
            distance_m=selected.distance_m,
            hazards_avoided=avoided_count,
            hazards_on_route=selected.hazards,
            used_fallback=False,
        )

    except Exception as exc:  # noqa: BLE001
        logger.error("❌ OpenRouteService 처리 중 에러 발생: %s", exc)
        return RouteResult(
            geometry=[
                {"latitude": origin.latitude, "longitude": origin.longitude},
                {"latitude": destination.latitude, "longitude": destination.longitude},
            ],
            distance_m=round(direct_distance),
            hazards_avoided=0,
            hazards_on_route=(),
            used_fallback=True,
        )
