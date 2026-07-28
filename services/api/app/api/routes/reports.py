from uuid import uuid4

from fastapi import APIRouter, File, Form, UploadFile, status

from app.schemas.reports import ReportResponse

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("", response_model=ReportResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_report(
    image: UploadFile = File(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
) -> ReportResponse:
    """Accept a photo report. Storage and AI inference are added next."""
    return ReportResponse(
        report_id=str(uuid4()),
        status="pending",
        filename=image.filename,
        latitude=latitude,
        longitude=longitude,
    )
