from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.schemas.detection import Detection


class ReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    report_id: UUID | None = None
    status: str = "verified"
    is_active: bool = True
    filename: str | None = None
    latitude: float
    longitude: float
    heading_deg: float | None = None
    heading_accuracy: int | None = None
    hazard_type: str | None = None
    confidence: float | None = None
    severity: float = 0.0
    overall_risk: str = "none"
    photo_path: str | None = None
    model_ready: bool
    walkway_detected: bool
    obstacles_detected: int
    obstacles_on_walkway: int
    detections: list[Detection]


class NearbyReport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: str = "verified"
    is_active: bool = True
    latitude: float
    longitude: float
    heading_deg: float | None = None
    heading_accuracy: int | None = None
    hazard_type: str | None = None
    confidence: float | None = None
    severity: float
    created_at: datetime
    photo_path: str | None = None