import logging
from dataclasses import dataclass
from math import asin, cos, pi, radians, sin, sqrt
from typing import Any

import httpx

from app.core.config import settings
from app.schemas.environment import DisasterZone

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
    ascent_m: float = 0
    descent_m: float = 0
    max_grade_percent: float = 0
    slope_segments: tuple[dict[str, Any], ...] = ()
    disaster_zones_avoided: int = 0
    disaster_zones: tuple[DisasterZone, ...] = ()


@dataclass(frozen=True)
class _RouteCandidate:
    geometry: list[dict[str, float]]
    distance_m: float
    hazards: tuple[Any, ...]
    ascent_m: float = 0
    descent_m: float = 0
    max_grade_percent: float = 0
    slope_segments: tuple[dict[str, Any], ...] = ()


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
    grade_threshold = {"general": 10, "elderly": 5, "wheelchair": 3}.get(profile, 10)
    grade_penalty = {"general": 8, "elderly": 22, "wheelchair": 35}.get(profile, 8)
    ascent_penalty = {"general": 0.2, "elderly": 1.5, "wheelchair": 2.5}.get(
        profile, 0.2
    )
    slope_cost = max(0, candidate.max_grade_percent - grade_threshold) * grade_penalty
    slope_cost += candidate.ascent_m * ascent_penalty
    return candidate.distance_m + risk * penalty_per_full_risk + slope_cost


def _select_candidate(
    candidates: list[_RouteCandidate], profile: str, prefer_safe_route: bool
) -> tuple[_RouteCandidate, int]:
    """CI 테스트(test_route_service.py) 호환 및 최적 경로 선택 함수"""
    if not candidates:
        raise ValueError("후보 경로가 없습니다.")
    shortest = min(candidates, key=lambda item: item.distance_m)
    has_safety_signal = any(
        item.hazards or item.max_grade_percent > 0 for item in candidates
    )
    if not prefer_safe_route or not has_safety_signal:
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


def _parse_ors_candidates(
    data: dict[str, Any], hazards: list[Any]
) -> list[_RouteCandidate]:
    features = data.get("features", [])
    if not features:
        raise ValueError("OpenRouteService에서 경로 features를 찾지 못했습니다.")
    candidates: list[_RouteCandidate] = []
    for feature in features:
        coordinates = feature.get("geometry", {}).get("coordinates", [])
        if len(coordinates) < 2:
            continue
        geometry: list[dict[str, float]] = []
        for coordinate in coordinates:
            if len(coordinate) < 2:
                continue
            point = {
                "latitude": float(coordinate[1]),
                "longitude": float(coordinate[0]),
            }
            if len(coordinate) >= 3:
                point["elevation"] = float(coordinate[2])
            geometry.append(point)
        if len(geometry) < 2:
            continue

        total_distance = (
            feature.get("properties", {}).get("summary", {}).get("distance", 0.0)
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
        ascent, descent, max_grade, slope_segments = _slope_metrics(geometry)
        candidates.append(
            _RouteCandidate(
                geometry=geometry,
                distance_m=round(total_distance),
                hazards=_nearby_hazards(geometry, hazards),
                ascent_m=ascent,
                descent_m=descent,
                max_grade_percent=max_grade,
                slope_segments=slope_segments,
            )
        )
    if not candidates:
        raise ValueError("유효한 ORS 경로 후보를 찾지 못했습니다.")
    return candidates


def _slope_metrics(
    geometry: list[dict[str, float]],
) -> tuple[float, float, float, tuple[dict[str, Any], ...]]:
    elevations = [point.get("elevation") for point in geometry]
    if not any(value is not None for value in elevations):
        return 0, 0, 0, ()

    ascent = 0.0
    descent = 0.0
    max_grade = 0.0
    segments: list[dict[str, Any]] = []
    window_start = 0
    window_distance = 0.0

    for index in range(1, len(geometry)):
        previous = geometry[index - 1]
        current = geometry[index]
        distance = distance_meters(
            previous["latitude"],
            previous["longitude"],
            current["latitude"],
            current["longitude"],
        )
        previous_elevation = previous.get("elevation")
        current_elevation = current.get("elevation")
        if previous_elevation is None or current_elevation is None:
            window_start = index
            window_distance = 0
            continue
        change = current_elevation - previous_elevation
        if change > 0.5:
            ascent += change
        elif change < -0.5:
            descent += abs(change)
        window_distance += distance
        if window_distance < 20 and index < len(geometry) - 1:
            continue
        start_elevation = geometry[window_start].get("elevation")
        if start_elevation is not None and window_distance >= 8:
            grade = (current_elevation - start_elevation) / window_distance * 100
            max_grade = max(max_grade, abs(grade))
            absolute_grade = abs(grade)
            if absolute_grade >= 5:
                level = (
                    "very_steep"
                    if absolute_grade >= 12
                    else "steep"
                    if absolute_grade >= 8
                    else "moderate"
                )
                segments.append(
                    {
                        "start_index": window_start,
                        "end_index": index,
                        "grade_percent": round(grade, 1),
                        "level": level,
                    }
                )
        window_start = index
        window_distance = 0

    return (
        round(ascent, 1),
        round(descent, 1),
        round(max_grade, 1),
        tuple(segments),
    )


def _avoid_polygons(zones: list[DisasterZone]) -> dict[str, Any] | None:
    polygons: list[list[list[list[float]]]] = []
    for zone in zones:
        latitude_radius = zone.radius_m / 111_320
        longitude_radius = zone.radius_m / max(
            1, 111_320 * cos(radians(zone.latitude))
        )
        ring = [
            [
                zone.longitude + longitude_radius * cos(2 * pi * index / 12),
                zone.latitude + latitude_radius * sin(2 * pi * index / 12),
            ]
            for index in range(12)
        ]
        ring.append(ring[0])
        polygons.append([ring])
    return {"type": "MultiPolygon", "coordinates": polygons} if polygons else None


def calculate_walking_route(
    origin: Any,
    destination: Any,
    hazards: list[Any] | None = None,
    profile: str = "general",
    prefer_safe_route: bool = True,
    disaster_zones: list[DisasterZone] | None = None,
) -> RouteResult:
    direct_distance = distance_meters(
        origin.latitude, origin.longitude, destination.latitude, destination.longitude
    )
    if direct_distance > MAX_WALKING_DISTANCE_M:
        raise ValueError(
            f"도보 경로는 {MAX_WALKING_DISTANCE_M // 1000}km 이내에서 검색해 주세요."
        )

    hazards = hazards or []
    disaster_zones = disaster_zones or []
    for zone in disaster_zones:
        if distance_meters(
            origin.latitude, origin.longitude, zone.latitude, zone.longitude
        ) <= zone.radius_m:
            raise ValueError("출발지가 재난 통제 구간 안에 있어 경로를 계산할 수 없습니다.")
        if distance_meters(
            destination.latitude,
            destination.longitude,
            zone.latitude,
            zone.longitude,
        ) <= zone.radius_m:
            raise ValueError("목적지가 재난 통제 구간 안에 있어 경로를 계산할 수 없습니다.")
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
        "elevation": True,
        "extra_info": ["steepness"],
        "alternative_routes": {
            "target_count": 3,
            "weight_factor": 1.4,
            "share_factor": 0.6,
        },
    }
    avoid_polygons = _avoid_polygons(disaster_zones)
    if avoid_polygons:
        body["options"] = {"avoid_polygons": avoid_polygons}

    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.post(
                url,
                headers=headers,
                json=body,
            )
            # 일부 ORS 프로필/계정은 대안 경로 옵션을 지원하지 않는다. 이 경우
            # 재난 회피 옵션은 유지하고 대안 경로만 제거해 한 번 더 요청한다.
            if response.status_code in {400, 404, 422} and "alternative_routes" in body:
                retry_body = dict(body)
                retry_body.pop("alternative_routes", None)
                response = client.post(url, headers=headers, json=retry_body)
            if response.status_code != 200:
                logger.error(
                    "❌ ORS API 호출 실패 [%s]: %s",
                    response.status_code,
                    response.text,
                )
            response.raise_for_status()
            candidates = _parse_ors_candidates(response.json(), hazards)

        selected, avoided_count = _select_candidate(
            candidates, profile, prefer_safe_route
        )

        return RouteResult(
            geometry=selected.geometry,
            distance_m=selected.distance_m,
            hazards_avoided=avoided_count,
            hazards_on_route=selected.hazards,
            used_fallback=False,
            ascent_m=selected.ascent_m,
            descent_m=selected.descent_m,
            max_grade_percent=selected.max_grade_percent,
            slope_segments=selected.slope_segments,
            disaster_zones_avoided=len(disaster_zones),
            disaster_zones=tuple(disaster_zones),
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
