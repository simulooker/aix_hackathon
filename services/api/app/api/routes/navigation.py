from uuid import uuid4

from fastapi import APIRouter, status

from app.schemas.navigation import RouteRequest, RouteResponse

router = APIRouter(prefix="/routes", tags=["routes"])


@router.post("", response_model=RouteResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_route(payload: RouteRequest) -> RouteResponse:
    """Accept a route request. OSMnx/NetworkX calculation is added next."""
    return RouteResponse(
        route_id=str(uuid4()),
        status="pending",
        message="경로 계산 기능을 연결할 준비가 되었습니다.",
    )
