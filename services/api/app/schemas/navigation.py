from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.reports import NearbyReport


class Point(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class RouteRequest(BaseModel):
    origin: Point
    destination: Point
    prefer_safe_route: bool = True
    profile: Literal["general", "elderly", "wheelchair"] = "general"


class RouteResponse(BaseModel):
    route_id: str
    status: str
    message: str
    geometry: list[Point]
    distance_m: float
    hazards_avoided: int
    hazards_on_route: list[NearbyReport] = Field(default_factory=list)
    used_fallback_graph: bool
