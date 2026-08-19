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
from sqlalchemy import or_
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
SINGLE_PHOTO_TRANSIENT_LABELS = frozenset(
    {"person", "motor_vehicle", "two_wheeler", "mobility_aid"}
)
DEMO_DISASTER_TAG = "TEST_DATA:GWANGJU_CITY_HALL_DISASTER:"
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

    on_walkway = [
        item
        for item in analysis["detections"]
        if item["on_walkway"] and item["risk"] != "none"
    ]
    # 한 장의 사진만으로는 사람·차량·자전거가 정지해 있는지 확인할 수 없다.
    # 따라서 일시적일 수 있는 객체는 분석 결과에는 보여 주되 공용 위험지도에는 저장하지 않는다.
    reportable_on_walkway = [
        item for item in on_walkway if item["label"] not in SINGLE_PHOTO_TRANSIENT_LABELS
    ]
    has_reportable_hazard = (
        analysis["walkway_detected"]
        and bool(reportable_on_walkway)
    )
    if not has_reportable_hazard:
        transient_only = bool(on_walkway) and not reportable_on_walkway
        return ReportResponse(
            report_id=None,
            status="not_saved",
            report_message=(
                "사람·차량·자전거처럼 일시적일 수 있는 대상만 감지되어 위험지도에는 저장하지 않았습니다."
                if transient_only
                else "보행을 방해하는 지속성 위험요소가 없어 사진과 위치를 저장하지 않았습니다."
            ),
            filename=image.filename,
            latitude=latitude,
            longitude=longitude,
            hazard_type=None,
            confidence=None,
            severity=0,
            overall_risk=analysis["overall_risk"] if transient_only else "none",
            photo_path=None,
            model_ready=analysis["model_ready"],
            walkway_detected=analysis["walkway_detected"],
            obstacles_detected=analysis["obstacles_detected"],
            obstacles_on_walkway=len(on_walkway),
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
        reportable_on_walkway,
        key=lambda item: RISK_SEVERITY[item["risk"]],
        default=None,
    )
    labels = sorted({item["label"] for item in reportable_on_walkway})
    report_risk = most_serious["risk"] if most_serious else "none"
    report = HazardReport(
        latitude=latitude,
        longitude=longitude,
        hazard_type=most_serious["label"],
        confidence=max(
            (item["confidence"] for item in reportable_on_walkway), default=None
        ),
        severity=RISK_SEVERITY[report_risk],
        overall_risk=report_risk,
        detected_labels=",".join(labels) or None,
        photo_path=photo_path,
        status="pending",
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return ReportResponse(
        report_id=report.id,
        status=report.status,
        report_message="검증 대기 중인 제보입니다. 다른 사용자가 확인하기 전에는 경로 계산에 반영되지 않습니다.",
        filename=image.filename,
        latitude=report.latitude,
        longitude=report.longitude,
        hazard_type=report.hazard_type,
        confidence=report.confidence,
        severity=report.severity,
        overall_risk=report.overall_risk,
        photo_path=report.photo_path,
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
            or_(
                HazardReport.detected_labels.is_(None),
                ~HazardReport.detected_labels.like(f"{DEMO_DISASTER_TAG}%"),
            ),
            HazardReport.latitude.between(lat - latitude_delta, lat + latitude_delta),
            HazardReport.longitude.between(
                lon - longitude_delta, lon + longitude_delta
            ),
        )
        .order_by(HazardReport.severity.desc(), HazardReport.created_at.desc())
        .limit(500)
        .all()
    )
