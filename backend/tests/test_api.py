"""
Integration Tests for Flask REST API Endpoints
"""

import pytest
from backend.app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_health_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "healthy"
    assert "benchmarkAvailable" in data


def test_presets_endpoint(client):
    response = client.get("/api/presets")
    assert response.status_code == 200
    data = response.get_json()
    assert data["success"] is True
    assert len(data["presets"]) >= 3
    assert data["presets"][0]["start"] in ["VJTI Mumbai", "VJTI College"]


def test_locations_endpoint(client):
    response = client.get("/api/locations")
    assert response.status_code == 200
    data = response.get_json()
    assert data["success"] is True
    assert len(data["locations"]) == 15
    location_names = [l["name"] for l in data["locations"]]
    assert "VJTI College" in location_names
    assert "Dharavi Junction" in location_names


def test_geocode_preset(client):
    response = client.get("/api/geocode?q=VJTI Mumbai")
    assert response.status_code == 200
    data = response.get_json()
    assert data["success"] is True
    assert pytest.approx(data["lat"], 0.01) == 19.022
    assert pytest.approx(data["lng"], 0.01) == 72.856


def test_geocode_missing_query(client):
    response = client.get("/api/geocode")
    assert response.status_code == 400
    data = response.get_json()
    assert "error" in data


def test_route_missing_body(client):
    response = client.post("/api/route", json=None)
    assert response.status_code == 400
    data = response.get_json()
    assert "error" in data


def test_route_missing_fields(client):
    response = client.post("/api/route", json={"start": "VJTI Mumbai"})
    assert response.status_code == 400


def test_route_identical_start_and_end(client):
    response = client.post("/api/route", json={"start": "VJTI Mumbai", "end": "VJTI Mumbai"})
    assert response.status_code == 400
    data = response.get_json()
    assert "cannot be identical" in data["error"].lower()


def test_route_end_to_end_benchmark(client):
    # Tests the core VJTI -> Dadar Station benchmark corridor
    response = client.post("/api/route", json={
        "start": "VJTI Mumbai",
        "end": "Dadar Station Mumbai"
    })
    assert response.status_code == 200
    data = response.get_json()
    assert data["success"] is True
    assert "route" in data
    route = data["route"]

    # Verify both shortest and safest routes are returned
    assert "safestRoute" in route
    assert "shortestRoute" in route
    assert "tradeoff" in route
    assert "safetyImprovement" in route

    # Verify route structures
    safest = route["safestRoute"]
    assert safest["totalDistanceKm"] > 0
    assert 0.0 <= safest["avgSafetyScore"] <= 1.0
    assert safest["safetyRating"] in ["Safe", "Moderate", "Unsafe"]
    assert len(safest["segments"]) > 0
    assert "cabTimeMin" in safest and safest["cabTimeMin"] > 0
    assert "walkTimeMin" in safest and safest["walkTimeMin"] > 0
    assert "cabTimeDeltaMin" in route["tradeoff"]
    assert "timeDeltaMin" in route["tradeoff"]
