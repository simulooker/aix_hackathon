import asyncio
from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4

from fastapi import UploadFile
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from app.api.routes import reports
from app.main import app


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

    assert result.status == "not_saved"
    assert result.report_id is None
    assert result.overall_risk == "none"
    assert result.photo_path is None


def test_report_endpoint_requires_login() -> None:
    response = TestClient(app).post(
        "/api/v1/reports",
        data={"latitude": "35.17", "longitude": "126.91"},
        files={"image": ("photo.jpg", b"image", "image/jpeg")},
    )

    assert response.status_code == 401


def test_single_photo_vehicle_is_saved_as_verified(monkeypatch) -> None:
    monkeypatch.setattr(
        reports,
        "get_ai_service",
        lambda: SimpleNamespace(analyze=lambda _contents: hazard_analysis("motor_vehicle")),
    )

    async def fake_upload(*_args, **_kwargs):
        return "reports/test.jpg"

    monkeypatch.setattr(reports, "upload_report_image", fake_upload)
    stored = []

    def refresh(item):
        item.id = uuid4()

    db = SimpleNamespace(
        add=stored.append,
        commit=lambda: None,
        refresh=refresh,
    )
    image = UploadFile(
        file=BytesIO(b"image"),
        filename="passing-car.jpg",
        headers=Headers({"content-type": "image/jpeg"}),
    )

    result = asyncio.run(
        reports.create_report(
            image=image,
            latitude=35.16,
            longitude=126.85,
            db=db,
            _current_user=SimpleNamespace(username="tester"),
        )
    )

    assert result.status == "verified"
    assert stored[0].status == "verified"
    assert stored[0].hazard_type == "motor_vehicle"


def test_missing_report_image_returns_404() -> None:
    response = TestClient(app).get(f"/api/v1/reports/{uuid4()}/image")

    assert response.status_code == 404
