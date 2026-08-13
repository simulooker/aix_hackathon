import logging
from math import cos, radians
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.db.session import get_db
from app.models.report import HazardReport
from app.schemas.navigation import RouteRequest, RouteResponse
from app.services.route_service import calculate_walking_route, distance_meters

router = APIRouter(prefix="/routes", tags=["routes"])
logger = logging.getLogger(__name__)
DatabaseSession = Annotated[Session, Depends(get_db)]


@router.post("", response_model=RouteResponse)
async def create_route(payload: RouteRequest, db: DatabaseSession) -> RouteResponse:
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
        result = await run_in_threadpool(
            calculate_walking_route,
            payload.origin,
            payload.destination,
            hazards,
            payload.profile,
            payload.prefer_safe_route,
        )
        return RouteResponse(
            route_id=str(uuid4()),
            status="ready",
            message="OpenStreetMap 보행로를 이용해 계산한 경로입니다.",
            geometry=result.geometry,
            distance_m=result.distance_m,
            hazards_avoided=result.hazards_avoided,
            used_fallback_graph=False,
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
            used_fallback_graph=True,
        )
