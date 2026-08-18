import logging
from math import cos, radians
from time import perf_counter
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.db.session import get_db
from app.models.report import HazardReport
from app.schemas.navigation import (
    RoadRouteRequest,
    RoadRouteResponse,
    RouteRequest,
    RouteResponse,
)
from app.services.environment_service import fetch_disaster_zones, route_bbox
from app.services.route_service import (
    calculate_road_route,
    calculate_walking_route,
    distance_meters,
)

router = APIRouter(prefix="/routes", tags=["routes"])
logger = logging.getLogger(__name__)
DatabaseSession = Annotated[Session, Depends(get_db)]


@router.post("/road", response_model=RoadRouteResponse)
async def create_road_route(payload: RoadRouteRequest) -> RoadRouteResponse:
    try:
        result = await run_in_threadpool(calculate_road_route, payload.points)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Road-route calculation failed")
        raise HTTPException(
            status_code=502,
            detail="버스 구간의 실제 도로 경로를 계산하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        ) from exc
    return RoadRouteResponse(geometry=result.geometry, distance_m=result.distance_m)


@router.post("", response_model=RouteResponse)
async def create_route(payload: RouteRequest, db: DatabaseSession) -> RouteResponse:
    request_started = perf_counter()
    try:
        center_latitude = (payload.origin.latitude + payload.destination.latitude) / 2
        center_longitude = (
            payload.origin.longitude + payload.destination.longitude
        ) / 2
        search_radius = (
            distance_meters(
                payload.origin.latitude,
                payload.origin.longitude,
                payload.destination.latitude,
                payload.destination.longitude,
            )
            / 2
            + 800
        )
        latitude_delta = search_radius / 111_320
        longitude_delta = search_radius / max(
            1, 111_320 * cos(radians(center_latitude))
        )
        try:
            hazards = (
                db.query(HazardReport)
                .filter(
                    HazardReport.status.in_(["verified", "pending"]),
                    HazardReport.severity > 0,
                    HazardReport.latitude.between(
                        center_latitude - latitude_delta,
                        center_latitude + latitude_delta,
                    ),
                    HazardReport.longitude.between(
                        center_longitude - longitude_delta,
                        center_longitude + longitude_delta,
                    ),
                )
                .limit(500)
                .all()
            )
        except SQLAlchemyError:
            db.rollback()
            logger.exception(
                "Hazard lookup failed; calculating the real walking route without hazard weights"
            )
            hazards = []
        hazard_lookup_finished = perf_counter()
        disaster_zones = await fetch_disaster_zones(
            *route_bbox(
                payload.origin.latitude,
                payload.origin.longitude,
                payload.destination.latitude,
                payload.destination.longitude,
            )
        )
        disaster_lookup_finished = perf_counter()
        result = await run_in_threadpool(
            calculate_walking_route,
            payload.origin,
            payload.destination,
            hazards,
            payload.profile,
            payload.prefer_safe_route,
            disaster_zones,
        )
        route_finished = perf_counter()
        logger.info(
            "Walking route timings hazards=%.3fs disasters=%.3fs ors=%.3fs total=%.3fs hazard_count=%s profile=%s",
            hazard_lookup_finished - request_started,
            disaster_lookup_finished - hazard_lookup_finished,
            route_finished - disaster_lookup_finished,
            route_finished - request_started,
            len(hazards),
            payload.profile,
        )
        return RouteResponse(
            route_id=str(uuid4()),
            status="fallback" if result.used_fallback else "ready",
            message=(
                "실제 보행 경로를 찾지 못했습니다. 출발지나 목적지를 가까운 보행로 쪽으로 다시 선택해 주세요."
                if result.used_fallback
                else "최단 보행 경로와 위험도를 함께 비교해 계산한 경로입니다."
            ),
            geometry=result.geometry,
            distance_m=result.distance_m,
            hazards_avoided=result.hazards_avoided,
            hazards_on_route=list(result.hazards_on_route),
            used_fallback_graph=result.used_fallback,
            ascent_m=result.ascent_m,
            descent_m=result.descent_m,
            max_grade_percent=result.max_grade_percent,
            slope_segments=list(result.slope_segments),
            disaster_zones_avoided=result.disaster_zones_avoided,
            disaster_zones=list(result.disaster_zones),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        logger.exception(
            "Walking-route calculation failed; returning a direct fallback route"
        )
        return RouteResponse(
            route_id=str(uuid4()),
            status="fallback",
            message="도로망을 불러오지 못해 임시 직선 경로를 표시합니다.",
            geometry=[payload.origin, payload.destination],
            distance_m=round(
                distance_meters(
                    payload.origin.latitude,
                    payload.origin.longitude,
                    payload.destination.latitude,
                    payload.destination.longitude,
                )
            ),
            hazards_avoided=0,
            hazards_on_route=[],
            used_fallback_graph=True,
            ascent_m=0,
            descent_m=0,
            max_grade_percent=0,
            slope_segments=[],
            disaster_zones_avoided=0,
            disaster_zones=[],
        )
