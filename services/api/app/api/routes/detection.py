from fastapi import APIRouter, File, UploadFile

from app.schemas.detection import DetectionResponse

router = APIRouter(prefix="/detections", tags=["detections"])


@router.post("", response_model=DetectionResponse)
async def detect_hazard(image: UploadFile = File(...)) -> DetectionResponse:
    """Placeholder endpoint for the lightweight YOLO model."""
    return DetectionResponse(
        filename=image.filename,
        model_ready=False,
        detections=[],
    )
