from types import SimpleNamespace

from app.services.route_service import _RouteCandidate, _select_candidate


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
