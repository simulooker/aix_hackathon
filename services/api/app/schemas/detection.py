from pydantic import BaseModel


class Detection(BaseModel):
    label: str
    confidence: float
    area_ratio: float
    severity: float


class DetectionResponse(BaseModel):
    filename: str | None
    model_ready: bool
    detections: list[Detection]
    max_severity: float
    slope_risk: float
