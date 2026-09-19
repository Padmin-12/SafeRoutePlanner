"""
SafeRoutePlanner — Spatial Safety Scoring & Feature Engineering
==============================================================
Implements multi-criteria Risk Terrain Modeling (RTM) inspired feature engineering.
Spatial risk and safety factors are extracted from OpenStreetMap (OSM) data,
normalized, and combined into a bounded safety score in [0.0, 1.0].
"""

import numpy as np
import pandas as pd
import geopandas as gpd
from shapely.ops import unary_union

# Default model weights for pedestrian safety factors (sum = 1.0)
DEFAULT_WEIGHTS = {
    "lighting":     0.30,  # Street illumination and road classification
    "police":       0.20,  # Proximity to police stations
    "activity":     0.15,  # Natural surveillance from shops, amenities, leisure
    "risk":         0.20,  # Distance from designated risk venues (bars, industrial, etc.)
    "intersection": 0.15,  # Road connectivity and visibility from intersections
}

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


def get_utm_epsg(lon: float) -> int:
    """Get UTM zone EPSG for a given longitude (Northern hemisphere)."""
    zone = int((lon + 180) / 6) + 1
    return 32600 + zone


def minmax_normalize(series: pd.Series) -> pd.Series:
    """
    Min-max normalize a pandas Series to [0.0, 1.0].
    If all values are identical (max == min), returns 0.5 for neutral score.
    """
    lo, hi = series.min(), series.max()
    if pd.isna(lo) or pd.isna(hi) or hi == lo:
        return pd.Series(0.5, index=series.index)
    return (series - lo) / (hi - lo)


def calculate_safety_score(
    f_lighting: float,
    f_police: float,
    f_activity: float,
    f_risk: float,
    f_intersection: float,
    weights: dict = None
) -> float:
    """
    Calculate combined safety score from normalized factors [0, 1].
    Higher is safer (1.0 = maximum safety, 0.0 = high risk).
    """
    w = weights or DEFAULT_WEIGHTS
    score = (
        w["lighting"]     * f_lighting +
        w["police"]       * f_police +
        w["activity"]     * f_activity +
        w["risk"]         * f_risk +
        w["intersection"] * f_intersection
    )
    return float(np.clip(score, 0.0, 1.0))


def calculate_safe_cost(length: float, safety_score: float, min_score: float = 0.05) -> float:
    """
    Calculate edge traversal cost for Dijkstra routing.
    Unsafe roads have lower safety scores, penalizing their traversal cost.
    Cost = length / safety_score
    """
    s = max(float(safety_score), min_score)
    return float(length / s)


def get_safety_rating(avg_score: float) -> str:
    """Classify safety score into categorical rating."""
    if avg_score >= 0.50:
        return "Safe"
    elif avg_score >= 0.30:
        return "Moderate"
    return "Unsafe"


def score_road_network(G, lat: float, lon: float, ox_module=None):
    """
    Extract spatial features from OSM around (lat, lon) and assign
    safety_score and safe_cost to all edges in NetworkX MultiDiGraph G.
    """
    import osmnx as ox
    if ox_module:
        ox = ox_module

    UTM = get_utm_epsg(lon)
    LAMP_BUFFER = 50  # metres

    edges = ox.graph_to_gdfs(G, nodes=False, fill_edge_geometry=True).reset_index()
    edges["segment_id"] = edges.index
    roads = edges[["segment_id", "u", "v", "key", "geometry", "highway", "length"]].copy()
    roads = roads.set_crs(4326).to_crs(UTM)

    # 1. Lighting Feature
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

    # 2. Police Proximity Feature
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

    # 3. Activity / Natural Surveillance Density
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

    # 4. Proximity to Risk Sources
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

    # 5. Intersection Density
    node_degree = dict(G.degree())

    def avg_endpoint_degree(row):
        return (node_degree.get(row["u"], 1) + node_degree.get(row["v"], 1)) / 2

    roads["intersection_density"] = edges.apply(avg_endpoint_degree, axis=1).values

    # Normalize features to [0.0, 1.0]
    roads["f_lighting"]     = minmax_normalize(roads["lighting_raw"])
    roads["f_police"]       = 1.0 - minmax_normalize(roads["dist_police"])
    roads["f_activity"]     = np.log1p(roads["activity_count"])
    if roads["f_activity"].max() > 0:
        roads["f_activity"] = roads["f_activity"] / roads["f_activity"].max()
    roads["f_risk"]         = minmax_normalize(roads["dist_risk"].clip(upper=200))
    roads["f_intersection"] = minmax_normalize(roads["intersection_density"])

    # Compute final combined safety score
    w = DEFAULT_WEIGHTS
    roads["safety_score"] = (
        w["lighting"]     * roads["f_lighting"] +
        w["police"]       * roads["f_police"] +
        w["activity"]     * roads["f_activity"] +
        w["risk"]         * roads["f_risk"] +
        w["intersection"] * roads["f_intersection"]
    ).clip(0.0, 1.0)

    # Annotate graph edges
    edges_indexed = edges.copy()
    edges_indexed["safety_score"]   = roads["safety_score"].values
    edges_indexed["f_lighting"]     = roads["f_lighting"].values
    edges_indexed["f_activity"]     = roads["f_activity"].values
    edges_indexed["f_risk"]         = roads["f_risk"].values
    edges_indexed["f_police"]       = roads["f_police"].values
    edges_indexed["f_connectivity"] = roads["f_intersection"].values

    for _, row in edges_indexed.iterrows():
        u, v, k = row["u"], row["v"], row["key"]
        if v in G[u] and k in G[u][v]:
            G[u][v][k]["safety_score"]   = float(row["safety_score"])
            G[u][v][k]["f_lighting"]     = float(row["f_lighting"])
            G[u][v][k]["f_activity"]     = float(row["f_activity"])
            G[u][v][k]["f_risk"]         = float(row["f_risk"])
            G[u][v][k]["f_police"]       = float(row["f_police"])
            G[u][v][k]["f_connectivity"] = float(row["f_connectivity"])

    for u, v, k, data in G.edges(keys=True, data=True):
        data["safe_cost"] = calculate_safe_cost(data.get("length", 10.0), data.get("safety_score", 0.3))

    return G
