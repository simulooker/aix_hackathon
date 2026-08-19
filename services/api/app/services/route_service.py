import logging
from dataclasses import dataclass
from math import asin, cos, pi, radians, sin, sqrt
from typing import Any

import httpx

from app.core.config import settings
from app.schemas.environment import DisasterZone

logger = logging.getLogger(__name__)

ORS_API_KEY = settings.ors_api_key or ""

ORS_BASE_URL = "https://api.openrouteservice.org"
MAX_WALKING_DISTANCE_M = 10_000
MAX_ROAD_WAYPOINTS = 25
DISASTER_ROUTE_MESSAGE = "경로가 재난 통제구역을 포함합니다."
STAIR_ROUTE_MESSAGE = "계단을 피해서 이동할 수 있는 휠체어 접근 경로를 찾지 못했습니다."
STAIR_HAZARD_TYPES = {"stairs", "stair", "stairway"}
WHEELCHAIR_BLOCKED_SLOPE_PERCENT = 12.5
WHEELCHAIR_BLOCKED_SLOPE_DISTANCE_M = 20.0
SLOPE_ROUTE_MESSAGE = "경사가 매우 가파른 구간을 피할 수 있는 휠체어 접근 경로를 찾지 못했습니다."


class DisasterRouteBlocked(ValueError):
    """안전하게 우회할 수 없는 재난 통제구역이 경로에 포함된 경우입니다."""


class AccessibilityRouteBlocked(ValueError):
    """이용자 유형으로 통과할 수 없는 구간만 경로 후보에 남은 경우입니다."""


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
    geometry: list[dict[str, float]], hazards: list[Any], radius_m: float = 18
) -> tuple[Any, ...]:
    """경로 좌표 사이의 선분까지 계산해 실제 경로 주변 위험 요소를 추출합니다."""
    nearby: list[Any] = []
    for hazard in hazards:
        h_lat = getattr(hazard, "latitude", None)
        h_lon = getattr(hazard, "longitude", None)
        if h_lat is None or h_lon is None:
            continue
        if len(geometry) == 1:
            is_nearby = distance_meters(
                h_lat, h_lon, geometry[0]["latitude"], geometry[0]["longitude"]
            ) <= radius_m
        else:
            is_nearby = any(
                _distance_to_segment_m(h_lat, h_lon, geometry[index - 1], point)
                <= radius_m
                for index, point in enumerate(geometry[1:], start=1)
            )
        if is_nearby:
            nearby.append(hazard)
    return tuple(nearby)


def _distance_to_segment_m(
    latitude: float,
    longitude: float,
    start: dict[str, float],
    end: dict[str, float],
) -> float:
    """짧은 지도 구간을 평면에 투영해 점과 선분 사이 거리를 계산합니다."""
    reference_latitude = radians(latitude)
    meters_per_lon = max(1.0, 111_320 * cos(reference_latitude))
    sx = (start["longitude"] - longitude) * meters_per_lon
    sy = (start["latitude"] - latitude) * 111_320
    ex = (end["longitude"] - longitude) * meters_per_lon
    ey = (end["latitude"] - latitude) * 111_320
    dx = ex - sx
    dy = ey - sy
    length_squared = dx * dx + dy * dy
    if length_squared <= 0:
        return sqrt(sx * sx + sy * sy)
    ratio = max(0.0, min(1.0, -(sx * dx + sy * dy) / length_squared))
    closest_x = sx + ratio * dx
    closest_y = sy + ratio * dy
    return sqrt(closest_x * closest_x + closest_y * closest_y)


def _candidate_score(candidate: _RouteCandidate, profile: str) -> float:
    """후보 경로 스코어링"""
    penalty_per_full_risk = {
        "general": 0,
        "elderly": 250,
        "wheelchair": 800,
    }.get(profile, 0)

    ordinary_hazards = tuple(
        item
        for item in candidate.hazards
        if getattr(item, "hazard_type", None) not in STAIR_HAZARD_TYPES
    )
    risk = sum(
        max(0.0, min(1.0, float(getattr(item, "severity", 0) or 0)))
        for item in ordinary_hazards
    )
    stairs = sum(
        getattr(item, "hazard_type", None) in STAIR_HAZARD_TYPES
        for item in candidate.hazards
    )

    grade_threshold = {"general": 20, "elderly": 5}.get(profile, 20)
    grade_penalty = {"general": 0, "elderly": 22}.get(profile, 0)
    ascent_penalty = {"general": 0, "elderly": 1.5, "wheelchair": 3.0}.get(profile, 0)

    if profile == "wheelchair":
        grade = max(0.0, candidate.max_grade_percent)
        # 2~5%는 작은 불이익, 5~8.3%는 큰 불이익, 8.3% 초과는 강하게 우회한다.
        slope_cost = max(0.0, min(grade, 5.0) - 2.0) * 10
        slope_cost += max(0.0, min(grade, 8.3) - 5.0) * 50
        slope_cost += max(0.0, grade - 8.3) * 120
    else:
        slope_cost = max(0, candidate.max_grade_percent - grade_threshold) * grade_penalty
    slope_cost += candidate.ascent_m * ascent_penalty

    stair_cost = stairs * (50 if profile == "elderly" else 0)
    return (
        candidate.distance_m
        + (risk * penalty_per_full_risk)
        + slope_cost
        + stair_cost
    )


def _contains_stairs(candidate: _RouteCandidate) -> bool:
    return any(
        getattr(item, "hazard_type", None) in STAIR_HAZARD_TYPES
        for item in candidate.hazards
    )


def _contains_blocked_wheelchair_slope(candidate: _RouteCandidate) -> bool:
    """측정 오차를 줄이기 위해 12.5% 이상이 20m 이상 지속될 때만 차단한다."""
    return any(
        abs(float(segment.get("grade_percent", 0)))
        >= WHEELCHAIR_BLOCKED_SLOPE_PERCENT
        and float(segment.get("distance_m", 0))
        >= WHEELCHAIR_BLOCKED_SLOPE_DISTANCE_M
        for segment in candidate.slope_segments
    )


def _select_candidate(
    candidates: list[_RouteCandidate], profile: str, prefer_safe_route: bool
) -> tuple[_RouteCandidate, int]:
    """최적 경로 선택"""
    if not candidates:
        raise ValueError("후보 경로가 없습니다.")
    if profile == "wheelchair":
        original_candidates = candidates
        candidates = [
            item
            for item in candidates
            if not _contains_stairs(item)
            and not _contains_blocked_wheelchair_slope(item)
        ]
        if not candidates and all(_contains_stairs(item) for item in original_candidates):
            raise AccessibilityRouteBlocked(STAIR_ROUTE_MESSAGE)
        if not candidates:
            raise AccessibilityRouteBlocked(SLOPE_ROUTE_MESSAGE)
    shortest = min(candidates, key=lambda item: item.distance_m)

    if profile == "general":
        return shortest, 0

    has_safety_signal = any(
        item.hazards or item.max_grade_percent > 0 for item in candidates
    )
    if not prefer_safe_route or not has_safety_signal:
        return shortest, 0

    # 노약자는 최대 20% 우회 허용, 휠체어는 최대 50%까지 크게 우회 허용
    max_detour_ratio = {"elderly": 1.20, "wheelchair": 1.50}.get(profile, 1.12)
    reasonable = [
        item
        for item in candidates
        if item.distance_m <= shortest.distance_m * max_detour_ratio
    ]
    if not reasonable:
        reasonable = candidates

    selected = min(reasonable, key=lambda item: _candidate_score(item, profile))
    logger.info(
        "Route candidates profile=%s shortest=%sm selected=%sm hazards(shortest=%s selected=%s) scores=%s",
        profile,
        shortest.distance_m,
        selected.distance_m,
        len(shortest.hazards),
        len(selected.hazards),
        [round(_candidate_score(item, profile), 1) for item in reasonable],
    )
    return selected, max(0, len(shortest.hazards) - len(selected.hazards))


def _filter_hazards_for_profile(
    hazards: list[Any], profile: str
) -> list[Any]:
    """
    사용자 유형별 차등 회피 필터링:
    - wheelchair: 모든 제보 위험 요소를 회피 대상으로 지정
    - elderly: 심각도가 높거나(>=0.6) 밀집된 구역만 선별 회피 (1~2개 가벼운 위험은 통과)
    - general: 회피 대상 없음
    """
    if not hazards or profile == "general":
        return []

    if profile == "wheelchair":
        return list(hazards)

    if profile == "elderly":
        avoid_list = []
        for h in hazards:
            # 계단은 ORS에 강제 회피 영역으로 보내지 않고 정확히 50m 점수만 더한다.
            if getattr(h, "hazard_type", None) in STAIR_HAZARD_TYPES:
                continue
            sev = float(getattr(h, "severity", 0) or 0)
            # 위험도가 높거나(medium 이상) 파손/공사 등의 심각한 요소는 즉시 회피
            if sev >= 0.6:
                avoid_list.append(h)
                continue
            
            # 위험도가 낮더라도 주변 40m 내에 위험 요소가 3개 이상 뭉쳐 있으면(밀집 구역) 회피
            h_lat = getattr(h, "latitude", 0)
            h_lon = getattr(h, "longitude", 0)
            nearby_count = sum(
                1 for other in hazards
                if distance_meters(h_lat, h_lon, getattr(other, "latitude", 0), getattr(other, "longitude", 0)) <= 40
            )
            if nearby_count >= 3:
                avoid_list.append(h)
        return avoid_list

    return []


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
        return 0.0, 0.0, 0.0, ()

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
            if absolute_grade >= 2:
                level = (
                    "blocked"
                    if absolute_grade >= WHEELCHAIR_BLOCKED_SLOPE_PERCENT
                    else "very_steep"
                    if absolute_grade >= 8.3
                    else "steep"
                    if absolute_grade >= 5
                    else "moderate"
                )
                segments.append(
                    {
                        "start_index": window_start,
                        "end_index": index,
                        "grade_percent": round(grade, 1),
                        "distance_m": round(window_distance, 1),
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


def _avoid_polygons(
    zones: list[DisasterZone], hazards: list[Any] | None = None
) -> dict[str, Any] | None:
    polygons: list[list[list[list[float]]]] = []

    # 1. 재난 통제구역 회피
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

    # 2. 프로필에 맞게 필터링된 위험 지점 회피
    if hazards:
        for hazard in hazards:
            h_lat = getattr(hazard, "latitude", None)
            h_lon = getattr(hazard, "longitude", None)
            if h_lat is None or h_lon is None:
                continue

            h_radius_m = 15.0
            lat_r = h_radius_m / 111_320
            lon_r = h_radius_m / max(1, 111_320 * cos(radians(h_lat)))

            ring = [
                [
                    h_lon + lon_r * cos(2 * pi * i / 8),
                    h_lat + lat_r * sin(2 * pi * i / 8),
                ]
                for i in range(8)
            ]
            ring.append(ring[0])
            polygons.append([ring])

    return {"type": "MultiPolygon", "coordinates": polygons} if polygons else None


def _route_intersects_disaster_zone(
    geometry: list[dict[str, float]], zones: list[DisasterZone]
) -> bool:
    if not geometry or not zones:
        return False
    for zone in zones:
        if len(geometry) == 1:
            if distance_meters(
                zone.latitude,
                zone.longitude,
                geometry[0]["latitude"],
                geometry[0]["longitude"],
            ) <= zone.radius_m:
                return True
            continue
        if any(
            _distance_to_segment_m(
                zone.latitude, zone.longitude, geometry[index - 1], point
            )
            <= zone.radius_m
            for index, point in enumerate(geometry[1:], start=1)
        ):
            return True
    return False


def calculate_road_route(points: list[Any]) -> RouteResult:
    """버스 정류장 좌표들을 실제 자동차 도로망에 맞춰 연결합니다."""
    coordinates: list[list[float]] = []
    for point in points:
        coordinate = [float(point.longitude), float(point.latitude)]
        if coordinates and coordinate == coordinates[-1]:
            continue
        coordinates.append(coordinate)
    if len(coordinates) < 2:
        raise ValueError("도로 경로를 계산하려면 서로 다른 좌표가 2개 이상 필요합니다.")
    if len(coordinates) > MAX_ROAD_WAYPOINTS:
        raise ValueError(f"도로 경로 경유지는 {MAX_ROAD_WAYPOINTS}개 이하여야 합니다.")

    raw_key = (ORS_API_KEY or "").strip()
    if not raw_key:
        raise RuntimeError("ORS_API_KEY가 설정되지 않았습니다.")
    headers = {
        "Authorization": f"Bearer {raw_key}" if not raw_key.startswith("Bearer ") else raw_key,
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json, application/geo+json",
    }
    body = {
        "coordinates": coordinates,
        "radiuses": [350] * len(coordinates),
        "instructions": False,
        "preference": "fastest",
    }
    url = f"{ORS_BASE_URL}/v2/directions/driving-car/geojson"
    with httpx.Client(timeout=20.0) as client:
        response = client.post(url, headers=headers, json=body)
        if response.status_code != 200:
            logger.error("ORS road-route request failed [%s]: %s", response.status_code, response.text)
        response.raise_for_status()
    candidates = _parse_ors_candidates(response.json(), [])
    selected = min(candidates, key=lambda item: item.distance_m)
    return RouteResult(
        geometry=selected.geometry,
        distance_m=selected.distance_m,
        hazards_avoided=0,
        used_fallback=False,
    )


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
            raise DisasterRouteBlocked(DISASTER_ROUTE_MESSAGE)
        if distance_meters(
            destination.latitude,
            destination.longitude,
            zone.latitude,
            zone.longitude,
        ) <= zone.radius_m:
            raise DisasterRouteBlocked(DISASTER_ROUTE_MESSAGE)

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
        "radiuses": [800, 800],
        "elevation": True,
        "extra_info": ["steepness"],
        "alternative_routes": {
            "target_count": 3,
            "weight_factor": 1.4,
            "share_factor": 0.6,
        },
    }

    # 사용자 유형별로 회피 대상 위험 요소 선별
    hazards_to_avoid = _filter_hazards_for_profile(hazards, profile)
    avoid_polygons = _avoid_polygons(disaster_zones, hazards_to_avoid)
    if avoid_polygons:
        body["options"] = {"avoid_polygons": avoid_polygons}

    profiles_to_try = (
        ["wheelchair", "foot-walking"] if profile == "wheelchair" else ["foot-walking"]
    )

    last_exception = None

    try:
        with httpx.Client(timeout=15.0) as client:
            for current_profile in profiles_to_try:
                url = f"{ORS_BASE_URL}/v2/directions/{current_profile}/geojson"
                try:
                    response = client.post(url, headers=headers, json=body)

                    if response.status_code in {400, 404, 422} and "alternative_routes" in body:
                        retry_body = dict(body)
                        retry_body.pop("alternative_routes", None)
                        response = client.post(url, headers=headers, json=retry_body)

                    if response.status_code in {400, 404, 422} and hazards_to_avoid:
                        relaxed_body = dict(body)
                        relaxed_polygons = _avoid_polygons(disaster_zones, None)
                        if relaxed_polygons:
                            relaxed_body["options"] = {"avoid_polygons": relaxed_polygons}
                        else:
                            relaxed_body.pop("options", None)
                        relaxed_body.pop("alternative_routes", None)
                        response = client.post(url, headers=headers, json=relaxed_body)

                    if response.status_code in {400, 404, 422} and body.get("radiuses") != [-1, -1]:
                        no_radius_body = dict(body)
                        no_radius_body["radiuses"] = [-1, -1]
                        no_radius_body.pop("alternative_routes", None)
                        response = client.post(url, headers=headers, json=no_radius_body)

                    if response.status_code == 200:
                        candidates = _parse_ors_candidates(response.json(), hazards)
                        selected, avoided_count = _select_candidate(
                            candidates, profile, prefer_safe_route
                        )
                        if _route_intersects_disaster_zone(selected.geometry, disaster_zones):
                            raise DisasterRouteBlocked(DISASTER_ROUTE_MESSAGE)

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
                    else:
                        logger.warning(
                            "ORS %s 요청 실패 [%s]: %s",
                            current_profile,
                            response.status_code,
                            response.text,
                        )
                except (DisasterRouteBlocked, AccessibilityRouteBlocked):
                    raise
                except Exception as exc:
                    last_exception = exc
                    continue

        if last_exception:
            raise last_exception
        raise ValueError("보행 경로를 탐색하지 못했습니다.")

    except (DisasterRouteBlocked, AccessibilityRouteBlocked):
        raise
    except Exception as exc:  # noqa: BLE001
        logger.error("❌ OpenRouteService 처리 중 에러 발생: %s", exc)
        if disaster_zones:
            raise DisasterRouteBlocked(DISASTER_ROUTE_MESSAGE) from exc
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
