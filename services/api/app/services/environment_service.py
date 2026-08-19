import json
import logging
from math import cos, radians
from pathlib import Path
from time import monotonic
from typing import Any

import httpx

from app.core.config import settings
from app.schemas.environment import DisasterZone, WeatherAlert, WeatherContext

logger = logging.getLogger(__name__)
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
DISASTER_CACHE_TTL_SECONDS = 300
_disaster_cache: dict[tuple[float, float, float, float], tuple[float, list[DisasterZone]]] = {}


async def fetch_weather(
    latitude: float, longitude: float, profile: str = "general"
) -> WeatherContext | None:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": (
            "temperature_2m,apparent_temperature,precipitation,rain,"
            "snowfall,weather_code"
        ),
        "timezone": "Asia/Seoul",
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(OPEN_METEO_URL, params=params)
            response.raise_for_status()
        current = response.json().get("current", {})
        temperature = _float_or_none(current.get("temperature_2m"))
        apparent = _float_or_none(current.get("apparent_temperature"))
        precipitation = max(0.0, _float_or_none(current.get("precipitation")) or 0)
        rain = max(0.0, _float_or_none(current.get("rain")) or 0)
        snowfall = max(0.0, _float_or_none(current.get("snowfall")) or 0)
        weather_code = _int_or_none(current.get("weather_code"))
        alerts = weather_alerts(
            temperature, apparent, max(precipitation, rain), snowfall, profile
        )
        return WeatherContext(
            temperature_c=temperature,
            apparent_temperature_c=apparent,
            precipitation_mm=max(precipitation, rain),
            weather_code=weather_code,
            alerts=alerts,
        )
    except Exception:  # noqa: BLE001
        logger.exception("Weather lookup failed")
        return None


def weather_alerts(
    temperature: float | None,
    apparent: float | None,
    precipitation: float,
    snowfall: float,
    profile: str,
) -> list[WeatherAlert]:
    alerts: list[WeatherAlert] = []
    felt = apparent if apparent is not None else temperature
    vulnerable = profile in {"elderly", "wheelchair"}
    hot_threshold = 30 if vulnerable else 33
    cold_threshold = 5 if vulnerable else 0

    if felt is not None and felt >= hot_threshold:
        alerts.append(
            WeatherAlert(
                level="danger" if felt >= 35 else "warning",
                title="폭염 주의",
                message=f"체감온도 {felt:.0f}°C입니다. 그늘에서 쉬고 물을 자주 마셔 주세요.",
            )
        )
    if felt is not None and felt <= cold_threshold:
        alerts.append(
            WeatherAlert(
                level="danger" if felt <= -5 else "warning",
                title="한랭 주의",
                message=f"체감온도 {felt:.0f}°C입니다. 방한용품을 착용하고 빙판을 주의해 주세요.",
            )
        )
    if precipitation > 0:
        alerts.append(
            WeatherAlert(
                level="warning" if precipitation < 5 else "danger",
                title="우천 주의",
                message=f"현재 강수량은 시간당 약 {precipitation:.1f}mm입니다. 미끄럼과 침수 구간을 주의해 주세요.",
            )
        )
    if snowfall > 0:
        alerts.append(
            WeatherAlert(
                level="danger",
                title="적설·결빙 주의",
                message="눈이 내리고 있습니다. 경사로와 그늘진 보행로를 피하세요.",
            )
        )
    return alerts


async def fetch_disaster_zones(
    min_latitude: float,
    min_longitude: float,
    max_latitude: float,
    max_longitude: float,
) -> list[DisasterZone]:
    """Configured road-disaster feed adapter.

    DISASTER_API_URL may contain {min_lat}, {min_lon}, {max_lat}, {max_lon}.
    The parser accepts common public-data response envelopes and coordinate names.
    """
    if settings.disaster_demo_file:
        return _demo_zones(min_latitude, min_longitude, max_latitude, max_longitude)

    if not settings.disaster_api_url or not settings.disaster_api_key:
        return []

    cache_key = tuple(
        round(value, 3)
        for value in (min_latitude, min_longitude, max_latitude, max_longitude)
    )
    cached = _disaster_cache.get(cache_key)
    now = monotonic()
    if cached and now - cached[0] < DISASTER_CACHE_TTL_SECONDS:
        return cached[1]

    url = settings.disaster_api_url.format(
        min_lat=min_latitude,
        min_lon=min_longitude,
        max_lat=max_latitude,
        max_lon=max_longitude,
    )
    params: dict[str, Any] = {
        "serviceKey": settings.disaster_api_key,
        "type": "json",
        "_type": "json",
        "minX": min_longitude,
        "minY": min_latitude,
        "maxX": max_longitude,
        "maxY": max_latitude,
        "numOfRows": 500,
        "pageNo": 1,
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
        zones = _zones_in_bbox(
            response.json(), min_latitude, min_longitude, max_latitude, max_longitude
        )
        if len(_disaster_cache) >= 64:
            oldest_key = min(_disaster_cache, key=lambda key: _disaster_cache[key][0])
            _disaster_cache.pop(oldest_key, None)
        _disaster_cache[cache_key] = (now, zones)
        return zones
    except Exception:  # noqa: BLE001
        logger.exception("Disaster feed lookup failed")
        _disaster_cache[cache_key] = (now, [])
        return []


def _zones_in_bbox(
    payload: Any,
    min_latitude: float,
    min_longitude: float,
    max_latitude: float,
    max_longitude: float,
) -> list[DisasterZone]:
    """응답 본문을 DisasterZone 목록으로 바꾸고 요청 영역 안의 것만 남긴다."""
    zones: list[DisasterZone] = []
    for index, record in enumerate(_records(payload)):
        zone = _zone_from_record(record, index)
        if not zone:
            continue
        if not (min_latitude <= zone.latitude <= max_latitude):
            continue
        if not (min_longitude <= zone.longitude <= max_longitude):
            continue
        zones.append(zone)
    return zones


def _demo_zones(
    min_latitude: float,
    min_longitude: float,
    max_latitude: float,
    max_longitude: float,
) -> list[DisasterZone]:
    """DISASTER_DEMO_FILE 이 지정되면 외부 호출 없이 고정 데이터를 재난 피드로 쓴다.

    실제 API 응답과 같은 파서를 타므로 형식/동작이 동일하다.
    """
    path = Path(settings.disaster_demo_file or "")
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[1] / path
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        logger.exception("Disaster demo file load failed: %s", path)
        return []
    return _zones_in_bbox(
        payload, min_latitude, min_longitude, max_latitude, max_longitude
    )


def route_bbox(
    origin_lat: float,
    origin_lon: float,
    destination_lat: float,
    destination_lon: float,
    padding_m: float = 1000,
) -> tuple[float, float, float, float]:
    center_lat = (origin_lat + destination_lat) / 2
    lat_pad = padding_m / 111_320
    lon_pad = padding_m / max(1, 111_320 * cos(radians(center_lat)))
    return (
        min(origin_lat, destination_lat) - lat_pad,
        min(origin_lon, destination_lon) - lon_pad,
        max(origin_lat, destination_lat) + lat_pad,
        max(origin_lon, destination_lon) + lon_pad,
    )


def _records(payload: Any) -> list[dict[str, Any]]:
    candidates = [payload]
    if isinstance(payload, dict):
        candidates.extend(
            [
                payload.get("data"),
                payload.get("items"),
                payload.get("features"),
                payload.get("response", {}).get("body", {}).get("items"),
                # ITS 돌발상황정보는 response 래퍼 없이 body.items 로 내려온다.
                (payload.get("body") if isinstance(payload.get("body"), dict) else {}).get("items"),
            ]
        )
    for candidate in candidates:
        if isinstance(candidate, dict) and "item" in candidate:
            candidate = candidate["item"]
        if isinstance(candidate, list):
            return [item for item in candidate if isinstance(item, dict)]
    return []


def _zone_from_record(record: dict[str, Any], index: int) -> DisasterZone | None:
    properties = record.get("properties") if isinstance(record.get("properties"), dict) else record
    geometry = record.get("geometry") if isinstance(record.get("geometry"), dict) else {}
    coordinates = geometry.get("coordinates") if isinstance(geometry.get("coordinates"), list) else []
    latitude = _first_number(properties, "latitude", "lat", "gpsY", "coordY", "y")
    longitude = _first_number(properties, "longitude", "lon", "lng", "gpsX", "coordX", "x")
    if latitude is None and len(coordinates) >= 2:
        longitude, latitude = _float_or_none(coordinates[0]), _float_or_none(coordinates[1])
    if latitude is None or longitude is None:
        return None

    text = " ".join(
        str(properties.get(key, ""))
        for key in (
            "eventType",
            "eventDetailType",
            "incidentType",
            "type",
            "title",
            "detail",
            "description",
            "message",
            "lanesBlockType",
            "lanesBlocked",
        )
    )
    lowered = text.lower()
    if any(word in lowered for word in ("침수", "홍수", "범람", "flood")):
        kind = "flood"
        default_title = "침수·홍수 통제 구간"
    elif any(word in lowered for word in ("산사태", "토사", "landslide")):
        kind = "landslide"
        default_title = "산사태 통제 구간"
    elif any(word in lowered for word in ("통제", "차단", "control", "closed")):
        kind = "road_control"
        default_title = "도로 통제 구간"
    elif any(word in lowered for word in ("재난", "disaster")):
        kind = "other"
        default_title = "재난 통제 구간"
    else:
        return None

    title = str(
        properties.get("title")
        or properties.get("eventDetailType")
        or properties.get("eventType")
        or default_title
    )
    return DisasterZone(
        id=str(properties.get("id") or properties.get("eventId") or f"disaster-{index}"),
        kind=kind,
        title=title,
        description=str(
            properties.get("description")
            or properties.get("detail")
            or properties.get("message")
            or ""
        ),
        road_name=_string_or_none(properties.get("roadName") or properties.get("road_name")),
        latitude=latitude,
        longitude=longitude,
        radius_m=max(40, _first_number(properties, "radius", "radiusM") or 80),
    )


def _first_number(record: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        value = _float_or_none(record.get(key))
        if value is not None:
            return value
    return None


def _float_or_none(value: Any) -> float | None:
    try:
        result = float(value)
        return result if result == result else None
    except (TypeError, ValueError):
        return None


def _int_or_none(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _string_or_none(value: Any) -> str | None:
    return str(value) if value not in (None, "") else None
