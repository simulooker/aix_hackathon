from math import cos, radians
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import Response
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.report import HazardReport
from app.models.user import User
from app.schemas.reports import NearbyReport, ReportResponse
from app.services.ai_service import AIModelUnavailable, get_ai_service
from app.services.storage_service import download_report_image, upload_report_image

router = APIRouter(prefix="/reports", tags=["reports"])
RISK_SEVERITY = {"none": 0.0, "low": 0.25, "medium": 0.6, "high": 1.0}
DatabaseSession = Annotated[Session, Depends(get_db)]
AuthenticatedUser = Annotated[User, Depends(get_current_user)]


@router.get("/{report_id}/image")
async def get_report_image(report_id: UUID, db: DatabaseSession) -> Response:
    report = db.get(HazardReport, report_id)
    if report is None or not report.photo_path:
        raise HTTPException(404, "제보 사진을 찾을 수 없습니다.")
    try:
        contents, content_type = await download_report_image(report.photo_path)
    except (httpx.HTTPError, RuntimeError) as exc:
        raise HTTPException(502, "제보 사진을 불러오지 못했습니다.") from exc
    return Response(content=contents, media_type=content_type)


@router.post("", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    image: Annotated[UploadFile, File()],
    latitude: Annotated[float, Form(ge=-90, le=90)],
    longitude: Annotated[float, Form(ge=-180, le=180)],
    db: DatabaseSession,
    _current_user: AuthenticatedUser,
) -> ReportResponse:
    if abs(latitude) < 0.000001 and abs(longitude) < 0.000001:
        raise HTTPException(422, "사진의 올바른 촬영 위치를 확인할 수 없습니다.")
    if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(415, "JPEG, PNG, WEBP 이미지만 업로드할 수 있습니다.")
    contents = await image.read(15 * 1024 * 1024 + 1)
    if len(contents) > 15 * 1024 * 1024:
        raise HTTPException(413, "이미지는 15MB 이하여야 합니다.")
    try:
        analysis = await run_in_threadpool(get_ai_service().analyze, contents)
    except AIModelUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc

    on_walkway = [item for item in analysis["detections"] if item["on_walkway"]]
    has_reportable_hazard = (
        analysis["walkway_detected"]
        and analysis["overall_risk"] != "none"
        and bool(on_walkway)
    )
    if not has_reportable_hazard:
        return ReportResponse(
            report_id=None,
            status="not_saved",
            filename=image.filename,
            latitude=latitude,
            longitude=longitude,
            hazard_type=None,
            confidence=None,
            severity=0,
            overall_risk="none",
            photo_path=None,
            is_active=True,
            model_ready=analysis["model_ready"],
            walkway_detected=analysis["walkway_detected"],
            obstacles_detected=analysis["obstacles_detected"],
            obstacles_on_walkway=0,
            detections=analysis["detections"],
        )

    try:
        photo_path = await upload_report_image(
            contents, image.content_type, image.filename
        )
    except httpx.HTTPError as exc:
        raise HTTPException(
            502,
            "제보 사진을 Supabase Storage에 저장하지 못했습니다. 버킷 설정을 확인해 주세요.",
        ) from exc

    most_serious = max(
        on_walkway, key=lambda item: RISK_SEVERITY[item["risk"]], default=None
    )
    labels = sorted({item["label"] for item in on_walkway})
    report = HazardReport(
        latitude=latitude,
        longitude=longitude,
        hazard_type=most_serious["label"],
        confidence=max((item["confidence"] for item in on_walkway), default=None),
        severity=RISK_SEVERITY[analysis["overall_risk"]],
        overall_risk=analysis["overall_risk"],
        detected_labels=",".join(labels) or None,
        photo_path=photo_path,
        status="verified",
        is_active=True,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return ReportResponse(
        report_id=report.id,
        status=report.status,
        filename=image.filename,
        latitude=report.latitude,
        longitude=report.longitude,
        hazard_type=report.hazard_type,
        confidence=report.confidence,
        severity=report.severity,
        overall_risk=report.overall_risk,
        photo_path=report.photo_path,
        is_active=report.is_active,
        model_ready=analysis["model_ready"],
        walkway_detected=analysis["walkway_detected"],
        obstacles_detected=analysis["obstacles_detected"],
        obstacles_on_walkway=analysis["obstacles_on_walkway"],
        detections=analysis["detections"],
    )


@router.get("/nearby", response_model=list[NearbyReport])
def get_nearby_reports(
    db: DatabaseSession,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_m: int = Query(800, ge=50, le=10_000),
) -> list[HazardReport]:
    latitude_delta = radius_m / 111_320
    longitude_delta = radius_m / max(1, 111_320 * cos(radians(lat)))
    return (
        db.query(HazardReport)
        .filter(
            HazardReport.status.in_(["verified", "pending"]),
            HazardReport.severity > 0,
            HazardReport.is_active.is_(True),
            HazardReport.latitude.between(lat - latitude_delta, lat + latitude_delta),
            HazardReport.longitude.between(
                lon - longitude_delta, lon + longitude_delta
            ),
        )
        .order_by(HazardReport.severity.desc(), HazardReport.created_at.desc())
        .limit(500)
        .all()
    )