# 🛡️ Safe Route Planner

A **safety-aware navigation system** that computes routes based on crime history, lighting, and crowd density — not just distance.

> Built for VJTI Mumbai | Graph-based Routing | React + Node.js

---

## 🚀 Quick Start

### 1. Start the Backend API (port 3001)
```bash
cd backend
npm install
node server.js
# → Running at http://localhost:3001
```

### 2. Start the Frontend (port 5173)
```bash
cd frontend
npm install
npm run dev
# → Open http://localhost:5173
```

---

## 🏗️ Architecture

```
SafeRoutePlanner/
├── backend/
│   ├── server.js       ← Express API (routes, locations, safety)
│   ├── graph.js        ← Graph engine + Dijkstra's algorithm
│   └── package.json
└── frontend/
    ├── src/
    │   ├── App.jsx         ← Main app + API calls
    │   ├── MapView.jsx     ← Leaflet map with safety-coloured polylines
    │   ├── ResultPanel.jsx ← Route results, stats, safety bars
    │   ├── utils.js        ← Safety score → colour helpers
    │   └── index.css       ← Full dark-theme design system
    └── index.html
```

---

## 🧮 Algorithm

### Safety Score Formula
```
SafetyScore = 0.5×crime + 0.3×lighting + 0.2×crowd
```

### Edge Weight (routing cost)
```
TotalWeight = distance_km × (1 + SafetyScore)
```

Unsafe roads become **more expensive** in the graph → Dijkstra naturally avoids them.

### Safety Rating
| Score Range | Rating   | Map Colour |
|------------|----------|------------|
| 0.00–0.30  | ✅ Safe   | 🟢 Green   |
| 0.31–0.55  | ⚠️ Moderate | 🟡 Amber |
| 0.56–1.00  | 🚫 Unsafe | 🔴 Red    |

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/locations` | All available nodes |
| `POST` | `/route` | Compute safest path `{start, end}` |
| `GET`  | `/safety/:nodeId` | Safety data for a node's edges |
| `GET`  | `/graph` | Full graph data |

### Example: Find Safe Route
```bash
curl -X POST http://localhost:3001/route \
  -H "Content-Type: application/json" \
  -d '{"start": "VJTI", "end": "Dadar_W_Station"}'
```

Response:
```json
{
  "success": true,
  "route": {
    "path": ["VJTI", "KingCircle", "Matunga_W", "ShivajiBridge", "Dadar_W_Station"],
    "totalDistanceKm": 2.6,
    "avgSafetyScore": 0.175,
    "safetyRating": "Safe",
    "estimatedTimeMin": 39
  }
}
```

---

## 🗺️ Road Network (Mumbai: VJTI → Dadar)

15 nodes covering real locations:
- VJTI College, King's Circle, Matunga East/West
- Sion Circle, Dharavi Junction (⚠️ high crime)
- Shivaji Bridge, Dadar TT Circle
- Dadar East/West Station, Wadala, Antop Hill

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite |
| Map | Leaflet.js + OpenStreetMap |
| Backend | Node.js + Express |
| Algorithm | Modified Dijkstra's |
| Styling | Vanilla CSS (dark glassmorphism) |

---

## 📈 Future Enhancements

- [ ] Real crime data via police open datasets
- [ ] OSMnx integration for full road network
- [ ] Machine learning safety prediction
- [ ] Real-time alerts for unsafe zones
- [ ] Night mode routing (lighting weights increase)
- [ ] Community feedback / report unsafe areas
- [ ] PostgreSQL for persistent data storage
