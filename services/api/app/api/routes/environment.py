from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.schemas.environment import EnvironmentContext
from app.schemas.environment import DisasterZone
from app.services.environment_service import fetch_disaster_zones, fetch_weather, route_bbox
from app.services.seeded_disaster_service import get_seeded_disaster_zones

router = APIRouter(prefix="/environment", tags=["environment"])
DatabaseSession = Annotated[Session, Depends(get_db)]


@router.get("/context", response_model=EnvironmentContext)
async def environment_context(
    db: DatabaseSession,
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
    profile: Literal["general", "elderly", "wheelchair"] = "general",
    radius_m: int = Query(1500, ge=200, le=10_000),
) -> EnvironmentContext:
    latitude_delta = radius_m / 111_320
    longitude_delta = radius_m / 91_000
    weather = await fetch_weather(lat, lon, profile)
    disasters = await fetch_disaster_zones(
        lat - latitude_delta,
        lon - longitude_delta,
        lat + latitude_delta,
        lon + longitude_delta,
    )
    disasters.extend(
        get_seeded_disaster_zones(
            db,
            lat - latitude_delta,
            lon - longitude_delta,
            lat + latitude_delta,
            lon + longitude_delta,
        )
    )
    return EnvironmentContext(
        weather=weather,
        disasters=disasters,
        disaster_feed_configured=bool(
            settings.disaster_api_url and settings.disaster_api_key
        ),
    )


@router.get("/route-disasters", response_model=list[DisasterZone])
async def route_disasters(
    db: DatabaseSession,
    origin_lat: float = Query(ge=-90, le=90),
    origin_lon: float = Query(ge=-180, le=180),
    destination_lat: float = Query(ge=-90, le=90),
    destination_lon: float = Query(ge=-180, le=180),
) -> list[DisasterZone]:
    """출발지와 목적지를 포함하는 회랑의 실시간 재난·통제 구간."""
    bounds = route_bbox(origin_lat, origin_lon, destination_lat, destination_lon)
    disasters = await fetch_disaster_zones(*bounds)
    disasters.extend(get_seeded_disaster_zones(db, *bounds))
    return disasters
