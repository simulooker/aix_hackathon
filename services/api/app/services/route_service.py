"""OSMnx + NetworkX walk-network routing with a hazard-weighted A* cost.

Builds a pedestrian graph around the requested trip and runs a custom-weight
A* search using the cost function from the 기획서:

    cost = distance + S_i * a + G_i * b + Wslip * x

``S_i`` (파손 심각도) and ``G_i`` (경사 한계도) come from nearby hazard
reports' AI detection severity; ``Wslip`` comes from the weather service and
dynamically boosts a hazard's effective severity when it's near/below
freezing. ``a``, ``b``, ``x`` are per-profile weights (전동 휠체어 / 고령 보행자
/ 일반인) so the same map produces different safe routes per user.

If the OSMnx graph can't be downloaded (no network during a demo), this falls
back to a synthetic grid graph between origin and destination so the routing
endpoint still returns a usable, hazard-aware path.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from itertools import pairwise

import networkx as nx

from app.services.storage_service import HazardReport, get_nearby_reports
from app.services.weather_service import get_weather_risk

_logger = logging.getLogger(__name__)

# cost = distance + S_i*a + G_i*b + Wslip*x  (a/b/x are "extra meters" at severity 1.0)
_PROFILE_WEIGHTS: dict[str, dict[str, float]] = {
    "wheelchair": {"a": 400.0, "b": 600.0, "x": 300.0},
    "elderly": {"a": 200.0, "b": 250.0, "x": 250.0},
    "general": {"a": 60.0, "b": 60.0, "x": 80.0},
}

_HAZARD_INFLUENCE_RADIUS_M = 25.0
_GRAPH_CACHE_LIMIT = 12
_graph_cache: dict[tuple[float, float, float, float], nx.DiGraph] = {}


@dataclass
class RoutePoint:
    latitude: float
    longitude: float


@dataclass
class RouteResult:
    points: list[RoutePoint]
    distance_m: float
    hazards_avoided: int
    used_fallback_graph: bool


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _bbox_for(origin: RoutePoint, destination: RoutePoint) -> tuple[float, float, float, float]:
    lat_margin = max(0.008, abs(origin.latitude - destination.latitude) * 0.5 + 0.004)
    lon_margin = max(0.008, abs(origin.longitude - destination.longitude) * 0.5 + 0.004)
    north = round(max(origin.latitude, destination.latitude) + lat_margin, 3)
    south = round(min(origin.latitude, destination.latitude) - lat_margin, 3)
    east = round(max(origin.longitude, destination.longitude) + lon_margin, 3)
    west = round(min(origin.longitude, destination.longitude) - lon_margin, 3)
    return west, south, east, north


def _build_osmnx_graph(bbox: tuple[float, float, float, float]) -> nx.DiGraph:
    import osmnx as ox

    multidigraph = ox.graph_from_bbox(bbox, network_type="walk", simplify=True)
    return ox.convert.to_digraph(multidigraph, weight="length")


def _build_fallback_grid_graph(
    origin: RoutePoint, destination: RoutePoint, grid_size: int = 6
) -> nx.DiGraph:
    """A synthetic lattice used only when the real street network can't be fetched."""
    graph = nx.DiGraph()
    lat_span = destination.latitude - origin.latitude
    lon_span = destination.longitude - origin.longitude
    pad = 0.15  # extend slightly past the endpoints so the lattice isn't degenerate

    for row in range(grid_size + 1):
        for col in range(grid_size + 1):
            t_lat = -pad + (row / grid_size) * (1 + 2 * pad)
            t_lon = -pad + (col / grid_size) * (1 + 2 * pad)
            lat = origin.latitude + lat_span * t_lat
            lon = origin.longitude + lon_span * t_lon
            node_id = row * (grid_size + 1) + col
            graph.add_node(node_id, y=lat, x=lon)

    def add_edge(a: int, b: int) -> None:
        ay, ax = graph.nodes[a]["y"], graph.nodes[a]["x"]
        by, bx = graph.nodes[b]["y"], graph.nodes[b]["x"]
        length = haversine_m(ay, ax, by, bx)
        graph.add_edge(a, b, length=length)
        graph.add_edge(b, a, length=length)

    for row in range(grid_size + 1):
        for col in range(grid_size + 1):
            node_id = row * (grid_size + 1) + col
            if col < grid_size:
                add_edge(node_id, node_id + 1)
            if row < grid_size:
                add_edge(node_id, node_id + grid_size + 1)

    return graph


def _get_graph(origin: RoutePoint, destination: RoutePoint) -> tuple[nx.DiGraph, bool]:
    bbox = _bbox_for(origin, destination)
    cached = _graph_cache.get(bbox)
    if cached is not None:
        return cached, False

    try:
        graph = _build_osmnx_graph(bbox)
        if graph.number_of_nodes() < 2:
            raise ValueError("empty graph")
    except Exception:
        _logger.warning("OSMnx graph download failed; using synthetic fallback grid", exc_info=True)
        return _build_fallback_grid_graph(origin, destination), True

    if len(_graph_cache) >= _GRAPH_CACHE_LIMIT:
        _graph_cache.pop(next(iter(_graph_cache)))
    _graph_cache[bbox] = graph
    return graph, False


def _nearest_node(graph: nx.DiGraph, point: RoutePoint):
    return min(
        graph.nodes,
        key=lambda n: haversine_m(graph.nodes[n]["y"], graph.nodes[n]["x"], point.latitude, point.longitude),
    )


def _apply_hazard_costs(
    graph: nx.DiGraph,
    hazards: list[HazardReport],
    weather_slip_risk: float,
    weights: dict[str, float],
) -> None:
    for u, v, data in graph.edges(data=True):
        length = data.get("length", 0.0)
        mid_lat = (graph.nodes[u]["y"] + graph.nodes[v]["y"]) / 2
        mid_lon = (graph.nodes[u]["x"] + graph.nodes[v]["x"]) / 2

        penalty = 0.0
        for hazard in hazards:
            if haversine_m(mid_lat, mid_lon, hazard.latitude, hazard.longitude) > _HAZARD_INFLUENCE_RADIUS_M:
                continue
            severity = hazard.severity or 0.0
            effective_severity = min(1.0, severity * (1.0 + weather_slip_risk))
            penalty += (
                effective_severity * weights["a"]
                + severity * weights["b"]
                + weather_slip_risk * severity * weights["x"]
            )

        data["cost"] = length + penalty


def _hazards_near_path(graph: nx.DiGraph, path: list, hazards: list[HazardReport]) -> set[str]:
    nearby: set[str] = set()
    for u, v in pairwise(path):
        mid_lat = (graph.nodes[u]["y"] + graph.nodes[v]["y"]) / 2
        mid_lon = (graph.nodes[u]["x"] + graph.nodes[v]["x"]) / 2
        for hazard in hazards:
            if haversine_m(mid_lat, mid_lon, hazard.latitude, hazard.longitude) <= _HAZARD_INFLUENCE_RADIUS_M:
                nearby.add(hazard.id)
    return nearby


async def calculate_safe_route(
    origin: RoutePoint, destination: RoutePoint, profile: str = "general"
) -> RouteResult:
    weights = _PROFILE_WEIGHTS.get(profile, _PROFILE_WEIGHTS["general"])

    graph, used_fallback = _get_graph(origin, destination)
    orig_node = _nearest_node(graph, origin)
    dest_node = _nearest_node(graph, destination)

    mid_lat = (origin.latitude + destination.latitude) / 2
    mid_lon = (origin.longitude + destination.longitude) / 2
    search_radius = haversine_m(origin.latitude, origin.longitude, destination.latitude, destination.longitude) / 2 + 300
    hazards = await get_nearby_reports(mid_lat, mid_lon, search_radius)
    weather = await get_weather_risk(mid_lat, mid_lon)

    _apply_hazard_costs(graph, hazards, weather.slip_risk, weights)

    def heuristic(a, b) -> float:
        return haversine_m(graph.nodes[a]["y"], graph.nodes[a]["x"], graph.nodes[b]["y"], graph.nodes[b]["x"])

    safe_path = nx.astar_path(graph, orig_node, dest_node, heuristic=heuristic, weight="cost")
    shortest_path = nx.astar_path(graph, orig_node, dest_node, heuristic=heuristic, weight="length")

    distance_m = sum(graph[u][v]["length"] for u, v in pairwise(safe_path))
    hazards_on_shortest = _hazards_near_path(graph, shortest_path, hazards)
    hazards_on_safe = _hazards_near_path(graph, safe_path, hazards)
    hazards_avoided = len(hazards_on_shortest - hazards_on_safe)

    points = [RoutePoint(latitude=graph.nodes[n]["y"], longitude=graph.nodes[n]["x"]) for n in safe_path]

    return RouteResult(
        points=points,
        distance_m=round(distance_m, 1),
        hazards_avoided=hazards_avoided,
        used_fallback_graph=used_fallback,
    )
