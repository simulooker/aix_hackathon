from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.schemas.detection import DetectionResponse
from app.services.ai_service import AIModelUnavailable, get_ai_service

router = APIRouter(prefix="/detections", tags=["detections"])


@router.post("", response_model=DetectionResponse)
async def detect_hazard(image: Annotated[UploadFile, File()]) -> DetectionResponse:
    if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(415, "JPEG, PNG, WEBP 이미지만 업로드할 수 있습니다.")
    contents = await image.read(15 * 1024 * 1024 + 1)
    if len(contents) > 15 * 1024 * 1024:
        raise HTTPException(413, "이미지는 15MB 이하여야 합니다.")
    try:
        result = await run_in_threadpool(get_ai_service().analyze, contents)
    except AIModelUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return DetectionResponse(filename=image.filename, **result)
