from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, File, Form, Query, UploadFile, status

from app.schemas.reports import ReportResponse

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("", response_model=ReportResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_report(
    image: Annotated[UploadFile, File()],
    latitude: Annotated[float, Form()],
    longitude: Annotated[float, Form()],
) -> ReportResponse:
    """Accept a photo report. Storage and AI inference are added next."""
    return ReportResponse(
        report_id=str(uuid4()),
        status="pending",
        filename=image.filename,
        latitude=latitude,
        longitude=longitude,
    )


# 🎯 새로 추가된 GET /reports/nearby 엔드포인트
@router.get("/nearby")
async def get_nearby_reports(
    lat: float = Query(..., description="위도"),
    lon: float = Query(..., description="경도"),
    radius_m: int = Query(800, description="검색 반경(m)"),
):
    """주변 위험 제보 목록 조회 (임시 더미 데이터 반환)"""
    return [
        {
            "report_id": str(uuid4()),
            "status": "processed",
            "latitude": lat + 0.001,
            "longitude": lon + 0.001,
            "hazard_type": "pothole",
            "description": "보도블록 파손 위험 지역",
        }
    ]