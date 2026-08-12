from typing import Literal

from pydantic import BaseModel

RiskLevel = Literal["none", "low", "medium", "high"]


class Detection(BaseModel):
    label: str
    confidence: float
    box: tuple[float, float, float, float]
    blocked_walkway_ratio: float
    remaining_walkway_image_ratio: float
    on_walkway: bool
    risk: RiskLevel


class DetectionResponse(BaseModel):
    filename: str | None
    model_ready: bool
    walkway_detected: bool
    overall_risk: RiskLevel
    obstacles_detected: int
    obstacles_on_walkway: int
    detections: list[Detection]
