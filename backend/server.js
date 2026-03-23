import express from "express";
import cors from "cors";
import { dijkstra, getLocations, NODES, GRAPH } from "./graph.js";

const app  = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────────────────────
//  GET /locations
//  Returns all available nodes (intersections/landmarks)
// ─────────────────────────────────────────────────────────────
app.get("/locations", (_req, res) => {
  res.json({ success: true, locations: getLocations() });
});

// ─────────────────────────────────────────────────────────────
//  POST /route
//  Body: { start: "VJTI", end: "Dadar_W_Station" }
//  Returns the safest route between two locations
// ─────────────────────────────────────────────────────────────
app.post("/route", (req, res) => {
  const { start, end } = req.body;

  if (!start || !end) {
    return res.status(400).json({ success: false, error: "start and end are required." });
  }
  if (start === end) {
    return res.status(400).json({ success: false, error: "Start and end cannot be the same." });
  }

  try {
    const result = dijkstra(start, end);
    if (!result) {
      return res.status(404).json({ success: false, error: "No path found between these locations." });
    }

    // Attach lat/lng for each node in the path (used by the map)
    const pathCoords = result.path.map((id) => ({
      id,
      name: NODES[id].name,
      lat:  NODES[id].lat,
      lng:  NODES[id].lng,
    }));

    res.json({ success: true, route: { ...result, pathCoords } });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /safety/:nodeId
//  Returns all edges from a given node with their safety data
// ─────────────────────────────────────────────────────────────
app.get("/safety/:nodeId", (req, res) => {
  const { nodeId } = req.params;

  if (!NODES[nodeId]) {
    return res.status(404).json({ success: false, error: "Node not found." });
  }

  const edges = GRAPH[nodeId].map((e) => ({
    toId:       e.to,
    toName:     NODES[e.to].name,
    distanceKm: e.distanceKm,
    crime:      e.crime,
    lighting:   e.lighting,
    crowd:      e.crowd,
    safetyScore: e.safetyScore,
  }));

  res.json({ success: true, nodeId, nodeName: NODES[nodeId].name, edges });
});

// ─────────────────────────────────────────────────────────────
//  GET /graph
//  Returns full graph (for debug / visualization)
// ─────────────────────────────────────────────────────────────
app.get("/graph", (_req, res) => {
  res.json({ success: true, nodes: getLocations(), graph: GRAPH });
});

// ─────────────────────────────────────────────────────────────
//  Health check
// ─────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({ status: "Safe Route Planner API is running 🛡️" });
});

app.listen(PORT, () => {
  console.log(`\n🛡️  Safe Route Planner API`);
  console.log(`   Running at http://localhost:${PORT}\n`);
});
