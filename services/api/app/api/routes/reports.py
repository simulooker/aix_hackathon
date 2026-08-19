from datetime import datetime, timedelta, timezone
from math import asin, cos, radians, sin, sqrt
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
TRANSIENT_HAZARD_LABELS = {"motor_vehicle", "two_wheeler"}
ROUTING_ONLY_HAZARD_LABELS = {"stairs"}

# 시간 정책: 1회당 6시간, 48시간(2일) 이상 누적 시 영구 위험 전환
BASE_HOURS = 6
PERMANENT_HOURS = 48
SEARCH_RADIUS_M = 10.0

DatabaseSession = Annotated[Session, Depends(get_db)]
AuthenticatedUser = Annotated[User, Depends(get_current_user)]


def _distance_meters(
    first_latitude: float,
    first_longitude: float,
    second_latitude: float,
    second_longitude: float,
) -> float:
    latitude_delta = radians(second_latitude - first_latitude)
    longitude_delta = radians(second_longitude - first_longitude)
    first_latitude_radians = radians(first_latitude)
    second_latitude_radians = radians(second_latitude)
    value = sin(latitude_delta / 2) ** 2 + (
        cos(first_latitude_radians)
        * cos(second_latitude_radians)
        * sin(longitude_delta / 2) ** 2
    )
    return 6_371_000 * 2 * asin(sqrt(value))


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
    heading_deg: Annotated[float | None, Form(ge=0, lt=360)] = None,
    heading_accuracy: Annotated[int | None, Form(ge=0, le=3)] = None,
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

    reportable_on_walkway = [
        item
        for item in analysis["detections"]
        if item["on_walkway"]
        and (
            item["risk"] != "none"
            or item["label"] in ROUTING_ONLY_HAZARD_LABELS
        )
    ]
    has_reportable_hazard = (
        analysis["walkway_detected"]
        and bool(reportable_on_walkway)
        and (
            analysis["overall_risk"] != "none"
            or any(
                item["label"] in ROUTING_ONLY_HAZARD_LABELS
                for item in reportable_on_walkway
            )
        )
    )
    if not has_reportable_hazard:
        return ReportResponse(
            report_id=None,
            status="not_saved",
            is_active=False,
            filename=image.filename,
            latitude=latitude,
            longitude=longitude,
            heading_deg=heading_deg,
            heading_accuracy=heading_accuracy,
            hazard_type=None,
            confidence=None,
            severity=0,
            overall_risk="none",
            photo_path=None,
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
        reportable_on_walkway,
        key=lambda item: RISK_SEVERITY[item["risk"]],
        default=None,
    )
    labels = sorted({item["label"] for item in reportable_on_walkway})
    stored_severity = max(
        RISK_SEVERITY[analysis["overall_risk"]],
        0.25 if set(labels) & ROUTING_ONLY_HAZARD_LABELS else 0.0,
    )

    is_severity_sufficient = (
        stored_severity >= 0.25 or bool(set(labels) & ROUTING_ONLY_HAZARD_LABELS)
    )
    is_active = is_severity_sufficient

    primary_hazard = most_serious["label"] if most_serious else None
    now = datetime.now(timezone.utc)

    # 1. 동일 위치(10m 이내)에 활성화되어 있는 이전 제보 검색
    latitude_delta = SEARCH_RADIUS_M / 111_320
    longitude_delta = SEARCH_RADIUS_M / max(1, 111_320 * cos(radians(latitude)))

    nearby_active_reports = (
        db.query(HazardReport)
        .filter(
            HazardReport.is_active.is_(True),
            HazardReport.latitude.between(latitude - latitude_delta, latitude + latitude_delta),
            HazardReport.longitude.between(longitude - longitude_delta, longitude + longitude_delta),
        )
        .all()
    )

    matching_existing_report: HazardReport | None = None
    for old_rep in nearby_active_reports:
        if _distance_meters(latitude, longitude, old_rep.latitude, old_rep.longitude) <= SEARCH_RADIUS_M:
            matching_existing_report = old_rep
            # 과거 제보는 지도에 중복으로 뜨지 않도록 비활성화
            old_rep.is_active = False

    # 2. 이동성 장애물(차량/오토바이) 시간 및 누적 처리
    report_count = 1
    expires_at = None

    if primary_hazard in TRANSIENT_HAZARD_LABELS:
        if matching_existing_report and matching_existing_report.hazard_type in TRANSIENT_HAZARD_LABELS:
            prev_count = getattr(matching_existing_report, "report_count", 1) or 1
            report_count = prev_count + 1
            total_hours = BASE_HOURS * report_count

            if total_hours >= PERMANENT_HOURS:
                # 48시간 이상 누적: 영구 위험으로 전환 (만료 없음)
                expires_at = None
            else:
                # 48시간 미만: 현재 시각 기준 시간 연장
                expires_at = now + timedelta(hours=total_hours)
        else:
            # 최초 제보: 기본 6시간 부여
            expires_at = now + timedelta(hours=BASE_HOURS)
    else:
        # 고정 장애물/계단: 시간제한 없음 (영구)
        expires_at = None

    # 3. 신규 제보 레코드 생성
    report_kwargs = {
        "latitude": latitude,
        "longitude": longitude,
        "heading_deg": heading_deg,
        "heading_accuracy": heading_accuracy,
        "hazard_type": primary_hazard,
        "confidence": max(
            (item["confidence"] for item in reportable_on_walkway), default=None
        ),
        "severity": stored_severity,
        "overall_risk": analysis["overall_risk"],
        "detected_labels": ",".join(labels) or None,
        "photo_path": photo_path,
        "status": "verified",
        "is_active": is_active,
    }

    # Model 컬럼에 report_count, expires_at이 정의되어 있는 경우 세팅
    if hasattr(HazardReport, "report_count"):
        report_kwargs["report_count"] = report_count
    if hasattr(HazardReport, "expires_at"):
        report_kwargs["expires_at"] = expires_at

    report = HazardReport(**report_kwargs)
    db.add(report)
    db.commit()
    db.refresh(report)

    return ReportResponse(
        report_id=report.id,
        status=report.status,
        is_active=report.is_active,
        filename=image.filename,
        latitude=report.latitude,
        longitude=report.longitude,
        heading_deg=report.heading_deg,
        heading_accuracy=report.heading_accuracy,
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
    now = datetime.now(timezone.utc)

    query = (
        db.query(HazardReport)
        .filter(
            HazardReport.status.in_(["verified", "pending"]),
            HazardReport.is_active.is_(True),
            HazardReport.severity > 0,
            HazardReport.latitude.between(lat - latitude_delta, lat + latitude_delta),
            HazardReport.longitude.between(
                lon - longitude_delta, lon + longitude_delta
            ),
        )
    )

    # expires_at 컬럼이 존재하는 경우 만료 시각(TTL) 필터링 적용
    if hasattr(HazardReport, "expires_at"):
        query = query.filter(
            (HazardReport.expires_at.is_(None)) | (HazardReport.expires_at >= now)
        )

    return (
        query.order_by(HazardReport.severity.desc(), HazardReport.created_at.desc())
        .limit(500)
        .all()
    )