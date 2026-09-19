# 🛡️ SafeRoutePlanner

> **Safety-Aware Urban Pedestrian Navigation Engine**  
> Computes multi-objective walking routes by balancing physical distance against urban safety and environmental risk factors (street illumination, natural surveillance, police proximity, and crime hazard venues).

---

## 1. Problem
Standard routing systems (e.g., Google Maps, Apple Maps) optimize exclusively for travel time or physical distance. In urban night-time navigation, shortest paths frequently route pedestrians through poorly lit alleys, isolated industrial sectors, or unmonitored passages. Commuters—particularly students, night-shift workers, and women—often prioritize safety over shaving a few minutes off their trip.

## 2. Solution
SafeRoutePlanner is a spatial navigation engine that models urban street networks as cost-weighted multi-graphs. Using an approach inspired by **Risk Terrain Modeling (RTM)**, the system extracts heterogeneous environmental features from OpenStreetMap (OSM), calculates normalized safety scores for road segments, and solves for both the **Shortest Path** and the **Safest Path** using a modified Dijkstra algorithm. The system presents a side-by-side trade-off analysis (e.g., *+180m distance for +12.6% safety score improvement; avoids 5 high-risk segments*).

---

## 3. Core Features
- **Dual-Route Comparative Engine**: Simultaneously calculates the shortest distance route and the safety-penalized optimal route.
- **Quantitative Trade-Off Analytics**: Computes distance deltas, walking time deltas, safety score gains, and the number of high-risk segments avoided.
- **Risk Terrain Feature Modeling**: Evaluates 5 normalized spatial indicators:
  - **Street Illumination (30%)**: Street lamp density and road hierarchy classification.
  - **Police Proximity (20%)**: Distance to nearest police station using spatial indexing (`sindex`).
  - **Commercial / Activity Density (15%)**: Active storefronts, amenities, and leisure facilities as natural surveillance proxies.
  - **Hazard Proximity (20%)**: Distance to bars, nightclubs, industrial zones, and construction sites.
  - **Intersection Connectivity (15%)**: Structural degree and sightlines at road junctions.
- **Two-Tier Persistent Graph Caching**: Serializes scored road networks to disk (`.pickle`), reducing demo query latency from ~45 seconds to **<250 milliseconds**.
- **Interactive Leaflet Visualization**: Visualizes routes on a dark glassmorphic interface with color-coded road segments (Green = Safe, Amber = Moderate, Red = Elevated Risk).
- **1-Click Benchmark Corridors**: Pre-configured real-world urban routes (e.g., VJTI Mumbai ↔ Dadar West Station) for instantaneous testing and verification.

---

## 4. Technical Architecture

```
┌────────────────────────────────────────────────────────┐
│               Frontend (React 19 + Vite)               │
│  - Interactive Leaflet Map (react-leaflet)             │
│  - ResultPanel (Trade-off stats & Turn-by-Turn view)   │
│  - 1-Click Benchmark Corridor Selector                 │
└───────────────────────────┬────────────────────────────┘
                            │ /api/* (Vite proxy)
                            ▼
┌────────────────────────────────────────────────────────┐
│            Backend API (Python Flask REST API)          │
│  - Endpoints: /api/route, /api/geocode, /api/health,   │
│               /api/presets                             │
│  - Request validation & structured error responses     │
└─────────────┬───────────────────────────┬──────────────┘
              │                           │
              ▼                           ▼
┌───────────────────────────┐ ┌──────────────────────────┐
│   Spatial Routing Engine  │ │  Persistent Cache Layer  │
│ - Multi-graph (NetworkX)  │ │ - Bundled Mumbai dataset │
│ - Modified Dijkstra       │ │ - Serialized GraphML /   │
│ - Cost: length / s        │ │   Pickle on disk         │
│ - Feature Normalization   │ │ - Sub-250ms cold latency │
└───────────────────────────┘ └──────────────────────────┘
```

### Architectural Rationale
1. **Two-Tier Separation**: The frontend is a lightweight React 19 Single Page Application. The backend is a dedicated Python Flask service. Python was chosen because of its geospatial and scientific computing ecosystem (`OSMnx`, `NetworkX`, `GeoPandas`, `Shapely`).
2. **Removal of Redundant Proxies**: Legacy prototypes used an Express Node.js pass-through proxy. This was completely eliminated in favor of direct proxying from Vite to Flask, reducing architectural complexity and latency.

---

## 5. Mathematical Formulation

### 1. Safety Score Function
Each road segment \(e\) receives a normalized safety score \(S(e) \in [0.0, 1.0]\), computed as the weighted linear combination of 5 normalized spatial features:

\[
S(e) = \min\left(1.0, \max\left(0.0, \, 0.30 \cdot f_{\text{lighting}} + 0.20 \cdot f_{\text{police}} + 0.15 \cdot f_{\text{activity}} + 0.20 \cdot f_{\text{risk}} + 0.15 \cdot f_{\text{intersection}}\right)\right)
\]

Where:
- \(f_{\text{lighting}}\): Street lamp counts + road classification hierarchy (min-max normalized).
- \(f_{\text{police}}\): Inverse distance to nearest police station (min-max normalized).
- \(f_{\text{activity}}\): Log-transformed count of amenity/commercial POIs along segment buffer.
- \(f_{\text{risk}}\): Proximity to hazard points, clipped at 200m buffer (min-max normalized).
- \(f_{\text{intersection}}\): Structural degree of segment endpoints (min-max normalized).

### 2. Edge Traversal Cost (Dijkstra Weight)
Dijkstra's algorithm finds the path minimizing total traversal cost. For safety routing, edge length is penalized inversely proportional to its safety score:

\[
\text{Cost}_{\text{safe}}(e) = \frac{\text{Length}(e)}{\max(S(e), 0.05)}
\]

- If a segment is well-lit and monitored (\(S(e) = 0.90\)), \(\text{Cost}_{\text{safe}} \approx 1.11 \times \text{Length}\).
- If a segment is dark and isolated (\(S(e) = 0.10\)), \(\text{Cost}_{\text{safe}} = 10.0 \times \text{Length}\).
- Dijkstra naturally diverts around risky segments unless the detour distance exceeds the safety penalty.

---

## 6. Project Structure

```
SafeRoutePlanner/
├── backend/
│   ├── app.py                   ← Flask REST API & endpoint routing
│   ├── requirements.txt         ← Pinned backend dependencies
│   ├── engine/
│   │   ├── scoring.py           ← RTM feature extraction & normalization
│   │   ├── routing.py           ← Dual-route Dijkstra & trade-off analytics
│   │   └── cache.py             ← Two-tier persistent graph caching
│   ├── data/
│   │   └── mumbai_benchmark.pickle ← Pre-bundled Central Mumbai scored graph
│   └── tests/
│       ├── test_scoring.py      ← Scoring formulas & normalization tests
│       ├── test_routing.py      ← Controlled graph routing & Dijkstra tests
│       └── test_api.py          ← Flask REST endpoint integration tests
├── frontend/
│   ├── src/
│   │   ├── App.jsx              ← Main UI, preset selection, search form
│   │   ├── MapView.jsx          ← React-Leaflet map with dual polylines
│   │   ├── ResultPanel.jsx      ← Trade-off statistics & turn-by-turn steps
│   │   ├── utils.js             ← Safety classification & color mappings
│   │   └── index.css            ← Design system (dark theme)
│   ├── package.json             ← Clean frontend dependencies
│   ├── vite.config.js           ← Vite configuration & /api proxy to port 5000
│   └── eslint.config.js         ← Flat ESLint 9 configuration
└── README.md
```

---

## 7. Setup & Local Execution

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm

### 1. Start Backend (Flask API — Port 5000)
```bash
# In project root
pip install -r backend/requirements.txt
python -m backend.app
# → API running at http://localhost:5000
```

### 2. Start Frontend (React + Vite — Port 5173)
```bash
cd frontend
npm install
npm run dev
# → Web app running at http://localhost:5173
```

---

## 8. Automated Testing

The backend includes a comprehensive `pytest` test suite covering feature normalization, Dijkstra routing algorithms on synthetic graphs, boundary conditions, and API endpoint integration.

```bash
# Run backend test suite
python -m pytest backend/tests/ -v
# Output: 17 passed in ~3.1s
```

```bash
# Run frontend linting & production build
cd frontend
npm run lint
npm run build
```

---

## 9. API Reference

| Method | Endpoint | Description | Sample Query / Body |
|--------|----------|-------------|---------------------|
| `GET`  | `/api/health` | Service health & cache telemetry | N/A |
| `GET`  | `/api/presets` | List of verified demonstration corridors | N/A |
| `GET`  | `/api/geocode` | Resolve address string to lat/lng | `?q=VJTI Mumbai` |
| `POST` | `/api/route` | Compute shortest vs. safest routes | `{"start": "VJTI Mumbai", "end": "Dadar Station Mumbai"}` |

---

## 10. Known Limitations
1. **OSM Attribute Completeness**: Street lamp coverage (`highway=street_lamp`) in OpenStreetMap varies by municipality. In areas with sparse street lamp tags, the model falls back on road hierarchy classification (`primary`, `secondary`, `residential`).
2. **Static Historical Proxies**: The model uses environmental and static spatial proxies for safety rather than live, real-time crime feeds (which are rarely published with real-time APIs by municipal police departments).
3. **Pedestrian vs. Motor Network**: OpenStreetMap pedestrian sidewalk connectivity in certain developing cities can have topological gaps; the router uses drivable/walkable urban street graphs to guarantee connectivity.
