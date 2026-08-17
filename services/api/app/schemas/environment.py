from typing import Literal

from pydantic import BaseModel, Field


class WeatherAlert(BaseModel):
    level: Literal["info", "warning", "danger"]
    title: str
    message: str


class WeatherContext(BaseModel):
    temperature_c: float | None = None
    apparent_temperature_c: float | None = None
    precipitation_mm: float = 0
    weather_code: int | None = None
    alerts: list[WeatherAlert] = Field(default_factory=list)
    source: str = "Open-Meteo"


class DisasterZone(BaseModel):
    id: str
    kind: Literal["flood", "landslide", "road_control", "other"]
    title: str
    description: str = ""
    road_name: str | None = None
    latitude: float
    longitude: float
    radius_m: float = 80
    severity: float = 1.0


class EnvironmentContext(BaseModel):
    weather: WeatherContext | None = None
    disasters: list[DisasterZone] = Field(default_factory=list)
    disaster_feed_configured: bool = False

