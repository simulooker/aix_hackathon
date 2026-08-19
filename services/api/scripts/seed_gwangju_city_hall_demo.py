"""광주광역시청 주변 실제 도로 위에 경로 시연용 위험·재난 데이터를 넣거나 삭제한다."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from uuid import NAMESPACE_URL, UUID, uuid5

from app.db.session import SessionLocal
from app.models.report import HazardReport

HAZARD_TAG = "TEST_DATA:GWANGJU_CITY_HALL_HAZARD:"
DISASTER_TAG = "TEST_DATA:GWANGJU_CITY_HALL_DISASTER:"


@dataclass(frozen=True)
class DemoPoint:
    key: str
    latitude: float
    longitude: float
    hazard_type: str
    severity: float
    overall_risk: str
    tag: str = HAZARD_TAG

    @property
    def id(self) -> UUID:
        return uuid5(NAMESPACE_URL, f"withyou:gwangju-city-hall-demo:{self.key}")


# OpenStreetMap의 광주광역시청 주변 highway 선 위에서 고른 좌표다.
# 시청 건물 내부가 아니라 북측·동서 방향의 도로와 보행 가능한 연결로에 놓인다.
DEMO_POINTS = (
    DemoPoint("hazard-low-01", 35.160487, 126.850550, "fixed_obstacle", 0.22, "low"),
    DemoPoint("hazard-low-02", 35.160488, 126.850750, "movable_obstacle", 0.26, "low"),
    DemoPoint("hazard-low-03", 35.160490, 126.850950, "fixed_obstacle", 0.30, "low"),
    DemoPoint("hazard-low-04", 35.160492, 126.851150, "movable_obstacle", 0.34, "low"),
    DemoPoint("hazard-low-05", 35.160494, 126.851350, "fixed_obstacle", 0.38, "low"),
    DemoPoint("hazard-medium-01", 35.160496, 126.851550, "movable_obstacle", 0.46, "medium"),
    DemoPoint("hazard-medium-02", 35.160497, 126.851750, "fixed_obstacle", 0.52, "medium"),
    DemoPoint("hazard-medium-03", 35.160499, 126.851950, "movable_obstacle", 0.58, "medium"),
    DemoPoint("hazard-medium-04", 35.160500, 126.852150, "fixed_obstacle", 0.63, "medium"),
    DemoPoint("hazard-medium-05", 35.160501, 126.852350, "movable_obstacle", 0.68, "medium"),
    DemoPoint("hazard-high-01", 35.160740, 126.851600, "fixed_obstacle", 0.76, "high"),
    DemoPoint("hazard-high-02", 35.160741, 126.851350, "movable_obstacle", 0.81, "high"),
    DemoPoint("hazard-high-03", 35.160742, 126.851100, "fixed_obstacle", 0.86, "high"),
    DemoPoint("hazard-high-04", 35.160741, 126.850950, "movable_obstacle", 0.91, "high"),
    DemoPoint("hazard-high-05", 35.160735, 126.852050, "fixed_obstacle", 0.96, "high"),
    DemoPoint(
        "disaster-flood-01",
        35.160489,
        126.850650,
        "demo_disaster_flood",
        1.0,
        "high",
        DISASTER_TAG,
    ),
    DemoPoint(
        "disaster-control-01",
        35.160493,
        126.851250,
        "demo_disaster_road_control",
        1.0,
        "high",
        DISASTER_TAG,
    ),
    DemoPoint(
        "disaster-flood-02",
        35.160498,
        126.851850,
        "demo_disaster_flood",
        1.0,
        "high",
        DISASTER_TAG,
    ),
    DemoPoint(
        "disaster-control-02",
        35.160501,
        126.852250,
        "demo_disaster_road_control",
        1.0,
        "high",
        DISASTER_TAG,
    ),
    DemoPoint(
        "disaster-landslide-01",
        35.160741,
        126.851050,
        "demo_disaster_landslide",
        1.0,
        "high",
        DISASTER_TAG,
    ),
)


def _remove_legacy_jnu_points(session) -> int:
    return (
        session.query(HazardReport)
        .filter(HazardReport.detected_labels.like("TEST_DATA:JNU_YONGBONG%"))
        .delete(synchronize_session=False)
    )


def upsert() -> None:
    created = 0
    updated = 0
    with SessionLocal() as session:
        removed_legacy = _remove_legacy_jnu_points(session)
        for item in DEMO_POINTS:
            report = session.get(HazardReport, item.id)
            if report is None:
                report = HazardReport(id=item.id, latitude=item.latitude, longitude=item.longitude)
                session.add(report)
                created += 1
            else:
                updated += 1
            report.status = "verified"
            report.latitude = item.latitude
            report.longitude = item.longitude
            report.hazard_type = item.hazard_type
            report.confidence = 0.95
            report.severity = item.severity
            report.overall_risk = item.overall_risk
            report.detected_labels = f"{item.tag}{item.key}"
            report.photo_path = None
        session.commit()
    print(
        "Gwangju City Hall demo ready: "
        f"created={created}, updated={updated}, legacy_removed={removed_legacy}, "
        f"total={len(DEMO_POINTS)}"
    )


def delete() -> None:
    ids = [item.id for item in DEMO_POINTS]
    with SessionLocal() as session:
        deleted = (
            session.query(HazardReport)
            .filter(HazardReport.id.in_(ids))
            .delete(synchronize_session=False)
        )
        deleted += _remove_legacy_jnu_points(session)
        session.commit()
    print(f"Demo data removed: {deleted}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--delete", action="store_true", help="광주시청 시연용 데이터 삭제")
    arguments = parser.parse_args()
    delete() if arguments.delete else upsert()
