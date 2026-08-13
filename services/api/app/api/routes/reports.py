from math import cos, radians
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.db.session import get_db
from app.models.report import HazardReport
from app.schemas.reports import NearbyReport, ReportResponse
from app.services.ai_service import AIModelUnavailable, get_ai_service
from app.services.storage_service import upload_report_image

router = APIRouter(prefix="/reports", tags=["reports"])
RISK_SEVERITY = {"none": 0.0, "low": 0.25, "medium": 0.6, "high": 1.0}


@router.post("", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    image: Annotated[UploadFile, File()],
    latitude: Annotated[float, Form(ge=-90, le=90)],
    longitude: Annotated[float, Form(ge=-180, le=180)],
    db: Session = Depends(get_db),
) -> ReportResponse:
    if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(415, "JPEG, PNG, WEBP 이미지만 업로드할 수 있습니다.")
    contents = await image.read(15 * 1024 * 1024 + 1)
    if len(contents) > 15 * 1024 * 1024:
        raise HTTPException(413, "이미지는 15MB 이하여야 합니다.")
    try:
        analysis = await run_in_threadpool(get_ai_service().analyze, contents)
        photo_path = await upload_report_image(contents, image.content_type, image.filename)
    except AIModelUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(502, "제보 사진을 Supabase Storage에 저장하지 못했습니다. 버킷 설정을 확인해 주세요.") from exc

    on_walkway = [item for item in analysis["detections"] if item["on_walkway"]]
    most_serious = max(on_walkway, key=lambda item: RISK_SEVERITY[item["risk"]], default=None)
    labels = sorted({item["label"] for item in on_walkway})
    report = HazardReport(
        latitude=latitude,
        longitude=longitude,
        hazard_type=most_serious["label"] if most_serious else None,
        confidence=max((item["confidence"] for item in on_walkway), default=None),
        severity=RISK_SEVERITY[analysis["overall_risk"]],
        overall_risk=analysis["overall_risk"],
        detected_labels=",".join(labels) or None,
        photo_path=photo_path,
        status="verified",
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return ReportResponse(
        report_id=report.id, status=report.status, filename=image.filename,
        latitude=report.latitude, longitude=report.longitude, hazard_type=report.hazard_type,
        confidence=report.confidence, severity=report.severity, overall_risk=report.overall_risk,
        photo_path=report.photo_path,
        model_ready=analysis["model_ready"], walkway_detected=analysis["walkway_detected"],
        obstacles_detected=analysis["obstacles_detected"], obstacles_on_walkway=analysis["obstacles_on_walkway"],
        detections=analysis["detections"],
    )


@router.get("/nearby", response_model=list[NearbyReport])
def get_nearby_reports(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_m: int = Query(800, ge=50, le=10_000),
    db: Session = Depends(get_db),
) -> list[HazardReport]:
    latitude_delta = radius_m / 111_320
    longitude_delta = radius_m / max(1, 111_320 * cos(radians(lat)))
    return (
        db.query(HazardReport)
        .filter(
            HazardReport.status.in_(["verified", "pending"]),
            HazardReport.severity > 0,
            HazardReport.latitude.between(lat - latitude_delta, lat + latitude_delta),
            HazardReport.longitude.between(lon - longitude_delta, lon + longitude_delta),
        )
        .order_by(HazardReport.severity.desc(), HazardReport.created_at.desc())
        .limit(500)
        .all()
    )
