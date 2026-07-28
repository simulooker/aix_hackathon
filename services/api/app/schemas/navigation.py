from pydantic import BaseModel, Field


class Point(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class RouteRequest(BaseModel):
    origin: Point
    destination: Point
    prefer_safe_route: bool = True


class RouteResponse(BaseModel):
    route_id: str
    status: str
    message: str
