import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import httpx

from app.schemas.environment import DisasterZone
from app.services import route_service


class DisasterRouteCandidatesTest(unittest.TestCase):
    def setUp(self):
        self.origin = SimpleNamespace(latitude=35.0, longitude=126.0)
        self.destination = SimpleNamespace(latitude=35.004, longitude=126.0)
        self.zone = DisasterZone(
            id="test-flood", kind="flood", title="테스트 통제구역",
            latitude=35.002, longitude=126.0, radius_m=30,
        )
        self.crossing = self.feature([[126.0, 35.0], [126.0, 35.004]], 445)
        self.detour = self.feature([
            [126.0, 35.0], [126.001, 35.0],
            [126.001, 35.004], [126.0, 35.004],
        ], 630)

    @staticmethod
    def feature(coordinates, distance):
        return {
            "geometry": {"coordinates": coordinates},
            "properties": {"summary": {"distance": distance}},
        }

    def calculate(self, features=None, error=None):
        client = MagicMock()
        client.__enter__.return_value = client
        if error:
            client.post.side_effect = error
        else:
            client.post.return_value = httpx.Response(200, json={"features": features})
        with patch.object(route_service, "ORS_API_KEY", "test-only"), patch.object(
            route_service.httpx, "Client", return_value=client
        ):
            return route_service.calculate_walking_route(
                self.origin, self.destination, [], "general", True, [self.zone]
            )

    def test_chooses_safe_detour_when_shortest_candidate_crosses_zone(self):
        result = self.calculate([self.crossing, self.detour])
        self.assertEqual(result.distance_m, 630)
        self.assertFalse(result.used_fallback)
        self.assertFalse(route_service._route_intersects_disaster_zone(
            result.geometry, [self.zone]
        ))

    def test_still_rejects_when_every_candidate_crosses_zone(self):
        with self.assertRaises(route_service.DisasterRouteBlocked):
            self.calculate([self.crossing])

    def test_avoid_polygon_boundary_clears_the_validated_disaster_circle(self):
        polygon = route_service._avoid_polygons([self.zone])
        ring = polygon["coordinates"][0][0]
        boundary = [{"latitude": lat, "longitude": lon} for lon, lat in ring]
        self.assertFalse(route_service._route_intersects_disaster_zone(
            boundary, [self.zone]
        ))

    def test_provider_failure_is_not_reported_as_a_confirmed_intersection(self):
        with self.assertRaises(ValueError) as caught:
            self.calculate(error=httpx.ConnectError("test unavailable"))
        self.assertNotIsInstance(caught.exception, route_service.DisasterRouteBlocked)
        self.assertIn("경로 서버", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
