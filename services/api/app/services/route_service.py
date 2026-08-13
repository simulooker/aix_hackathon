import logging
from dataclasses import dataclass
from functools import lru_cache
from itertools import pairwise
from math import asin, cos, radians, sin, sqrt
from typing import Any

logger = logging.getLogger(__name__)

MAX_WALKING_DISTANCE_M = 8_000
MIN_GRAPH_RADIUS_M = 750
GRAPH_MARGIN_M = 600


@dataclass(frozen=True)
class RouteResult:
    geometry: list[dict[str, float]]
    distance_m: float
    hazards_avoided: int


def distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    value = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    )
    return 6_371_000 * 2 * asin(sqrt(value))


def _graph_cache_key(
    latitude: float, longitude: float, radius_m: float
) -> tuple[float, float, int]:
    # Nearby requests share one graph. The radius is rounded upward so the
    # cached graph never becomes smaller than the requested area.
    radius_bucket = max(MIN_GRAPH_RADIUS_M, int((radius_m + 499) // 500) * 500)
    return round(latitude, 3), round(longitude, 3), radius_bucket


@lru_cache(maxsize=2)
def _walking_graph(latitude: float, longitude: float, radius_m: int) -> Any:
    import osmnx as ox

    ox.settings.use_cache = True
    ox.settings.requests_timeout = 45
    return ox.graph.graph_from_point(
        (latitude, longitude),
        dist=radius_m,
        network_type="walk",
        simplify=True,
        retain_all=False,
    )


def _edge_coordinates(graph: Any, start: int, end: int) -> list[tuple[float, float]]:
    edges = graph.get_edge_data(start, end)
    if not edges:
        return [
            (graph.nodes[start]["x"], graph.nodes[start]["y"]),
            (graph.nodes[end]["x"], graph.nodes[end]["y"]),
        ]
    edge = min(
        edges.values(), key=lambda value: float(value.get("length", float("inf")))
    )
    geometry = edge.get("geometry")
    coordinates = (
        list(geometry.coords)
        if geometry is not None
        else [
            (graph.nodes[start]["x"], graph.nodes[start]["y"]),
            (graph.nodes[end]["x"], graph.nodes[end]["y"]),
        ]
    )
    start_coordinate = (graph.nodes[start]["x"], graph.nodes[start]["y"])
    if distance_meters(
        start_coordinate[1], start_coordinate[0], coordinates[-1][1], coordinates[-1][0]
    ) < distance_meters(
        start_coordinate[1], start_coordinate[0], coordinates[0][1], coordinates[0][0]
    ):
        coordinates.reverse()
    return coordinates


def _nearby_hazard_count(
    graph: Any, nodes: list[int], hazards: list[Any], radius_m: float = 25
) -> int:
    count = 0
    for hazard in hazards:
        if any(
            distance_meters(
                hazard.latitude,
                hazard.longitude,
                graph.nodes[node]["y"],
                graph.nodes[node]["x"],
            )
            <= radius_m
            for node in nodes
        ):
            count += 1
    return count


def calculate_walking_route(
    origin: Any,
    destination: Any,
    hazards: list[Any] | None = None,
    profile: str = "general",
    prefer_safe_route: bool = True,
) -> RouteResult:
    import networkx as nx

    direct_distance = distance_meters(
        origin.latitude, origin.longitude, destination.latitude, destination.longitude
    )
    if direct_distance > MAX_WALKING_DISTANCE_M:
        raise ValueError(
            f"도보 경로는 {MAX_WALKING_DISTANCE_M // 1000}km 이내에서 검색해 주세요."
        )

    center_latitude = (origin.latitude + destination.latitude) / 2
    center_longitude = (origin.longitude + destination.longitude) / 2
    radius = direct_distance / 2 + GRAPH_MARGIN_M
    cache_key = _graph_cache_key(center_latitude, center_longitude, radius)
    graph = _walking_graph(*cache_key)
    hazards = hazards or []

    # Only two points are matched, so a direct scan avoids pulling in optional
    # nearest-neighbour dependencies such as scikit-learn.
    origin_node = min(
        graph.nodes,
        key=lambda node: distance_meters(
            origin.latitude,
            origin.longitude,
            graph.nodes[node]["y"],
            graph.nodes[node]["x"],
        ),
    )
    destination_node = min(
        graph.nodes,
        key=lambda node: distance_meters(
            destination.latitude,
            destination.longitude,
            graph.nodes[node]["y"],
            graph.nodes[node]["x"],
        ),
    )

    def heuristic(first: int, second: int) -> float:
        return distance_meters(
            graph.nodes[first]["y"],
            graph.nodes[first]["x"],
            graph.nodes[second]["y"],
            graph.nodes[second]["x"],
        )

    shortest_nodes = nx.astar_path(
        graph,
        int(origin_node),
        int(destination_node),
        heuristic=heuristic,
        weight="length",
    )
    profile_multiplier = {"general": 1.0, "elderly": 1.6, "wheelchair": 2.2}.get(
        profile, 1.0
    )
    if prefer_safe_route and hazards:
        for node in graph.nodes:
            node_latitude = graph.nodes[node]["y"]
            node_longitude = graph.nodes[node]["x"]
            penalty = 0.0
            for hazard in hazards:
                severity = max(0.0, min(1.0, float(hazard.severity)))
                influence_radius = 15 + severity * 30
                distance = distance_meters(
                    node_latitude, node_longitude, hazard.latitude, hazard.longitude
                )
                if distance < influence_radius:
                    penalty = max(penalty, severity * (1 - distance / influence_radius))
            graph.nodes[node]["hazard_penalty"] = penalty
        for start, end, key, edge in graph.edges(keys=True, data=True):
            penalty = max(
                graph.nodes[start]["hazard_penalty"], graph.nodes[end]["hazard_penalty"]
            )
            edge["safe_weight"] = float(edge.get("length", 0)) * (
                1 + 8 * profile_multiplier * penalty
            )
        nodes = nx.astar_path(
            graph,
            int(origin_node),
            int(destination_node),
            heuristic=heuristic,
            weight="safe_weight",
        )
    else:
        nodes = shortest_nodes
    coordinates: list[tuple[float, float]] = [(origin.longitude, origin.latitude)]
    distance = distance_meters(
        origin.latitude,
        origin.longitude,
        graph.nodes[origin_node]["y"],
        graph.nodes[origin_node]["x"],
    )
    for start, end in pairwise(nodes):
        edge_coordinates = _edge_coordinates(graph, start, end)
        coordinates.extend(edge_coordinates[1:])
        edges = graph.get_edge_data(start, end)
        distance += min(float(edge.get("length", 0)) for edge in edges.values())
    coordinates.append((destination.longitude, destination.latitude))
    distance += distance_meters(
        graph.nodes[destination_node]["y"],
        graph.nodes[destination_node]["x"],
        destination.latitude,
        destination.longitude,
    )

    # Remove consecutive duplicate points before returning mobile geometry.
    compact: list[tuple[float, float]] = []
    for coordinate in coordinates:
        if not compact or coordinate != compact[-1]:
            compact.append(coordinate)
    return RouteResult(
        geometry=[
            {"latitude": latitude, "longitude": longitude}
            for longitude, latitude in compact
        ],
        distance_m=round(distance),
        hazards_avoided=max(
            0,
            _nearby_hazard_count(graph, shortest_nodes, hazards)
            - _nearby_hazard_count(graph, nodes, hazards),
        ),
    )
