import logging
import os
from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt
from typing import Any
import httpx

logger = logging.getLogger(__name__)

TMAP_API_KEY = os.getenv("TMAP_API_KEY", "")
TMAP_PEDESTRIAN_URL = "https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1"
MAX_WALKING_DISTANCE_M = 10_000


@dataclass(frozen=True)
class RouteResult:
    geometry: list[dict[str, float]]
    distance_m: float
    hazards_avoided: int


def distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """두 위경도 좌표 간의 직선 거리(미터)를 계산합니다."""
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    value = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    )
    return 6_371_000 * 2 * asin(sqrt(value))


def _count_nearby_hazards(
    geometry: list[dict[str, float]], hazards: list[Any], radius_m: float = 25
) -> int:
    """경로 주변에 위치한 위험 지점 개수를 계산합니다."""
    count = 0
    for hazard in hazards:
        h_lat = getattr(hazard, "latitude", None)
        h_lon = getattr(hazard, "longitude", None)
        if h_lat is None or h_lon is None:
            continue
        if any(
            distance_meters(h_lat, h_lon, pt["latitude"], pt["longitude"]) <= radius_m
            for pt in geometry
        ):
            count += 1
    return count


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

    # Tmap 보행자 searchOption 설정
    # 0: 추천 (최신 골목길 및 최단 도보 경로)
    # 4: 대로 우선 (고령자용 평탄/넓은 도로 우선)
    # 30: 계단/육교 제외 (휠체어 및 교통약자 무장애 경로)
    search_option = 0
    if profile == "wheelchair":
        search_option = 30  # 계단/육교 제외 무장애
    elif profile == "elderly":
        search_option = 4   # 대로/완만 보행로 우선

    headers = {
        "appKey": TMAP_API_KEY,
        "Content-Type": "application/json",
    }

    payload = {
        "startX": origin.longitude,
        "startY": origin.latitude,
        "endX": destination.longitude,
        "endY": destination.latitude,
        "startName": "출발지",
        "endName": "도착지",
        "searchOption": search_option,
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(TMAP_PEDESTRIAN_URL, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

        geometry: list[dict[str, float]] = []
        total_distance = 0.0

        for feature in data.get("features", []):
            geom = feature.get("geometry", {})
            geom_type = geom.get("type")
            coords = geom.get("coordinates", [])

            # LineString 타입의 상세 도로 곡선 좌표 추출
            if geom_type == "LineString":
                for lon, lat in coords:
                    point = {"latitude": lat, "longitude": lon}
                    if not geometry or (
                        geometry[-1]["latitude"] != lat or geometry[-1]["longitude"] != lon
                    ):
                        geometry.append(point)

            # 총 이동 거리 파싱
            props = feature.get("properties", {})
            if "totalDistance" in props:
                total_distance = float(props["totalDistance"])

        if not geometry:
            geometry = [
                {"latitude": origin.latitude, "longitude": origin.longitude},
                {"latitude": destination.latitude, "longitude": destination.longitude},
            ]

        avoided_count = _count_nearby_hazards(geometry, hazards)

        return RouteResult(
            geometry=geometry,
            distance_m=round(total_distance or direct_distance),
            hazards_avoided=avoided_count,
        )

    except Exception as exc:
        logger.error(f"Tmap 보행자 API 호출 실패: {exc}")
        # 예외 시 출발-도착 직선 폴백
        return RouteResult(
            geometry=[
                {"latitude": origin.latitude, "longitude": origin.longitude},
                {"latitude": destination.latitude, "longitude": destination.longitude},
            ],
            distance_m=round(direct_distance),
            hazards_avoided=0,
        )