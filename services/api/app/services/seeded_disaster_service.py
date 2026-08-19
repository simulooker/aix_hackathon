from sqlalchemy.orm import Session

from app.models.report import HazardReport
from app.schemas.environment import DisasterZone

DEMO_DISASTER_TAG = "TEST_DATA:GWANGJU_CITY_HALL_DISASTER:"

_DISASTER_PRESENTATION = {
    "demo_disaster_flood": ("flood", "시연용 침수 통제 구간"),
    "demo_disaster_road_control": ("road_control", "시연용 도로 통제 구간"),
    "demo_disaster_landslide": ("landslide", "시연용 토사 유입 통제 구간"),
}


def get_seeded_disaster_zones(
    db: Session,
    min_latitude: float,
    min_longitude: float,
    max_latitude: float,
    max_longitude: float,
) -> list[DisasterZone]:
    """DB에 명시적으로 넣은 시연용 재난 지점을 재난 회피 입력으로 변환한다."""
    reports = (
        db.query(HazardReport)
        .filter(
            HazardReport.status == "verified",
            HazardReport.detected_labels.like(f"{DEMO_DISASTER_TAG}%"),
            HazardReport.latitude.between(min_latitude, max_latitude),
            HazardReport.longitude.between(min_longitude, max_longitude),
        )
        .all()
    )
    zones: list[DisasterZone] = []
    for report in reports:
        presentation = _DISASTER_PRESENTATION.get(report.hazard_type or "")
        if presentation is None:
            continue
        kind, title = presentation
        zones.append(
            DisasterZone(
                id=f"seeded-{report.id}",
                kind=kind,
                title=title,
                description="광주광역시청 주변 경로 테스트를 위한 임시 데이터입니다.",
                road_name="광주광역시청 주변 도로",
                latitude=report.latitude,
                longitude=report.longitude,
                radius_m=18,
                severity=report.severity,
            )
        )
    return zones
