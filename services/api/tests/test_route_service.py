from types import SimpleNamespace

from app.services.route_service import (
    AccessibilityRouteBlocked,
    _RouteCandidate,
    _avoid_polygons,
    _contains_blocked_wheelchair_slope,
    _nearby_hazards,
    _route_intersects_disaster_zone,
    _select_candidate,
    _slope_metrics,
)
from app.schemas.environment import DisasterZone


def candidate(distance: float, severities: list[float]) -> _RouteCandidate:
    hazards = tuple(SimpleNamespace(severity=value) for value in severities)
    return _RouteCandidate(geometry=[], distance_m=distance, hazards=hazards)


def stair_candidate(distance: float, has_stairs: bool) -> _RouteCandidate:
    hazards = (
        (SimpleNamespace(severity=0.25, hazard_type="stairs"),)
        if has_stairs
        else ()
    )
    return _RouteCandidate(geometry=[], distance_m=distance, hazards=hazards)


def test_general_profile_rejects_excessive_detour() -> None:
    shortest = candidate(100, [1.0])
    safer = candidate(120, [])

    selected, avoided = _select_candidate([shortest, safer], "general", True)

    assert selected is shortest
    assert avoided == 0


def test_general_profile_uses_shortest_even_for_small_safer_detour() -> None:
    shortest = candidate(100, [1.0])
    safer = candidate(104, [])

    selected, avoided = _select_candidate([shortest, safer], "general", True)

    assert selected is shortest
    assert avoided == 0


def test_elderly_profile_accepts_twenty_percent_detour_for_high_risk() -> None:
    shortest = candidate(100, [1.0])
    safer = candidate(120, [])

    selected, avoided = _select_candidate([shortest, safer], "elderly", True)

    assert selected is safer
    assert avoided == 1


def test_safety_disabled_always_uses_shortest_candidate() -> None:
    shortest = candidate(100, [1.0])
    safer = candidate(105, [])

    selected, avoided = _select_candidate([shortest, safer], "wheelchair", False)

    assert selected is shortest
    assert avoided == 0


def test_hazard_is_detected_between_sparse_route_points() -> None:
    geometry = [
        {"latitude": 35.0, "longitude": 126.0},
        {"latitude": 35.001, "longitude": 126.0},
    ]
    hazard = SimpleNamespace(latitude=35.0005, longitude=126.00005)

    assert _nearby_hazards(geometry, [hazard]) == (hazard,)


def test_slope_metrics_detects_a_very_steep_section() -> None:
    geometry = [
        {"latitude": 35.0, "longitude": 126.0, "elevation": 10.0},
        {"latitude": 35.001, "longitude": 126.0, "elevation": 20.0},
    ]

    ascent, descent, maximum, segments = _slope_metrics(geometry)

    assert ascent == 10.0
    assert descent == 0
    assert 8 <= maximum <= 10
    assert segments[0]["level"] == "very_steep"
    assert segments[0]["distance_m"] > 20


def test_slope_metrics_uses_wheelchair_friendly_thresholds() -> None:
    def level_for(grade_percent: float) -> str:
        distance = 22.2
        geometry = [
            {"latitude": 35.0, "longitude": 126.0, "elevation": 10.0},
            {
                "latitude": 35.0002,
                "longitude": 126.0,
                "elevation": 10.0 + distance * grade_percent / 100,
            },
        ]
        return _slope_metrics(geometry)[3][0]["level"]

    assert level_for(3.0) == "moderate"
    assert level_for(6.0) == "steep"
    assert level_for(9.0) == "very_steep"
    assert level_for(13.0) == "blocked"


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


def test_route_crossing_disaster_zone_is_blocked() -> None:
    zone = DisasterZone(
        id="flood-1",
        kind="flood",
        title="침수 통제",
        description="",
        latitude=35.0005,
        longitude=126.0,
        radius_m=30,
        severity=1,
    )
    geometry = [
        {"latitude": 35.0, "longitude": 126.0},
        {"latitude": 35.001, "longitude": 126.0},
    ]

    assert _route_intersects_disaster_zone(geometry, [zone]) is True


def test_wheelchair_profile_can_choose_a_flatter_small_detour() -> None:
    steep = _RouteCandidate(
        geometry=[], distance_m=100, hazards=(), max_grade_percent=10, ascent_m=8
    )
    flat = _RouteCandidate(
        geometry=[], distance_m=108, hazards=(), max_grade_percent=2, ascent_m=2
    )

    selected, _ = _select_candidate([steep, flat], "wheelchair", True)

    assert selected is flat


def test_general_profile_does_not_avoid_stairs_automatically() -> None:
    stairs = stair_candidate(100, True)
    detour = stair_candidate(105, False)

    selected, _ = _select_candidate([stairs, detour], "general", True)

    assert selected is stairs


def test_elderly_profile_adds_fifty_meter_stair_penalty() -> None:
    stairs = stair_candidate(100, True)
    detour = stair_candidate(120, False)

    selected, avoided = _select_candidate([stairs, detour], "elderly", True)

    assert selected is detour
    assert avoided == 1


def test_wheelchair_profile_rejects_stairs_and_uses_accessible_route() -> None:
    stairs = stair_candidate(100, True)
    accessible = stair_candidate(140, False)

    selected, _ = _select_candidate([stairs, accessible], "wheelchair", True)

    assert selected is accessible


def test_wheelchair_profile_reports_when_only_stair_route_exists() -> None:
    stairs = stair_candidate(100, True)

    try:
        _select_candidate([stairs], "wheelchair", True)
    except AccessibilityRouteBlocked as exc:
        assert "휠체어 접근 경로" in str(exc)
    else:
        raise AssertionError("계단뿐인 경로는 휠체어 경로로 선택하면 안 됩니다.")


def test_wheelchair_profile_rejects_sustained_blocked_slope() -> None:
    blocked = _RouteCandidate(
        geometry=[],
        distance_m=100,
        hazards=(),
        max_grade_percent=13,
        slope_segments=(
            {"grade_percent": 13, "distance_m": 25, "level": "blocked"},
        ),
    )
    accessible = _RouteCandidate(
        geometry=[], distance_m=140, hazards=(), max_grade_percent=5
    )

    selected, _ = _select_candidate([blocked, accessible], "wheelchair", True)

    assert selected is accessible
    assert _contains_blocked_wheelchair_slope(blocked) is True


def test_short_slope_spike_does_not_block_wheelchair_route() -> None:
    short_spike = _RouteCandidate(
        geometry=[],
        distance_m=100,
        hazards=(),
        max_grade_percent=13,
        slope_segments=(
            {"grade_percent": 13, "distance_m": 10, "level": "blocked"},
        ),
    )

    assert _contains_blocked_wheelchair_slope(short_spike) is False
