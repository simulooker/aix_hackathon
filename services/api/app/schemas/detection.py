from typing import Literal

from pydantic import BaseModel, Field

RiskLevel = Literal["none", "low", "medium", "high"]


class Detection(BaseModel):
    label: str
    confidence: float = Field(ge=0, le=1)
    box: tuple[float, float, float, float]
    blocked_walkway_ratio: float = Field(ge=0, le=1)
    remaining_walkway_image_ratio: float = Field(ge=0, le=1)
    proximity: float = Field(default=1, ge=0, le=1)
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
