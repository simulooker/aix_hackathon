from types import SimpleNamespace

from app.services.route_service import (
    _RouteCandidate,
    _avoid_polygons,
    _select_candidate,
    _slope_metrics,
)
from app.schemas.environment import DisasterZone


def candidate(distance: float, severities: list[float]) -> _RouteCandidate:
    hazards = tuple(SimpleNamespace(severity=value) for value in severities)
    return _RouteCandidate(geometry=[], distance_m=distance, hazards=hazards)


def test_general_profile_rejects_excessive_detour() -> None:
    shortest = candidate(100, [1.0])
    safer = candidate(120, [])

    selected, avoided = _select_candidate([shortest, safer], "general", True)

    assert selected is shortest
    assert avoided == 0


def test_general_profile_accepts_only_a_small_safer_detour() -> None:
    shortest = candidate(100, [1.0])
    safer = candidate(104, [])

    selected, avoided = _select_candidate([shortest, safer], "general", True)

    assert selected is safer
    assert avoided == 1


def test_elderly_profile_rejects_twenty_percent_detour() -> None:
    shortest = candidate(100, [1.0])
    safer = candidate(120, [])

    selected, avoided = _select_candidate([shortest, safer], "elderly", True)

    assert selected is shortest
    assert avoided == 0


def test_safety_disabled_always_uses_shortest_candidate() -> None:
    shortest = candidate(100, [1.0])
    safer = candidate(105, [])

    selected, avoided = _select_candidate([shortest, safer], "wheelchair", False)

    assert selected is shortest
    assert avoided == 0


def test_slope_metrics_detects_a_steep_section() -> None:
    geometry = [
        {"latitude": 35.0, "longitude": 126.0, "elevation": 10.0},
        {"latitude": 35.001, "longitude": 126.0, "elevation": 20.0},
    ]

    ascent, descent, maximum, segments = _slope_metrics(geometry)

    assert ascent == 10.0
    assert descent == 0
    assert 8 <= maximum <= 10
    assert segments[0]["level"] == "steep"


def test_disaster_zone_becomes_an_ors_avoid_polygon() -> None:
    zone = DisasterZone(
        id="flood-1",
        kind="flood",
        title="침수 통제",
        description="",
        latitude=35.0,
        longitude=126.0,
        radius_m=80,
        severity=1,
    )

    polygon = _avoid_polygons([zone])

    assert polygon is not None
    assert polygon["type"] == "MultiPolygon"
    assert len(polygon["coordinates"][0][0]) == 13


def test_wheelchair_profile_can_choose_a_flatter_small_detour() -> None:
    steep = _RouteCandidate(
        geometry=[], distance_m=100, hazards=(), max_grade_percent=10, ascent_m=8
    )
    flat = _RouteCandidate(
        geometry=[], distance_m=108, hazards=(), max_grade_percent=2, ascent_m=2
    )

    selected, _ = _select_candidate([steep, flat], "wheelchair", True)

    assert selected is flat
