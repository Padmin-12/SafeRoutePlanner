// ─────────────────────────────────────────────────────────────
//  Safe Route Planner — Graph Engine
//  Road network: VJTI ↔ Dadar area (Mumbai), simulated data
// ─────────────────────────────────────────────────────────────

// Each node is a real or representative point in the VJTI–Dadar area
export const NODES = {
  VJTI:            { id: "VJTI",            name: "VJTI College",          lat: 19.0228, lng: 72.8551 },
  Matunga_E:       { id: "Matunga_E",       name: "Matunga East Station",  lat: 19.0262, lng: 72.8576 },
  Matunga_W:       { id: "Matunga_W",       name: "Matunga West Station",  lat: 19.0267, lng: 72.8497 },
  Dharavi_Jn:      { id: "Dharavi_Jn",      name: "Dharavi Junction",      lat: 19.0406, lng: 72.8543 },
  Sion_Circle:     { id: "Sion_Circle",     name: "Sion Circle",           lat: 19.0373, lng: 72.8629 },
  KingCircle:      { id: "KingCircle",      name: "King's Circle",         lat: 19.0291, lng: 72.8534 },
  Parel_Naka:      { id: "Parel_Naka",      name: "Parel Naka",            lat: 19.0145, lng: 72.8445 },
  Dadar_TT:        { id: "Dadar_TT",        name: "Dadar TT Circle",       lat: 19.0186, lng: 72.8449 },
  Dadar_W_Station: { id: "Dadar_W_Station", name: "Dadar West Station",    lat: 19.0178, lng: 72.8410 },
  Dadar_E_Station: { id: "Dadar_E_Station", name: "Dadar East Station",    lat: 19.0186, lng: 72.8449 },
  ShivajiBridge:   { id: "ShivajiBridge",   name: "Shivaji Bridge",        lat: 19.0237, lng: 72.8434 },
  Naigaon:         { id: "Naigaon",         name: "Naigaon Junction",      lat: 19.0320, lng: 72.8482 },
  CottonGreen:     { id: "CottonGreen",     name: "Cotton Green Road",     lat: 19.0108, lng: 72.8540 },
  Antop_Hill:      { id: "Antop_Hill",      name: "Antop Hill",            lat: 19.0357, lng: 72.8733 },
  Wadala:          { id: "Wadala",          name: "Wadala",                lat: 19.0258, lng: 72.8659 },
};

// ─── Safety Score factors (0=best, 1=worst) ─────────────────
// crime_score:    known crime incidents in the area
// lighting_score: 0=well-lit, 1=dark
// crowd_score:    0=crowded (safe), 1=isolated (less safe)
//
// Weights from the project plan:
//   crime=0.5, lighting=0.3, crowd=0.2
const W = { crime: 0.5, lighting: 0.3, crowd: 0.2 };

function safetyScore({ crime, lighting, crowd }) {
  return W.crime * crime + W.lighting * lighting + W.crowd * crowd;
}

// Total weight (cost) for an edge
// TotalWeight = distance_km * (1 + SafetyScore)
function edgeWeight({ distanceKm, crime, lighting, crowd }) {
  const ss = safetyScore({ crime, lighting, crowd });
  return distanceKm * (1 + ss);
}

// ─── Road edges (bidirectional unless noted) ─────────────────
// safety data is simulated / estimated from public knowledge
const RAW_EDGES = [
  // ──── Main spine: VJTI → Matunga ────
  { from: "VJTI",        to: "KingCircle",      distanceKm: 0.8,  crime: 0.2, lighting: 0.2, crowd: 0.3 },
  { from: "KingCircle",  to: "Matunga_E",       distanceKm: 0.5,  crime: 0.1, lighting: 0.1, crowd: 0.2 },
  { from: "KingCircle",  to: "Matunga_W",       distanceKm: 0.6,  crime: 0.2, lighting: 0.2, crowd: 0.3 },
  { from: "KingCircle",  to: "Naigaon",         distanceKm: 0.4,  crime: 0.3, lighting: 0.4, crowd: 0.5 },

  // ──── Matunga to Dadar (via ShivajiBridge — lit, busy) ────
  { from: "Matunga_W",   to: "ShivajiBridge",   distanceKm: 0.7,  crime: 0.1, lighting: 0.1, crowd: 0.2 },
  { from: "ShivajiBridge", to: "Dadar_W_Station", distanceKm: 0.5, crime: 0.1, lighting: 0.1, crowd: 0.1 },

  // ──── Matunga E to Dadar E (via Parel road) ────
  { from: "Matunga_E",   to: "Sion_Circle",     distanceKm: 1.1,  crime: 0.4, lighting: 0.5, crowd: 0.4 },
  { from: "Sion_Circle", to: "Wadala",          distanceKm: 1.4,  crime: 0.3, lighting: 0.4, crowd: 0.5 },
  { from: "Wadala",      to: "Dadar_E_Station", distanceKm: 1.8,  crime: 0.3, lighting: 0.3, crowd: 0.4 },

  // ──── Dharavi shortcut (high crime !) ────
  { from: "KingCircle",  to: "Dharavi_Jn",      distanceKm: 1.5,  crime: 0.8, lighting: 0.7, crowd: 0.6 },
  { from: "Dharavi_Jn",  to: "Dadar_E_Station", distanceKm: 2.0,  crime: 0.9, lighting: 0.8, crowd: 0.7 },

  // ──── Naigaon → Parel Naka route ────
  { from: "Naigaon",     to: "Parel_Naka",      distanceKm: 0.7,  crime: 0.5, lighting: 0.6, crowd: 0.6 },
  { from: "Parel_Naka",  to: "Dadar_TT",        distanceKm: 0.5,  crime: 0.4, lighting: 0.3, crowd: 0.4 },
  { from: "Dadar_TT",    to: "Dadar_W_Station", distanceKm: 0.3,  crime: 0.2, lighting: 0.1, crowd: 0.2 },
  { from: "Dadar_TT",    to: "Dadar_E_Station", distanceKm: 0.1,  crime: 0.1, lighting: 0.1, crowd: 0.1 },

  // ──── Antop Hill backroads (isolated, dark) ────
  { from: "Sion_Circle", to: "Antop_Hill",      distanceKm: 1.0,  crime: 0.7, lighting: 0.8, crowd: 0.8 },
  { from: "Antop_Hill",  to: "Wadala",          distanceKm: 1.2,  crime: 0.6, lighting: 0.7, crowd: 0.7 },

  // ──── Cotton Green — industrial, low crowd ────
  { from: "VJTI",        to: "CottonGreen",     distanceKm: 0.9,  crime: 0.6, lighting: 0.7, crowd: 0.9 },
  { from: "CottonGreen", to: "Dadar_E_Station", distanceKm: 1.6,  crime: 0.5, lighting: 0.6, crowd: 0.8 },

  // ──── Matunga W → Dadar TT (direct, moderate) ────
  { from: "Matunga_W",   to: "Dadar_TT",        distanceKm: 0.9,  crime: 0.3, lighting: 0.2, crowd: 0.3 },
];

// ─── Build adjacency list ────────────────────────────────────
function buildGraph() {
  const graph = {};
  for (const nodeId of Object.keys(NODES)) graph[nodeId] = [];

  for (const e of RAW_EDGES) {
    const weight   = edgeWeight(e);
    const ss       = safetyScore(e);
    const edgeFwd  = { to: e.to,   distanceKm: e.distanceKm, crime: e.crime, lighting: e.lighting, crowd: e.crowd, weight, safetyScore: ss };
    const edgeBwd  = { to: e.from, distanceKm: e.distanceKm, crime: e.crime, lighting: e.lighting, crowd: e.crowd, weight, safetyScore: ss };
    graph[e.from].push(edgeFwd);
    graph[e.to].push(edgeBwd);
  }
  return graph;
}

export const GRAPH = buildGraph();

// ─── Dijkstra's Algorithm ────────────────────────────────────
export function dijkstra(startId, endId) {
  if (!NODES[startId] || !NODES[endId]) {
    throw new Error(`Unknown node: ${!NODES[startId] ? startId : endId}`);
  }

  const dist  = {};   // minimum weight cost
  const prev  = {};   // previous node on optimal path
  const prevEdge = {}; // edge details for the path step
  const visited = new Set();

  for (const n of Object.keys(NODES)) {
    dist[n]  = Infinity;
    prev[n]  = null;
    prevEdge[n] = null;
  }
  dist[startId] = 0;

  // Simple priority queue (good enough for small graphs)
  const pq = [startId];

  while (pq.length > 0) {
    // Pop the node with minimum distance
    pq.sort((a, b) => dist[a] - dist[b]);
    const current = pq.shift();

    if (visited.has(current)) continue;
    visited.add(current);

    if (current === endId) break;

    for (const edge of GRAPH[current]) {
      const alt = dist[current] + edge.weight;
      if (alt < dist[edge.to]) {
        dist[edge.to]     = alt;
        prev[edge.to]     = current;
        prevEdge[edge.to] = edge;
        if (!visited.has(edge.to)) pq.push(edge.to);
      }
    }
  }

  if (dist[endId] === Infinity) return null; // No path found

  // Reconstruct path
  const path = [];
  let cur = endId;
  while (cur !== null) {
    path.unshift(cur);
    cur = prev[cur];
  }

  // Build path details array
  let totalDistance  = 0;
  let totalSafetyWt  = 0;
  const segments = [];

  for (let i = 0; i < path.length - 1; i++) {
    const edge = prevEdge[path[i + 1]];
    totalDistance += edge.distanceKm;
    totalSafetyWt += edge.safetyScore;
    segments.push({
      from:         path[i],
      to:           path[i + 1],
      fromName:     NODES[path[i]].name,
      toName:       NODES[path[i + 1]].name,
      distanceKm:   edge.distanceKm,
      crime:        edge.crime,
      lighting:     edge.lighting,
      crowd:        edge.crowd,
      safetyScore:  +edge.safetyScore.toFixed(3),
      weight:       +edge.weight.toFixed(3),
    });
  }

  const avgSafetyScore = segments.length
    ? +(totalSafetyWt / segments.length).toFixed(3)
    : 0;

  // Overall safety rating
  let safetyRating = "Safe";
  if (avgSafetyScore > 0.55) safetyRating = "Unsafe";
  else if (avgSafetyScore > 0.30) safetyRating = "Moderate";

  return {
    path,
    pathNames: path.map((id) => NODES[id].name),
    segments,
    totalDistanceKm: +totalDistance.toFixed(2),
    totalWeight:     +dist[endId].toFixed(3),
    avgSafetyScore,
    safetyRating,
    estimatedTimeMin: Math.round((totalDistance / 4) * 60), // walking 4 km/h
  };
}

// ─── Get all unique named locations ─────────────────────────
export function getLocations() {
  return Object.values(NODES).map(({ id, name, lat, lng }) => ({ id, name, lat, lng }));
}
