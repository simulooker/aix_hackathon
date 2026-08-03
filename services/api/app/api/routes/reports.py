from fastapi import APIRouter, File, Form, Query, UploadFile, status

from app.schemas.reports import HazardReportOut, ReportResponse
from app.services import storage_service
from app.services.ai_service import get_hazard_detector

router = APIRouter(prefix="/reports", tags=["reports"])

# Reports whose AI-judged severity clears this bar are surfaced immediately
# (실시간성) instead of waiting on manual verification.
_AUTO_VERIFY_SEVERITY = 0.5


@router.post("", response_model=ReportResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_report(
    image: UploadFile = File(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
) -> ReportResponse:
    image_bytes = await image.read()
    detection = get_hazard_detector().detect(image_bytes)
    top = max(detection.detections, key=lambda d: d.severity, default=None)

    report_status = "verified" if detection.max_severity >= _AUTO_VERIFY_SEVERITY else "pending"

    report = await storage_service.save_report(
        image_bytes=image_bytes,
        filename=image.filename,
        latitude=latitude,
        longitude=longitude,
        hazard_type=top.label if top else None,
        confidence=top.confidence if top else None,
        severity=detection.max_severity,
        status=report_status,
    )

    return ReportResponse(
        report_id=report.id,
        status=report.status,
        filename=image.filename,
        latitude=latitude,
        longitude=longitude,
        hazard_type=report.hazard_type,
        confidence=report.confidence,
        severity=report.severity,
    )


@router.get("/nearby", response_model=list[HazardReportOut])
async def list_nearby_reports(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_m: float = Query(500, gt=0, le=5000),
) -> list[HazardReportOut]:
    reports = await storage_service.get_nearby_reports(lat, lon, radius_m)
    return [
        HazardReportOut(
            id=r.id,
            latitude=r.latitude,
            longitude=r.longitude,
            hazard_type=r.hazard_type,
            confidence=r.confidence,
            severity=r.severity,
            status=r.status,
            created_at=r.created_at,
        )
        for r in reports
    ]
