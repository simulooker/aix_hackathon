from fastapi import APIRouter, File, UploadFile

from app.schemas.detection import Detection, DetectionResponse
from app.services.ai_service import get_hazard_detector

router = APIRouter(prefix="/detections", tags=["detections"])


@router.post("", response_model=DetectionResponse)
async def detect_hazard(image: UploadFile = File(...)) -> DetectionResponse:
    image_bytes = await image.read()
    result = get_hazard_detector().detect(image_bytes)

    return DetectionResponse(
        filename=image.filename,
        model_ready=result.model_ready,
        detections=[
            Detection(
                label=d.label,
                confidence=d.confidence,
                area_ratio=d.area_ratio,
                severity=d.severity,
            )
            for d in result.detections
        ],
        max_severity=result.max_severity,
        slope_risk=result.slope_risk,
    )
