"""
SafeRoutePlanner — Graph Routing Engine
=======================================
Implements Dijkstra's algorithm over NetworkX road networks to compute:
1. Shortest Path (minimizing physical length in metres)
2. Safest Path (minimizing safety-penalized cost = length / safety_score)
3. Quantitative trade-off analysis comparing both routes.
"""

import networkx as nx
import numpy as np

try:
    from backend.engine.scoring import get_safety_rating
except ModuleNotFoundError:
    from engine.scoring import get_safety_rating


def get_node_label(G, node, index: int, total_nodes: int, custom_start: str = None, custom_end: str = None) -> str:
    """Return a descriptive label for a graph node."""
    if index == 0:
        return custom_start or "Start"
    if index == total_nodes - 1:
        return custom_end or "Destination"

    # Search incident edges for an OSM street name
    edges_from = list(G.edges(node, data=True, keys=True))
    for _, _, _, data in edges_from:
        name = data.get("name", None)
        if name:
            if isinstance(name, list):
                name = name[0]
            if str(name).strip():
                return str(name)
    return f"Waypoint {index + 1}"


def extract_path_metrics(G, path: list, custom_start: str = None, custom_end: str = None) -> dict:
    """
    Given a node sequence along graph G, extracts coordinates,
    segment breakdown, distances, and aggregate safety metrics.
    """
    total_nodes = len(path)
    path_coords = []
    for i, node in enumerate(path):
        node_data = G.nodes[node]
        name = get_node_label(G, node, i, total_nodes, custom_start, custom_end)
        path_coords.append({
            "id":   str(node),
            "lat":  float(node_data.get("y", 0.0)),
            "lng":  float(node_data.get("x", 0.0)),
            "name": name,
        })

    edges_in = list(zip(path[:-1], path[1:]))
    lengths = []
    scores = []
    segments = []

    for i, (u, v) in enumerate(edges_in):
        edge_dict = G[u][v]
        k = list(edge_dict.keys())[0]
        data = edge_dict[k]

        s = float(data.get("safety_score", 0.50))
        ln = float(data.get("length", 0.0))
        lengths.append(ln)
        scores.append(s)

        # Standardized sub-features in [0.0, 1.0]
        # lighting: 1=bright, 0=dark
        # crowd/activity: 1=busy, 0=deserted
        # police: 1=close, 0=far
        # risk: 1=close to hazard, 0=safe from hazard (1 - f_risk)
        f_light = float(data.get("f_lighting", s))
        f_act = float(data.get("f_activity", s))
        f_pol = float(data.get("f_police", 0.5))
        f_risk_dist = float(data.get("f_risk", 0.5))
        risk_level = float(np.clip(1.0 - f_risk_dist, 0.0, 1.0))

        f_conn = float(data.get("f_connectivity", data.get("f_intersection", 0.5)))

        segments.append({
            "from":         str(u),
            "to":           str(v),
            "fromName":     path_coords[i]["name"],
            "toName":       path_coords[i + 1]["name"],
            "distanceKm":   round(ln / 1000.0, 3),
            "safetyScore":  round(s, 3),
            "lighting":     round(f_light, 3),
            "crowd":        round(f_act, 3),
            "police":       round(f_pol, 3),
            "connectivity": round(f_conn, 3),
            "risk":         round(risk_level, 3),
            "crime":        round(risk_level, 3),  # Backwards-compatible alias
        })

    total_len_m = sum(lengths)
    total_km = round(total_len_m / 1000.0, 2)
    avg_score = round(float(np.mean(scores)), 3) if scores else 0.50
    rating = get_safety_rating(avg_score)
    walk_time_min = max(1, round((total_km / 4.0) * 60))   # Walking speed 4 km/h
    cab_time_min  = max(1, round((total_km / 25.0) * 60))  # Auto / Cab speed ~25 km/h urban traffic

    return {
        "path":             [str(n) for n in path],
        "pathNames":        [c["name"] for c in path_coords],
        "pathCoords":       path_coords,
        "segments":         segments,
        "totalDistanceKm":  total_km,
        "avgSafetyScore":   avg_score,
        "safetyRating":     rating,
        "estimatedTimeMin": walk_time_min,  # Backwards compatibility
        "walkTimeMin":      walk_time_min,
        "cabTimeMin":       cab_time_min,
        "nodeCount":        total_nodes,
    }


def compute_dual_routes(G, orig_lat: float, orig_lon: float, dest_lat: float, dest_lon: float,
                         start_name: str = None, end_name: str = None, ox_module=None) -> dict:
    """
    Finds nearest nodes on graph G, computes shortest and safest paths,
    and returns comprehensive comparative metrics.
    """
    import osmnx as ox
    if ox_module:
        ox = ox_module

    # Map geographic coordinates to nearest network graph nodes
    orig_node = ox.distance.nearest_nodes(G, X=orig_lon, Y=orig_lat)
    dest_node = ox.distance.nearest_nodes(G, X=dest_lon, Y=dest_lat)

    if orig_node == dest_node:
        raise ValueError("Origin and destination resolved to the same road intersection. Please select points further apart.")

    # Compute paths via Dijkstra
    shortest_path = nx.shortest_path(G, orig_node, dest_node, weight="length")
    safest_path = nx.shortest_path(G, orig_node, dest_node, weight="safe_cost")

    shortest_stats = extract_path_metrics(G, shortest_path, start_name, end_name)
    safest_stats = extract_path_metrics(G, safest_path, start_name, end_name)

    # Comparative trade-off metrics
    is_same = (shortest_path == safest_path)
    score_diff = safest_stats["avgSafetyScore"] - shortest_stats["avgSafetyScore"]
    
    improvement_pct = 0.0
    if shortest_stats["avgSafetyScore"] > 0:
        improvement_pct = round((score_diff / shortest_stats["avgSafetyScore"]) * 100.0, 1)

    dist_delta_km = round(safest_stats["totalDistanceKm"] - shortest_stats["totalDistanceKm"], 2)
    dist_delta_pct = 0.0
    if shortest_stats["totalDistanceKm"] > 0:
        dist_delta_pct = round((dist_delta_km / shortest_stats["totalDistanceKm"]) * 100.0, 1)

    time_delta_min = max(0, safest_stats["walkTimeMin"] - shortest_stats["walkTimeMin"])
    cab_time_delta = max(0, safest_stats["cabTimeMin"] - shortest_stats["cabTimeMin"])

    # Count high-risk segments (< 0.35) in shortest that are avoided in safest
    shortest_risky = sum(1 for s in shortest_stats["segments"] if s["safetyScore"] < 0.35)
    safest_risky = sum(1 for s in safest_stats["segments"] if s["safetyScore"] < 0.35)
    risky_avoided = max(0, shortest_risky - safest_risky)

    tradeoff = {
        "isSameRoute":        is_same,
        "safetyImprovementPct": improvement_pct,
        "distanceDeltaKm":    dist_delta_km,
        "distanceDeltaPct":   dist_delta_pct,
        "timeDeltaMin":       time_delta_min,
        "cabTimeDeltaMin":    cab_time_delta,
        "riskySegmentsAvoided": risky_avoided,
    }

    return {
        "safestRoute":       safest_stats,
        "shortestRoute":     shortest_stats,
        "safetyImprovement": improvement_pct,
        "sameRoute":         is_same,
        "tradeoff":          tradeoff,
    }
