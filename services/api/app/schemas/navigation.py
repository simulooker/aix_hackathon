from typing import Literal

from pydantic import BaseModel, Field


class Point(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class RouteRequest(BaseModel):
    origin: Point
    destination: Point
    profile: Literal["general", "elderly", "wheelchair"] = "general"
    prefer_safe_route: bool = True


class RouteResponse(BaseModel):
    route_id: str
    status: str
    message: str
    geometry: list[Point]
    distance_m: float
    hazards_avoided: int
    used_fallback_graph: bool
