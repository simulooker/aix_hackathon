from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.session import Base
from app.models.report import HazardReport
from app.services.seeded_disaster_service import (
    DEMO_DISASTER_TAG,
    get_seeded_disaster_zones,
)


def test_seeded_disaster_is_converted_inside_requested_bounds() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(
            HazardReport(
                status="verified",
                latitude=35.16049,
                longitude=126.85125,
                hazard_type="demo_disaster_flood",
                confidence=0.95,
                severity=1.0,
                overall_risk="high",
                detected_labels=f"{DEMO_DISASTER_TAG}flood-test",
            )
        )
        session.add(
            HazardReport(
                status="pending",
                latitude=35.16050,
                longitude=126.85130,
                hazard_type="demo_disaster_road_control",
                severity=1.0,
                overall_risk="high",
                detected_labels=f"{DEMO_DISASTER_TAG}pending-test",
            )
        )
        session.commit()

        zones = get_seeded_disaster_zones(
            session, 35.159, 126.850, 35.162, 126.853
        )

    assert len(zones) == 1
    assert zones[0].kind == "flood"
    assert zones[0].radius_m == 18
