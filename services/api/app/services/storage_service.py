"""Hazard report persistence: Supabase Storage + PostGIS when configured.

Falls back to local disk + an in-memory index when Supabase env vars aren't
set, so the report -> detection -> routing pipeline works end-to-end on a
laptop during the hackathon without a live Supabase project.
"""

from __future__ import annotations

import logging
import math
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import settings

_logger = logging.getLogger(__name__)

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


@dataclass
class HazardReport:
    id: str
    image_path: str
    latitude: float
    longitude: float
    hazard_type: str | None
    confidence: float | None
    severity: float | None
    status: str
    created_at: str


_memory_reports: list[HazardReport] = []


def _get_supabase_client():
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return None
    try:
        from supabase import create_client  # optional dependency, imported lazily
    except ImportError:
        return None
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


async def save_report(
    *,
    image_bytes: bytes,
    filename: str | None,
    latitude: float,
    longitude: float,
    hazard_type: str | None,
    confidence: float | None,
    severity: float | None,
    status: str = "pending",
) -> HazardReport:
    report_id = str(uuid.uuid4())
    extension = Path(filename or "photo.jpg").suffix or ".jpg"
    storage_path = f"{report_id}{extension}"

    client = _get_supabase_client()
    if client is not None:
        try:
            client.storage.from_(settings.supabase_hazard_bucket).upload(
                storage_path,
                image_bytes,
                {"content-type": "image/jpeg"},
            )
            row = {
                "id": report_id,
                "image_path": storage_path,
                "location": f"SRID=4326;POINT({longitude} {latitude})",
                "hazard_type": hazard_type,
                "confidence": confidence,
                "severity": severity,
                "status": status,
            }
            result = client.table("hazard_reports").insert(row).execute()
            saved = result.data[0]
            return HazardReport(
                id=saved["id"],
                image_path=storage_path,
                latitude=latitude,
                longitude=longitude,
                hazard_type=saved.get("hazard_type"),
                confidence=saved.get("confidence"),
                severity=saved.get("severity", severity),
                status=saved.get("status", status),
                created_at=saved.get("created_at") or datetime.now(timezone.utc).isoformat(),
            )
        except Exception:
            _logger.warning("Supabase save_report failed; falling back to local storage", exc_info=True)

    (UPLOAD_DIR / storage_path).write_bytes(image_bytes)
    report = HazardReport(
        id=report_id,
        image_path=f"uploads/{storage_path}",
        latitude=latitude,
        longitude=longitude,
        hazard_type=hazard_type,
        confidence=confidence,
        severity=severity,
        status=status,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    _memory_reports.append(report)
    return report


async def get_nearby_reports(latitude: float, longitude: float, radius_m: float) -> list[HazardReport]:
    client = _get_supabase_client()
    if client is not None:
        try:
            result = client.rpc(
                "nearby_hazards",
                {"search_lat": latitude, "search_lon": longitude, "radius_m": radius_m},
            ).execute()
            return [
                HazardReport(
                    id=row["id"],
                    image_path=row["image_path"],
                    latitude=row["latitude"],
                    longitude=row["longitude"],
                    hazard_type=row.get("hazard_type"),
                    confidence=row.get("confidence"),
                    severity=row.get("severity"),
                    status=row.get("status", "verified"),
                    created_at=row.get("created_at", ""),
                )
                for row in (result.data or [])
            ]
        except Exception:
            _logger.warning("Supabase get_nearby_reports failed; falling back to local index", exc_info=True)

    return [
        report
        for report in _memory_reports
        if _haversine_m(latitude, longitude, report.latitude, report.longitude) <= radius_m
    ]
