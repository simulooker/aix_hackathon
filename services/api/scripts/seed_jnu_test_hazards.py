"""전남대학교 광주(용봉)캠퍼스 지도 시연용 위험 제보를 추가하거나 삭제합니다."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from uuid import NAMESPACE_URL, UUID, uuid5

from app.db.session import SessionLocal
from app.models.report import HazardReport


@dataclass(frozen=True)
class TestHazard:
    key: str
    latitude: float
    longitude: float
    hazard_type: str
    severity: float
    overall_risk: str

    @property
    def id(self) -> UUID:
        return uuid5(NAMESPACE_URL, f"withyou:jnu-yongbong-demo:{self.key}")


TEST_HAZARDS = (
    TestHazard("low-01", 35.17683, 126.90810, "fixed_obstacle", 0.22, "low"),
    TestHazard("low-02", 35.17755, 126.90690, "movable_obstacle", 0.28, "low"),
    TestHazard("low-03", 35.17585, 126.90665, "two_wheeler", 0.32, "low"),
    TestHazard("low-04", 35.17860, 126.90885, "fixed_obstacle", 0.35, "low"),
    TestHazard("medium-01", 35.17495, 126.90930, "movable_obstacle", 0.48, "medium"),
    TestHazard("medium-02", 35.17575, 126.91120, "motor_vehicle", 0.58, "medium"),
    TestHazard("medium-03", 35.17740, 126.91220, "fixed_obstacle", 0.66, "medium"),
    TestHazard("high-01", 35.17920, 126.91060, "motor_vehicle", 0.76, "high"),
    TestHazard("high-02", 35.17430, 126.90770, "movable_obstacle", 0.88, "high"),
    TestHazard("high-03", 35.17630, 126.91340, "fixed_obstacle", 0.96, "high"),
)


def upsert() -> None:
    created = 0
    updated = 0
    with SessionLocal() as session:
        for item in TEST_HAZARDS:
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
            report.detected_labels = f"TEST_DATA:JNU_YONGBONG,{item.hazard_type}"
            report.photo_path = None
        session.commit()
    print(f"JNU test hazards ready: created={created}, updated={updated}, total={len(TEST_HAZARDS)}")


def delete() -> None:
    ids = [item.id for item in TEST_HAZARDS]
    with SessionLocal() as session:
        deleted = (
            session.query(HazardReport)
            .filter(HazardReport.id.in_(ids))
            .delete(synchronize_session=False)
        )
        session.commit()
    print(f"JNU test hazards removed: {deleted}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--delete", action="store_true", help="시연용 위험 제보 10개 삭제")
    arguments = parser.parse_args()
    delete() if arguments.delete else upsert()
