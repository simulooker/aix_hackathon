"""Weather-driven slip-risk scoring backing the route cost function's ``Wslip`` term.

Calls the 기상청(KMA) 공공데이터포털 초단기실황조회(getUltraSrtNcst) API for the
grid cell nearest to a coordinate. If no API key is configured, or the request
fails for any reason (offline demo, quota, network hiccup), this degrades to a
neutral risk estimate instead of failing the route request.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

from app.core.config import settings

_KMA_BASE_URL = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst"
_KST = ZoneInfo("Asia/Seoul")
_logger = logging.getLogger(__name__)

# Precipitation-type codes (PTY) that indicate snow/sleet on the ground.
_SNOW_CODES = {"2", "3", "6", "7"}
_RAIN_CODES = {"1", "5"}


@dataclass
class WeatherRisk:
    data_available: bool
    temperature_c: float | None
    precipitation_type: str | None
    slip_risk: float  # Wslip (0~1) used in the route cost function


def _latlon_to_grid(lat: float, lon: float) -> tuple[int, int]:
    """기상청 LCC DFS 격자 좌표 변환 (5km 격자)."""
    re = 6371.00877 / 5.0
    slat1, slat2 = math.radians(30.0), math.radians(60.0)
    olon, olat = math.radians(126.0), math.radians(38.0)
    xo, yo = 43, 136

    sn = math.log(math.cos(slat1) / math.cos(slat2)) / math.log(
        math.tan(math.pi * 0.25 + slat2 * 0.5) / math.tan(math.pi * 0.25 + slat1 * 0.5)
    )
    sf = math.tan(math.pi * 0.25 + slat1 * 0.5)
    sf = (sf**sn) * math.cos(slat1) / sn
    ro = re * sf / (math.tan(math.pi * 0.25 + olat * 0.5) ** sn)

    ra = re * sf / (math.tan(math.pi * 0.25 + math.radians(lat) * 0.5) ** sn)
    theta = math.radians(lon) - olon
    if theta > math.pi:
        theta -= 2.0 * math.pi
    if theta < -math.pi:
        theta += 2.0 * math.pi
    theta *= sn

    x = int(ra * math.sin(theta) + xo + 0.5)
    y = int(ro - ra * math.cos(theta) + yo + 0.5)
    return x, y


def _base_datetime() -> tuple[str, str]:
    """초단기실황 is published hourly at :40 KST; roll back an hour until then."""
    now = datetime.now(_KST)
    reference = now if now.minute >= 45 else now - timedelta(hours=1)
    return reference.strftime("%Y%m%d"), reference.strftime("%H00")


def _neutral_risk() -> WeatherRisk:
    return WeatherRisk(data_available=False, temperature_c=None, precipitation_type=None, slip_risk=0.0)


async def get_weather_risk(latitude: float, longitude: float) -> WeatherRisk:
    if not settings.weather_api_key:
        return _neutral_risk()

    nx, ny = _latlon_to_grid(latitude, longitude)
    base_date, base_time = _base_datetime()

    params = {
        "serviceKey": settings.weather_api_key,
        "dataType": "JSON",
        "base_date": base_date,
        "base_time": base_time,
        "nx": nx,
        "ny": ny,
        "numOfRows": 10,
        "pageNo": 1,
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(_KMA_BASE_URL, params=params)
            response.raise_for_status()
            payload = response.json()
        items = payload["response"]["body"]["items"]["item"]
    except Exception:
        _logger.warning("Weather risk lookup failed; falling back to neutral risk", exc_info=True)
        return _neutral_risk()

    readings = {item["category"]: item["obsrValue"] for item in items}
    temperature = float(readings["T1H"]) if "T1H" in readings else None
    precipitation_type = readings.get("PTY")

    return WeatherRisk(
        data_available=True,
        temperature_c=temperature,
        precipitation_type=precipitation_type,
        slip_risk=_compute_slip_risk(temperature, precipitation_type),
    )


def _compute_slip_risk(temperature_c: float | None, precipitation_type: str | None) -> float:
    """Wslip (0~1): higher when it's near/below freezing with snow/rain on the ground."""
    if temperature_c is None:
        return 0.0

    if temperature_c > 3:
        base = 0.0
    elif temperature_c > 0:
        base = 0.2
    elif temperature_c > -3:
        base = 0.6
    else:
        base = 0.8

    if precipitation_type and precipitation_type != "0":
        if precipitation_type in _SNOW_CODES:
            base = min(1.0, base + 0.4)
        elif precipitation_type in _RAIN_CODES:
            base = min(1.0, base + 0.2)

    return round(base, 3)
