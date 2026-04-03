"""
SafeRoutePlanner — Flask API
============================
Handles any city worldwide. Takes start/end as text addresses,
geocodes them, fetches OSM road network, scores edges, routes.

Setup (run once):
    pip install flask flask-cors osmnx geopandas networkx shapely numpy

Run:
    python app.py

API:
    POST /api/route   { "start": "VJTI Mumbai", "end": "Dadar Station Mumbai" }
    GET  /api/health
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import osmnx as ox
import geopandas as gpd
import networkx as nx
import numpy as np
from shapely.ops import unary_union
import traceback
import time

app = Flask(__name__)
CORS(app)  # allow React frontend on port 5173 to call this

# ── In-memory cache so same city isn't re-fetched every request ──
# { "mumbai": { "G": ..., "roads": ..., "timestamp": ... } }
_graph_cache = {}
CACHE_TTL = 3600  # seconds — re-fetch after 1 hour

# ── OSM Feature Tags ─────────────────────────────────────────────
ACTIVITY_TAGS = {"amenity": True, "shop": True, "leisure": True}

RISK_TAGS = {
    "amenity": ["bar", "pub", "nightclub", "atm", "bank"],
    "landuse": ["industrial", "construction", "warehouse"],
    "highway": ["bus_stop"],
    "railway": ["station", "subway_entrance"],
}

ROAD_LIGHT = {
    "motorway": 3, "trunk": 3, "primary": 3,
    "secondary": 2, "tertiary": 2,
    "residential": 1, "unclassified": 1,
    "service": 0, "footway": 0, "path": 0,
}


def get_utm_epsg(lon):
    """Get UTM zone EPSG for a longitude."""
    zone = int((lon + 180) / 6) + 1
    return 32600 + zone  # northern hemisphere (good for India)


def minmax(series):
    import pandas as pd
    lo, hi = series.min(), series.max()
    if hi == lo:
        return pd.Series(0.5, index=series.index)
    return (series - lo) / (hi - lo)


def geocode_location(location_str):
    """Convert a text address to (lat, lon) using OSMnx / Nominatim."""
    try:
        point = ox.geocode(location_str)  # returns (lat, lon)
        return point
    except Exception as e:
        raise ValueError(f"Could not geocode '{location_str}': {str(e)}")


def get_city_key(lat, lon):
    """Generate a cache key from approximate location (1° grid)."""
    return f"{round(lat, 0)}_{round(lon, 0)}"


def build_scored_graph(lat, lon):
    """
    Fetch OSM road network around (lat, lon), score every edge,
    return the NetworkX graph with safety_score and safe_cost on edges.
    """
    UTM = get_utm_epsg(lon)
    LAMP_BUFFER = 50    # metres

    print(f"  Fetching road network around ({lat:.4f}, {lon:.4f})...")
    G = ox.graph_from_point(
        (lat, lon),
        dist=6000,          # 6 km radius
        network_type="drive"
    )

    edges = ox.graph_to_gdfs(G, nodes=False, fill_edge_geometry=True).reset_index()
    edges["segment_id"] = edges.index
    roads = edges[["segment_id", "u", "v", "key", "geometry", "highway", "length"]].copy()
    roads = roads.set_crs(4326).to_crs(UTM)

    # ── Feature 1: Lighting ──────────────────────────────────
    print("  Scoring lighting...")
    roads["road_type_light"] = (
        roads["highway"]
        .apply(lambda x: x[0] if isinstance(x, list) else x)
        .map(ROAD_LIGHT)
        .fillna(1)
    )

    try:
        lamps_raw = ox.features_from_point(
            (lat, lon), dist=6500,
            tags={"highway": "street_lamp"}
        )
        lamps = lamps_raw[lamps_raw.geometry.type == "Point"].to_crs(UTM)
        road_buf = roads[["segment_id", "geometry"]].copy()
        road_buf["geometry"] = road_buf.geometry.buffer(LAMP_BUFFER)
        joined = gpd.sjoin(road_buf, lamps[["geometry"]], how="left", predicate="contains")
        lamp_counts = joined[joined["index_right"].notna()].groupby("segment_id").size()
        roads["lamp_count"] = roads["segment_id"].map(lamp_counts).fillna(0).astype(int)
    except Exception:
        roads["lamp_count"] = 0

    roads["lighting_raw"] = roads["lamp_count"] * 2 + roads["road_type_light"] * 5

    # ── Feature 2: Police proximity ──────────────────────────
    print("  Scoring police proximity...")
    try:
        police_raw = ox.features_from_point(
            (lat, lon), dist=6500,
            tags={"amenity": "police"}
        )
        police = police_raw.to_crs(UTM)
        police_sindex = police.sindex

        def dist_to_nearest_police(geom):
            candidates = list(police_sindex.nearest(geom, 1))
            return geom.distance(police.iloc[candidates[0]].geometry)

        roads["dist_police"] = roads.geometry.apply(dist_to_nearest_police)
    except Exception:
        roads["dist_police"] = 15000.0

    # ── Feature 3: Activity density ──────────────────────────
    print("  Scoring activity density...")
    try:
        activity_raw = ox.features_from_point(
            (lat, lon), dist=6500,
            tags=ACTIVITY_TAGS
        )
        activity = activity_raw[activity_raw.geometry.type == "Point"].to_crs(UTM)
        road_buf2 = roads[["segment_id", "geometry"]].copy()
        road_buf2["geometry"] = road_buf2.geometry.buffer(LAMP_BUFFER)
        joined_act = gpd.sjoin(
            activity[["geometry"]], road_buf2,
            how="inner", predicate="intersects"
        )
        act_counts = joined_act.groupby("segment_id").size()
        roads["activity_count"] = roads["segment_id"].map(act_counts).fillna(0)
    except Exception:
        roads["activity_count"] = 0.0

    # ── Feature 4: Risk sources ───────────────────────────────
    print("  Scoring risk sources...")
    try:
        risk_raw = ox.features_from_point(
            (lat, lon), dist=6500,
            tags=RISK_TAGS
        )
        risk_raw = risk_raw.copy()
        risk_raw["geometry"] = risk_raw.to_crs(UTM).geometry.centroid
        risk_pois = risk_raw[risk_raw.geometry.notna()]
        if len(risk_pois) > 0:
            risk_union = unary_union(risk_pois.geometry)
            roads["dist_risk"] = roads.geometry.apply(lambda g: g.distance(risk_union))
        else:
            roads["dist_risk"] = 9999.0
    except Exception:
        roads["dist_risk"] = 9999.0

    # ── Feature 5: Intersection density ──────────────────────
    print("  Scoring intersection density...")
    node_degree = dict(G.degree())

    def avg_endpoint_degree(row):
        return (node_degree.get(row["u"], 1) + node_degree.get(row["v"], 1)) / 2

    roads["intersection_density"] = edges.apply(avg_endpoint_degree, axis=1).values

    # ── Normalize ─────────────────────────────────────────────
    print("  Normalizing features...")
    roads["f_lighting"]     = minmax(roads["lighting_raw"])
    roads["f_police"]       = 1 - minmax(roads["dist_police"])
    roads["f_activity"]     = np.log1p(roads["activity_count"])
    if roads["f_activity"].max() > 0:
        roads["f_activity"] = roads["f_activity"] / roads["f_activity"].max()
    roads["f_risk"]         = minmax(roads["dist_risk"].clip(upper=200))
    roads["f_intersection"] = minmax(roads["intersection_density"])

    # ── Safety score ──────────────────────────────────────────
    roads["safety_score"] = (
        0.30 * roads["f_lighting"]      +
        0.20 * roads["f_police"]        +
        0.15 * roads["f_activity"]      +
        0.20 * roads["f_risk"]          +
        0.15 * roads["f_intersection"]
    ).clip(0, 1)

    # ── Push scores + individual features into graph edges ───
    print("  Pushing scores into graph...")
    edges_indexed = edges.copy()
    edges_indexed["safety_score"] = roads["safety_score"].values
    edges_indexed["f_lighting"]   = roads["f_lighting"].values
    edges_indexed["f_activity"]   = roads["f_activity"].values
    edges_indexed["f_risk"]       = roads["f_risk"].values

    for _, row in edges_indexed.iterrows():
        u, v, k = row["u"], row["v"], row["key"]
        if v in G[u] and k in G[u][v]:
            G[u][v][k]["safety_score"] = row["safety_score"]
            G[u][v][k]["f_lighting"]   = row["f_lighting"]
            G[u][v][k]["f_activity"]   = row["f_activity"]
            G[u][v][k]["f_risk"]       = row["f_risk"]

    for u, v, k, data in G.edges(keys=True, data=True):
        s = max(data.get("safety_score", 0.3), 0.05)
        data["safe_cost"] = data["length"] / s

    print(f"  Done. {len(roads)} segments scored.")
    return G


def get_cached_graph(lat, lon):
    """Return cached graph or build a new one."""
    key = get_city_key(lat, lon)
    now = time.time()

    if key in _graph_cache:
        entry = _graph_cache[key]
        if now - entry["timestamp"] < CACHE_TTL:
            print(f"Cache hit for key {key}")
            return entry["G"]

    print(f"Cache miss for key {key} — building graph...")
    G = build_scored_graph(lat, lon)
    _graph_cache[key] = {"G": G, "timestamp": now}
    return G


def get_node_name(G, node, index):
    """Try to get a meaningful name for a graph node."""
    # OSM nodes don't usually have names; use street name from adjacent edges if possible
    edges_from = list(G.edges(node, data=True, keys=True))
    for _, _, _, data in edges_from:
        name = data.get("name", None)
        if name:
            if isinstance(name, list):
                name = name[0]
            return str(name)
    return f"Stop {index + 1}"


def compute_route(G, orig_lat, orig_lon, dest_lat, dest_lon):
    """Run Dijkstra on both safe_cost and length weights, return full route details."""
    orig = ox.distance.nearest_nodes(G, X=orig_lon, Y=orig_lat)
    dest = ox.distance.nearest_nodes(G, X=dest_lon, Y=dest_lat)

    shortest_path = nx.shortest_path(G, orig, dest, weight="length")
    safest_path   = nx.shortest_path(G, orig, dest, weight="safe_cost")

    def path_stats(path):
        edges_in = list(zip(path[:-1], path[1:]))
        lengths, scores = [], []

        # Build pathCoords with id + name (id = OSM node id as string)
        pathCoords = []
        for i, node in enumerate(path):
            name = get_node_name(G, node, i)
            # Override first and last with generic start/end labels
            if i == 0:
                name = "Start"
            elif i == len(path) - 1:
                name = "Destination"
            pathCoords.append({
                "id":   str(node),
                "lat":  G.nodes[node]["y"],
                "lng":  G.nodes[node]["x"],
                "name": name,
            })

        for u, v in edges_in:
            k = list(G[u][v].keys())[0]
            data = G[u][v][k]
            lengths.append(data.get("length", 0))
            scores.append(data.get("safety_score", 0.3))

        total_len = sum(lengths)
        avg_score = float(np.mean(scores)) if scores else 0.3

        # Per-segment data — from/to are node ID strings so MapView can
        # look them up in pathCoords
        segments = []
        for i, (u, v) in enumerate(edges_in):
            k    = list(G[u][v].keys())[0]
            data = G[u][v][k]
            s    = data.get("safety_score", 0.3)
            ln   = data.get("length", 0)

            segments.append({
                "from":        str(u),
                "to":          str(v),
                "fromName":    pathCoords[i]["name"],
                "toName":      pathCoords[i + 1]["name"],
                "safetyScore": round(s, 3),
                "distanceKm":  round(ln / 1000, 3),
                # Individual feature scores for the sidebar bars
                "lighting":    round(data.get("f_lighting", s), 3),
                "crowd":       round(data.get("f_activity", s), 3),
                "crime":       round(1 - data.get("f_risk",  s), 3),
            })

        rating = "Safe"
        if avg_score < 0.3:   rating = "Unsafe"
        elif avg_score < 0.5: rating = "Moderate"

        return {
            "path":             [str(n) for n in path],
            "pathNames":        [c["name"] for c in pathCoords],
            "pathCoords":       pathCoords,
            "segments":         segments,
            "totalDistanceKm":  round(total_len / 1000, 2),
            "avgSafetyScore":   round(avg_score, 3),
            "safetyRating":     rating,
            "estimatedTimeMin": round((total_len / 1000 / 4) * 60),
            "nodeCount":        len(path),
        }

    shortest_stats = path_stats(shortest_path)
    safest_stats   = path_stats(safest_path)

    improvement = 0
    if shortest_stats["avgSafetyScore"] > 0:
        improvement = round(
            (safest_stats["avgSafetyScore"] - shortest_stats["avgSafetyScore"])
            / shortest_stats["avgSafetyScore"] * 100, 1
        )

    return {
        "safestRoute":       safest_stats,
        "shortestRoute":     shortest_stats,
        "safetyImprovement": improvement,
        "sameRoute":         shortest_path == safest_path,
    }


# ── API ENDPOINTS ────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "SafeRoutePlanner API running",
        "cachedCities": len(_graph_cache)
    })


@app.route("/api/route", methods=["POST"])
def route():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON body"}), 400

    start_str = data.get("start", "").strip()
    end_str   = data.get("end",   "").strip()

    if not start_str or not end_str:
        return jsonify({"error": "start and end are required"}), 400
    if start_str == end_str:
        return jsonify({"error": "Start and end cannot be the same"}), 400

    try:
        # 1. Geocode both locations
        print(f"\nGeocoding: '{start_str}' and '{end_str}'")
        orig_lat, orig_lon = geocode_location(start_str)
        dest_lat, dest_lon = geocode_location(end_str)
        print(f"  Start: ({orig_lat:.4f}, {orig_lon:.4f})")
        print(f"  End:   ({dest_lat:.4f}, {dest_lon:.4f})")

        # 2. Use midpoint to fetch a graph covering both points
        mid_lat = (orig_lat + dest_lat) / 2
        mid_lon = (orig_lon + dest_lon) / 2

        # 3. Get (possibly cached) scored graph
        G = get_cached_graph(mid_lat, mid_lon)

        # 4. Compute routes
        result = compute_route(G, orig_lat, orig_lon, dest_lat, dest_lon)

        return jsonify({
            "success": True,
            "start":   {"name": start_str, "lat": orig_lat, "lng": orig_lon},
            "end":     {"name": end_str,   "lat": dest_lat, "lng": dest_lon},
            "route":   result,
        })

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except nx.NetworkXNoPath:
        return jsonify({"error": "No path found between these locations. Try locations closer together."}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Internal error: {str(e)}"}), 500


@app.route("/api/geocode", methods=["GET"])
def geocode():
    """Quick endpoint to validate a location string."""
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"error": "q parameter required"}), 400
    try:
        lat, lon = geocode_location(q)
        return jsonify({"success": True, "lat": lat, "lng": lon, "query": q})
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400


if __name__ == "__main__":
    print("\n🛡️  SafeRoutePlanner Flask API")
    print("   http://localhost:5000\n")
    app.run(debug=True, port=5000)