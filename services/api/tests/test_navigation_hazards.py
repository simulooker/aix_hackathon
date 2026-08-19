from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.routes.navigation import _get_route_hazards
from app.db.session import Base
from app.models.report import HazardReport


def test_route_uses_only_active_reports() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add_all(
            [
                HazardReport(
                    is_active=True,
                    latitude=35.16,
                    longitude=126.85,
                    hazard_type="fixed_obstacle",
                    severity=0.8,
                    overall_risk="high",
                ),
                HazardReport(
                    is_active=False,
                    latitude=35.16,
                    longitude=126.85,
                    hazard_type="fixed_obstacle",
                    severity=0.8,
                    overall_risk="high",
                ),
            ]
        )
        session.commit()

        hazards = _get_route_hazards(session, 35.16, 126.85, 0.01, 0.01)

    assert len(hazards) == 1
    assert hazards[0].is_active is True
