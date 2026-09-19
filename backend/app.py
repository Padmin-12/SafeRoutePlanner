"""
SafeRoutePlanner — Flask REST API Server
========================================
Main application entry point providing:
- Health check and cache telemetry: GET /api/health
- 15 bundled core Mumbai locations: GET /api/locations
- Preset demonstration corridors: GET /api/presets
- Address geocoding: GET /api/geocode
- Multi-criteria safe route planning: POST /api/route
"""

import os
import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS
import networkx as nx
import osmnx as ox

try:
    from backend.engine.cache import (
        get_or_build_graph,
        get_bundled_benchmark_graph,
        _memory_cache,
    )
    from backend.engine.routing import compute_dual_routes
except ModuleNotFoundError as e:
    if e.name != "backend":
        raise
    from engine.cache import (
        get_or_build_graph,
        get_bundled_benchmark_graph,
        _memory_cache,
    )
    from engine.routing import compute_dual_routes
app = Flask(__name__)
CORS(app)

# The 15 core bundled Mumbai locations (VJTI - Dadar - Matunga - Wadala corridor)
BUNDLED_LOCATIONS = [
    {"id": "VJTI",            "name": "VJTI College",          "lat": 19.0228, "lng": 72.8551},
    {"id": "Matunga_E",       "name": "Matunga East Station",  "lat": 19.0262, "lng": 72.8576},
    {"id": "Matunga_W",       "name": "Matunga West Station",  "lat": 19.0267, "lng": 72.8497},
    {"id": "Dharavi_Jn",      "name": "Dharavi Junction",      "lat": 19.0406, "lng": 72.8543},
    {"id": "Sion_Circle",     "name": "Sion Circle",           "lat": 19.0373, "lng": 72.8629},
    {"id": "KingCircle",      "name": "King's Circle",         "lat": 19.0291, "lng": 72.8534},
    {"id": "Parel_Naka",      "name": "Parel Naka",            "lat": 19.0145, "lng": 72.8445},
    {"id": "Dadar_TT",        "name": "Dadar TT Circle",       "lat": 19.0186, "lng": 72.8449},
    {"id": "Dadar_W_Station", "name": "Dadar West Station",    "lat": 19.0178, "lng": 72.8410},
    {"id": "Dadar_E_Station", "name": "Dadar East Station",    "lat": 19.0186, "lng": 72.8449},
    {"id": "ShivajiBridge",   "name": "Shivaji Bridge",        "lat": 19.0237, "lng": 72.8434},
    {"id": "Naigaon",         "name": "Naigaon Junction",      "lat": 19.0320, "lng": 72.8482},
    {"id": "CottonGreen",     "name": "Cotton Green Road",     "lat": 19.0108, "lng": 72.8540},
    {"id": "Antop_Hill",      "name": "Antop Hill",            "lat": 19.0357, "lng": 72.8733},
    {"id": "Wadala",          "name": "Wadala",                "lat": 19.0258, "lng": 72.8659},
]

# Preset corridors for demonstration
PRESET_ROUTES = [
    {
        "id": "vjti-dadar",
        "name": "VJTI → Dadar West Station",
        "start": "VJTI College",
        "end": "Dadar West Station",
        "startCoord": {"lat": 19.0228, "lng": 72.8551},
        "endCoord": {"lat": 19.0178, "lng": 72.8410},
        "description": "Primary student commute route through Matunga and Dadar."
    },
    {
        "id": "vjti-dharavi-bypass",
        "name": "VJTI → Dadar East (Dharavi Bypass)",
        "start": "VJTI College",
        "end": "Dadar East Station",
        "startCoord": {"lat": 19.0228, "lng": 72.8551},
        "endCoord": {"lat": 19.0186, "lng": 72.8449},
        "description": "Demonstrates avoiding the isolated Dharavi shortcut in favor of well-lit Matunga."
    },
    {
        "id": "matunga-sion",
        "name": "Matunga East → Sion Circle",
        "start": "Matunga East Station",
        "end": "Sion Circle",
        "startCoord": {"lat": 19.0262, "lng": 72.8576},
        "endCoord": {"lat": 19.0373, "lng": 72.8629},
        "description": "Transit corridor connecting railway station to Sion Circle."
    },
    {
        "id": "kingscircle-dadartt",
        "name": "King's Circle → Dadar TT Circle",
        "start": "King's Circle",
        "end": "Dadar TT Circle",
        "startCoord": {"lat": 19.0291, "lng": 72.8534},
        "endCoord": {"lat": 19.0186, "lng": 72.8449},
        "description": "Commercial arterial avenue with high natural surveillance."
    },
    {
        "id": "wadala-antophill",
        "name": "Wadala → Antop Hill",
        "start": "Wadala",
        "end": "Antop Hill",
        "startCoord": {"lat": 19.0258, "lng": 72.8659},
        "endCoord": {"lat": 19.0357, "lng": 72.8733},
        "description": "Harbor line corridor connecting Wadala and Antop Hill."
    }
]

# Fast in-memory lookup cache for bundled locations and presets
PRESET_COORDS = {}

for loc in BUNDLED_LOCATIONS:
    c = (loc["lat"], loc["lng"])
    PRESET_COORDS[loc["id"].lower()] = c
    PRESET_COORDS[loc["name"].lower()] = c
    PRESET_COORDS[f"{loc['name'].lower()} mumbai"] = c

# Also add common variations
PRESET_COORDS["vjti mumbai"] = (19.0228, 72.8551)
PRESET_COORDS["dadar station mumbai"] = (19.0178, 72.8410)
PRESET_COORDS["dadar station"] = (19.0178, 72.8410)
PRESET_COORDS["wadala mumbai"] = (19.0258, 72.8659)
PRESET_COORDS["chembur mumbai"] = (19.0548, 72.8980)
PRESET_COORDS["cst station mumbai"] = (18.9405, 72.8358)
PRESET_COORDS["churchgate mumbai"] = (18.9322, 72.8264)


def resolve_geocode(location_str: str):
    """
    Resolve location string to (lat, lon).
    Checks preset lookup first for instantaneous resolution, then queries Nominatim via OSMnx.
    """
    cleaned = location_str.strip().lower()
    if cleaned in PRESET_COORDS:
        return PRESET_COORDS[cleaned]

    # Partial match against bundled locations
    for name, coords in PRESET_COORDS.items():
        if cleaned == name or (len(cleaned) > 4 and cleaned in name):
            return coords

    try:
        point = ox.geocode(location_str)
        return point
    except Exception as e:
        raise ValueError(f"Could not locate '{location_str}'. Please enter a recognizable landmark or address in Mumbai.")


@app.route("/api/health", methods=["GET"])
def health():
    """Health check and telemetry endpoint."""
    benchmark = get_bundled_benchmark_graph()
    return jsonify({
        "status": "healthy",
        "service": "SafeRoutePlanner Backend API",
        "version": "2.1.0",
        "benchmarkAvailable": (benchmark is not None),
        "bundledLocationsCount": len(BUNDLED_LOCATIONS),
        "cachedCities": len(_memory_cache),
    })


@app.route("/api/locations", methods=["GET"])
def locations():
    """Return all 15 bundled core Mumbai locations."""
    return jsonify({
        "success": True,
        "locations": BUNDLED_LOCATIONS
    })


@app.route("/api/presets", methods=["GET"])
def presets():
    """Return verified demonstration routes for quick testing."""
    return jsonify({
        "success": True,
        "presets": PRESET_ROUTES,
        "locations": BUNDLED_LOCATIONS
    })


@app.route("/api/geocode", methods=["GET"])
def geocode():
    """Geocode an address string to coordinates."""
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"error": "Query parameter 'q' is required."}), 400

    try:
        lat, lon = resolve_geocode(q)
        return jsonify({
            "success": True,
            "query": q,
            "lat": round(float(lat), 5),
            "lng": round(float(lon), 5),
        })
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        return jsonify({"error": f"Geocoding service unavailable: {str(e)}"}), 503


@app.route("/api/route", methods=["POST"])
def compute_route():
    """
    Compute shortest vs. safest route between two addresses.
    Payload: { "start": "VJTI College", "end": "Dadar West Station" }
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request. JSON body required with 'start' and 'end' fields."}), 400

    start_str = str(data.get("start", "")).strip()
    end_str = str(data.get("end", "")).strip()

    if not start_str or not end_str:
        return jsonify({"error": "Both 'start' and 'end' location strings are required."}), 400

    if start_str.lower() == end_str.lower():
        return jsonify({"error": "Start location and destination cannot be identical."}), 400

    try:
        # 1. Geocode origin and destination
        orig_lat, orig_lon = resolve_geocode(start_str)
        dest_lat, dest_lon = resolve_geocode(end_str)

        # 2. Compute dynamic adaptive radius
        mid_lat = (orig_lat + dest_lat) / 2.0
        mid_lon = (orig_lon + dest_lon) / 2.0
        od_dist_m = ox.distance.great_circle(orig_lat, orig_lon, dest_lat, dest_lon)
        adaptive_radius = max(6000, int(od_dist_m / 2.0 + 2500))

        # 3. Get road network graph (checks bundled benchmark first, then cache, then OSM)
        G = get_or_build_graph(mid_lat, mid_lon, radius_meters=adaptive_radius)

        # 4. Compute dual shortest and safest routes via Dijkstra
        result = compute_dual_routes(
            G=G,
            orig_lat=orig_lat,
            orig_lon=orig_lon,
            dest_lat=dest_lat,
            dest_lon=dest_lon,
            start_name=start_str,
            end_name=end_str
        )

        return jsonify({
            "success": True,
            "start": {
                "name": start_str,
                "lat": round(float(orig_lat), 5),
                "lng": round(float(orig_lon), 5)
            },
            "end": {
                "name": end_str,
                "lat": round(float(dest_lat), 5),
                "lng": round(float(dest_lon), 5)
            },
            "route": result,
        })

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except nx.NetworkXNoPath:
        return jsonify({"error": "No connected route found between these locations on the street network."}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Failed to compute route: {str(e)}"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"\n SafeRoutePlanner Backend API starting on port {port}")
    print(f" Endpoints: http://localhost:{port}/api/health | http://localhost:{port}/api/locations\n")
    app.run(host="0.0.0.0", port=port, debug=True)
