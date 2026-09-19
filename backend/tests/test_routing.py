"""
Unit Tests for Graph Routing Algorithms
"""

import pytest
import networkx as nx

from backend.engine.routing import extract_path_metrics, get_node_label
from backend.engine.scoring import calculate_safe_cost


@pytest.fixture
def synthetic_graph():
    """
    Creates a synthetic graph with two distinct paths between Node A and Node C:
    Path 1 (Dark Alley):
      A -> B_dark -> C
      Distance: 100m + 100m = 200m (Shortest)
      Safety: 0.10 (High risk)
      Cost: 100/0.1 + 100/0.1 = 2000.0

    Path 2 (Well-Lit Boulevard):
      A -> B_lit -> C
      Distance: 150m + 150m = 300m (Longer)
      Safety: 0.90 (Very safe)
      Cost: 150/0.9 + 150/0.9 = 333.3
    """
    G = nx.MultiDiGraph()
    G.graph["crs"] = "EPSG:4326"

    # Add nodes with coordinates
    G.add_node("A", x=72.850, y=19.020)
    G.add_node("B_dark", x=72.851, y=19.021)
    G.add_node("B_lit", x=72.849, y=19.022)
    G.add_node("C", x=72.852, y=19.023)

    # Edge 1: Dark route (short, dangerous)
    G.add_edge("A", "B_dark", key=0, length=100.0, safety_score=0.10, safe_cost=calculate_safe_cost(100.0, 0.10), name="Dark Alley")
    G.add_edge("B_dark", "C", key=0, length=100.0, safety_score=0.10, safe_cost=calculate_safe_cost(100.0, 0.10), name="Dark Alley")

    # Edge 2: Lit route (longer, safe)
    G.add_edge("A", "B_lit", key=0, length=150.0, safety_score=0.90, safe_cost=calculate_safe_cost(150.0, 0.90), name="Bright Avenue")
    G.add_edge("B_lit", "C", key=0, length=150.0, safety_score=0.90, safe_cost=calculate_safe_cost(150.0, 0.90), name="Bright Avenue")

    return G


def test_shortest_vs_safest_path_selection(synthetic_graph):
    G = synthetic_graph

    # Shortest path minimizes 'length'
    shortest_path = nx.shortest_path(G, "A", "C", weight="length")
    assert shortest_path == ["A", "B_dark", "C"]

    # Safest path minimizes 'safe_cost'
    safest_path = nx.shortest_path(G, "A", "C", weight="safe_cost")
    assert safest_path == ["A", "B_lit", "C"]


def test_extract_path_metrics(synthetic_graph):
    G = synthetic_graph
    path = ["A", "B_lit", "C"]
    metrics = extract_path_metrics(G, path, custom_start="Home", custom_end="Station")

    assert metrics["totalDistanceKm"] == 0.30  # 300m = 0.3km
    assert metrics["avgSafetyScore"] == 0.90
    assert metrics["safetyRating"] == "Safe"
    assert len(metrics["segments"]) == 2
    assert metrics["pathCoords"][0]["name"] == "Home"
    assert metrics["pathCoords"][-1]["name"] == "Station"
    assert "cabTimeMin" in metrics and metrics["cabTimeMin"] >= 1
    assert "walkTimeMin" in metrics and metrics["walkTimeMin"] >= 1


def test_disconnected_graph_raises_no_path():
    G = nx.MultiDiGraph()
    G.add_node("A", x=72.0, y=19.0)
    G.add_node("B", x=73.0, y=20.0)

    with pytest.raises(nx.NetworkXNoPath):
        nx.shortest_path(G, "A", "B", weight="safe_cost")
