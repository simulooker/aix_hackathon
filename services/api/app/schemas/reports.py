from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.detection import Detection


class ReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    report_id: str
    status: str
    filename: str | None
    latitude: float
    longitude: float
    hazard_type: str | None = None
    confidence: float | None = None
    severity: float = 0
    overall_risk: str = "none"
    photo_path: str | None = None
    model_ready: bool
    walkway_detected: bool
    obstacles_detected: int
    obstacles_on_walkway: int
    detections: list[Detection]


class NearbyReport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    latitude: float
    longitude: float
    hazard_type: str | None
    confidence: float | None
    severity: float
    status: str
    created_at: datetime
