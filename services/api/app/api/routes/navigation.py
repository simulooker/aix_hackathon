from uuid import uuid4

from fastapi import APIRouter, HTTPException

from app.schemas.navigation import Point, RouteRequest, RouteResponse
from app.services.route_service import RoutePoint, calculate_safe_route

router = APIRouter(prefix="/routes", tags=["routes"])


@router.post("", response_model=RouteResponse)
async def create_route(payload: RouteRequest) -> RouteResponse:
    try:
        result = await calculate_safe_route(
            origin=RoutePoint(payload.origin.latitude, payload.origin.longitude),
            destination=RoutePoint(payload.destination.latitude, payload.destination.longitude),
            profile=payload.profile,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"경로를 계산하지 못했습니다: {exc}") from exc

    return RouteResponse(
        route_id=str(uuid4()),
        status="ready",
        message="안심 우회 경로를 계산했습니다.",
        geometry=[Point(latitude=p.latitude, longitude=p.longitude) for p in result.points],
        distance_m=result.distance_m,
        hazards_avoided=result.hazards_avoided,
        used_fallback_graph=result.used_fallback_graph,
    )
