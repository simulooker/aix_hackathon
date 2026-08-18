from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.environment import DisasterZone

from app.schemas.reports import NearbyReport


class Point(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    elevation: float | None = None


class SlopeSegment(BaseModel):
    start_index: int
    end_index: int
    grade_percent: float
    level: Literal["moderate", "steep", "very_steep"]


class RouteRequest(BaseModel):
    origin: Point
    destination: Point
    prefer_safe_route: bool = True
    profile: Literal["general", "elderly", "wheelchair"] = "general"


class RoadRouteRequest(BaseModel):
    points: list[Point] = Field(min_length=2, max_length=25)


class RoadRouteResponse(BaseModel):
    geometry: list[Point]
    distance_m: float


class RouteResponse(BaseModel):
    route_id: str
    status: str
    message: str
    geometry: list[Point]
    distance_m: float
    hazards_avoided: int
    hazards_on_route: list[NearbyReport] = Field(default_factory=list)
    used_fallback_graph: bool
    ascent_m: float = 0
    descent_m: float = 0
    max_grade_percent: float = 0
    slope_segments: list[SlopeSegment] = Field(default_factory=list)
    disaster_zones_avoided: int = 0
    disaster_zones: list[DisasterZone] = Field(default_factory=list)
