from pydantic import BaseModel


class Detection(BaseModel):
    label: str
    confidence: float


class DetectionResponse(BaseModel):
    filename: str | None
    model_ready: bool
    detections: list[Detection]
