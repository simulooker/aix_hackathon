import asyncio
from io import BytesIO
from types import SimpleNamespace

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
