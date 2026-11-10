from types import SimpleNamespace

import pytest

from app.schemas.navigation import Point, RouteRequest
from app.services import route_service as service

ORIGIN = Point(latitude=35, longitude=126)
DESTINATION = Point(latitude=35.002, longitude=126)
BLOCKED = Point(latitude=35.001, longitude=126)
DIRECT = [{"latitude": 35, "longitude": 126}, {"latitude": 35.002, "longitude": 126}]
DETOUR = [DIRECT[0], {"latitude": 35, "longitude": 126.001},
          {"latitude": 35.002, "longitude": 126.001}, DIRECT[-1]]


def mock_ors(monkeypatch, candidates, statuses=None):
    bodies = []
    monkeypatch.setattr(service, "ORS_API_KEY", "test-key")
    monkeypatch.setattr(service, "_parse_ors_candidates", lambda *_: candidates)
    codes = iter(statuses or [200])

    class Client:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def post(self, url, **kwargs):
            bodies.append(kwargs["json"])
            return SimpleNamespace(status_code=next(codes, 200), json=lambda: {}, text="test")

    monkeypatch.setattr(service.httpx, "Client", Client)
    return bodies


def candidate(geometry, distance):
    return service._RouteCandidate(geometry=geometry, distance_m=distance, hazards=())


@pytest.mark.parametrize("profile", ["general", "elderly", "wheelchair"])
def test_live_closure_is_mandatory_for_all_profiles(monkeypatch, profile):
    bodies = mock_ors(monkeypatch, [candidate(DIRECT, 222), candidate(DETOUR, 405)])
    result = service.calculate_walking_route(ORIGIN, DESTINATION, profile=profile, blocked_points=[BLOCKED])
    assert result.geometry == DETOUR
    assert not result.used_fallback
    assert bodies[0]["options"]["avoid_polygons"]


def test_no_safe_candidate_preserves_failure_instead_of_straight_line(monkeypatch):
    mock_ors(monkeypatch, [candidate(DIRECT, 222)])
    with pytest.raises(service.LiveHazardRouteBlocked):
        service.calculate_walking_route(ORIGIN, DESTINATION, blocked_points=[BLOCKED])


def test_relaxation_keeps_closures_and_wheelchair_restrictions(monkeypatch):
    hazard = SimpleNamespace(latitude=35.001, longitude=126, severity=1,
                             hazard_type="stairs", is_active=True)
    bodies = mock_ors(monkeypatch, [candidate(DETOUR, 405)], [400, 400, 200])
    service.calculate_walking_route(ORIGIN, DESTINATION, [hazard], "wheelchair", blocked_points=[BLOCKED])
    assert len(bodies) == 3
    assert bodies[2]["options"]["avoid_polygons"]
    assert bodies[2]["options"]["profile_params"]["restrictions"]["maximum_incline"] == 8


def test_network_failure_does_not_return_direct_route(monkeypatch):
    bodies = mock_ors(monkeypatch, [], [503])
    with pytest.raises(service.LiveHazardRouteBlocked):
        service.calculate_walking_route(ORIGIN, DESTINATION, blocked_points=[BLOCKED])
    assert bodies


def test_distant_snapping_is_not_a_valid_bypass(monkeypatch):
    mock_ors(monkeypatch, [candidate(DETOUR[1:-1], 222)])
    with pytest.raises(service.LiveHazardRouteBlocked):
        service.calculate_walking_route(ORIGIN, DESTINATION, blocked_points=[BLOCKED])


def test_closure_coordinates_and_count_are_bounded():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        RouteRequest(origin=ORIGIN, destination=DESTINATION, blocked_points=[BLOCKED] * 33)
    with pytest.raises(ValidationError):
        Point(latitude=100, longitude=126)
