from math import asin, cos, radians, sin, sqrt
from uuid import uuid4

from fastapi import APIRouter

from app.schemas.navigation import RouteRequest, RouteResponse

router = APIRouter(prefix="/routes", tags=["routes"])


def distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    value = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 6_371_000 * 2 * asin(sqrt(value))


@router.post("", response_model=RouteResponse)
async def create_route(payload: RouteRequest) -> RouteResponse:
    return RouteResponse(
        route_id=str(uuid4()),
        status="ready",
        message="개발용 직선 경로입니다. OSMnx 경로 계산으로 교체할 수 있습니다.",
        geometry=[payload.origin, payload.destination],
        distance_m=round(distance_meters(
            payload.origin.latitude,
            payload.origin.longitude,
            payload.destination.latitude,
            payload.destination.longitude,
        )),
        hazards_avoided=0,
        used_fallback_graph=True,
    )
