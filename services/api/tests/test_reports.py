import asyncio
from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4

from fastapi import UploadFile
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from starlette.datastructures import Headers

from app.api.routes import reports
from app.db.session import Base
from app.main import app
from app.models.report import HazardReport


def no_hazard_analysis() -> dict:
    return {
        "model_ready": True,
        "walkway_detected": False,
        "overall_risk": "none",
        "obstacles_detected": 0,
        "obstacles_on_walkway": 0,
        "detections": [],
    }


def hazard_analysis(label: str, risk: str = "medium") -> dict:
    return {
        "model_ready": True,
        "walkway_detected": True,
        "overall_risk": risk,
        "obstacles_detected": 1,
        "obstacles_on_walkway": 1,
        "detections": [
            {
                "label": label,
                "confidence": 0.9,
                "box": (0.2, 0.2, 0.6, 0.8),
                "blocked_walkway_ratio": 0.4,
                "remaining_walkway_image_ratio": 0.2,
                "proximity": 0.8,
                "on_walkway": True,
                "risk": risk,
            }
        ],
    }


def test_no_hazard_report_is_not_uploaded_or_saved(monkeypatch) -> None:
    monkeypatch.setattr(
        reports,
        "get_ai_service",
        lambda: SimpleNamespace(analyze=lambda _contents: no_hazard_analysis()),
    )

    async def fail_upload(*_args, **_kwargs):
        raise AssertionError("a no-hazard image must not be uploaded")

    monkeypatch.setattr(reports, "upload_report_image", fail_upload)
    db = SimpleNamespace(
        add=lambda _item: (_ for _ in ()).throw(AssertionError("must not add")),
        commit=lambda: (_ for _ in ()).throw(AssertionError("must not commit")),
    )
    image = UploadFile(
        file=BytesIO(b"image"),
        filename="safe.jpg",
        headers=Headers({"content-type": "image/jpeg"}),
    )

    result = asyncio.run(
        reports.create_report(
            image=image,
            latitude=35.17,
            longitude=126.91,
            db=db,
            _current_user=SimpleNamespace(username="tester"),
        )
    )

    assert result.report_id is None
    assert result.is_active is False
    assert result.overall_risk == "none"
    assert result.photo_path is None


def test_report_endpoint_requires_login() -> None:
    response = TestClient(app).post(
        "/api/v1/reports",
        data={"latitude": "35.17", "longitude": "126.91"},
        files={"image": ("photo.jpg", b"image", "image/jpeg")},
    )

    assert response.status_code == 401


def test_person_is_returned_as_detection_but_not_saved_as_hazard(monkeypatch) -> None:
    person_analysis = hazard_analysis("person", risk="none")
    person_analysis["obstacles_on_walkway"] = 0
    monkeypatch.setattr(
        reports,
        "get_ai_service",
        lambda: SimpleNamespace(analyze=lambda _contents: person_analysis),
    )

    async def fail_upload(*_args, **_kwargs):
        raise AssertionError("a person-only image must not be uploaded")

    monkeypatch.setattr(reports, "upload_report_image", fail_upload)
    db = SimpleNamespace(
        add=lambda _item: (_ for _ in ()).throw(AssertionError("must not add")),
        commit=lambda: (_ for _ in ()).throw(AssertionError("must not commit")),
    )

    result = asyncio.run(
        reports.create_report(
            image=UploadFile(
                file=BytesIO(b"image"),
                filename="pedestrian.jpg",
                headers=Headers({"content-type": "image/jpeg"}),
            ),
            latitude=35.16,
            longitude=126.85,
            db=db,
            _current_user=SimpleNamespace(username="tester"),
        )
    )

    assert result.report_id is None
    assert result.is_active is False
    assert result.overall_risk == "none"
    assert result.obstacles_on_walkway == 0
    assert result.detections[0].label == "person"


def test_single_photo_vehicle_is_saved_inactive_then_matching_report_activates_both(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        reports,
        "get_ai_service",
        lambda: SimpleNamespace(analyze=lambda _contents: hazard_analysis("motor_vehicle")),
    )

    async def fake_upload(*_args, **_kwargs):
        return "reports/test.jpg"

    monkeypatch.setattr(reports, "upload_report_image", fake_upload)
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        first = asyncio.run(
            reports.create_report(
                image=UploadFile(
                    file=BytesIO(b"first"),
                    filename="passing-car-1.jpg",
                    headers=Headers({"content-type": "image/jpeg"}),
                ),
                latitude=35.16,
                longitude=126.85,
                heading_deg=350,
                heading_accuracy=3,
                db=db,
                _current_user=SimpleNamespace(username="tester"),
            )
        )
        assert first.is_active is False

        second = asyncio.run(
            reports.create_report(
                image=UploadFile(
                    file=BytesIO(b"second"),
                    filename="passing-car-2.jpg",
                    headers=Headers({"content-type": "image/jpeg"}),
                ),
                latitude=35.16002,
                longitude=126.85002,
                heading_deg=10,
                heading_accuracy=3,
                db=db,
                _current_user=SimpleNamespace(username="tester"),
            )
        )
        assert second.is_active is True

        stored = db.query(HazardReport).order_by(HazardReport.created_at).all()
        assert len(stored) == 2
        assert {item.hazard_type for item in stored} == {"motor_vehicle"}
        assert all(item.is_active for item in stored)


def test_vehicle_report_outside_five_meters_remains_inactive(monkeypatch) -> None:
    monkeypatch.setattr(
        reports,
        "get_ai_service",
        lambda: SimpleNamespace(
            analyze=lambda _contents: hazard_analysis("motor_vehicle")
        ),
    )

    async def fake_upload(*_args, **_kwargs):
        return "reports/test.jpg"

    monkeypatch.setattr(reports, "upload_report_image", fake_upload)
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        for latitude in (35.16, 35.16006):
            result = asyncio.run(
                reports.create_report(
                    image=UploadFile(
                        file=BytesIO(b"image"),
                        filename="passing-car.jpg",
                        headers=Headers({"content-type": "image/jpeg"}),
                    ),
                    latitude=latitude,
                    longitude=126.85,
                    heading_deg=10,
                    heading_accuracy=3,
                    db=db,
                    _current_user=SimpleNamespace(username="tester"),
                )
            )
            assert result.is_active is False


def test_nearby_vehicle_facing_another_direction_remains_inactive(monkeypatch) -> None:
    monkeypatch.setattr(
        reports,
        "get_ai_service",
        lambda: SimpleNamespace(
            analyze=lambda _contents: hazard_analysis("motor_vehicle")
        ),
    )

    async def fake_upload(*_args, **_kwargs):
        return "reports/test.jpg"

    monkeypatch.setattr(reports, "upload_report_image", fake_upload)
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        for heading in (10, 80):
            result = asyncio.run(
                reports.create_report(
                    image=UploadFile(
                        file=BytesIO(b"image"),
                        filename="passing-car.jpg",
                        headers=Headers({"content-type": "image/jpeg"}),
                    ),
                    latitude=35.16,
                    longitude=126.85,
                    heading_deg=heading,
                    heading_accuracy=3,
                    db=db,
                    _current_user=SimpleNamespace(username="tester"),
                )
            )
            assert result.is_active is False


def test_fixed_obstacle_is_active_on_first_report(monkeypatch) -> None:
    monkeypatch.setattr(
        reports,
        "get_ai_service",
        lambda: SimpleNamespace(
            analyze=lambda _contents: hazard_analysis("fixed_obstacle")
        ),
    )

    async def fake_upload(*_args, **_kwargs):
        return "reports/test.jpg"

    monkeypatch.setattr(reports, "upload_report_image", fake_upload)
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        result = asyncio.run(
            reports.create_report(
                image=UploadFile(
                    file=BytesIO(b"image"),
                    filename="bollard.jpg",
                    headers=Headers({"content-type": "image/jpeg"}),
                ),
                latitude=35.16,
                longitude=126.85,
                db=db,
                _current_user=SimpleNamespace(username="tester"),
            )
        )

    assert result.is_active is True


def test_missing_report_image_returns_404() -> None:
    response = TestClient(app).get(f"/api/v1/reports/{uuid4()}/image")

    assert response.status_code == 404
