from typing import Literal

from fastapi import APIRouter, Query

from app.core.config import settings
from app.schemas.environment import EnvironmentContext
from app.schemas.environment import DisasterZone
from app.services.environment_service import fetch_disaster_zones, fetch_weather, route_bbox

router = APIRouter(prefix="/environment", tags=["environment"])


@router.get("/context", response_model=EnvironmentContext)
async def environment_context(
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
    return EnvironmentContext(
        weather=weather,
        disasters=disasters,
        disaster_feed_configured=bool(
            settings.disaster_api_url and settings.disaster_api_key
        ),
    )


@router.get("/route-disasters", response_model=list[DisasterZone])
async def route_disasters(
    origin_lat: float = Query(ge=-90, le=90),
    origin_lon: float = Query(ge=-180, le=180),
    destination_lat: float = Query(ge=-90, le=90),
    destination_lon: float = Query(ge=-180, le=180),
) -> list[DisasterZone]:
    """출발지와 목적지를 포함하는 회랑의 실시간 재난·통제 구간."""
    return await fetch_disaster_zones(
        *route_bbox(origin_lat, origin_lon, destination_lat, destination_lon)
    )
