from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.routes.navigation import _get_route_hazards
from app.db.session import Base
from app.models.report import HazardReport
from app.services.seeded_disaster_service import DEMO_DISASTER_TAG


def test_route_uses_only_verified_non_disaster_reports() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add_all(
            [
                HazardReport(
                    status="verified",
                    latitude=35.16,
                    longitude=126.85,
                    hazard_type="fixed_obstacle",
                    severity=0.8,
                    overall_risk="high",
                ),
                HazardReport(
                    status="pending",
                    latitude=35.16,
                    longitude=126.85,
                    hazard_type="fixed_obstacle",
                    severity=0.8,
                    overall_risk="high",
                ),
                HazardReport(
                    status="verified",
                    latitude=35.16,
                    longitude=126.85,
                    hazard_type="demo_disaster_flood",
                    severity=1,
                    overall_risk="high",
                    detected_labels=f"{DEMO_DISASTER_TAG}test",
                ),
            ]
        )
        session.commit()

        hazards = _get_route_hazards(session, 35.16, 126.85, 0.01, 0.01)

    assert len(hazards) == 1
    assert hazards[0].status == "verified"
    assert hazards[0].hazard_type == "fixed_obstacle"
