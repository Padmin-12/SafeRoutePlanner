import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";

// ─── Safety colour map ────────────────────────────────────────
function safetyColor(score) {
  if (score <= 0.30) return "#22c55e"; // green
  if (score <= 0.55) return "#f59e0b"; // amber
  return "#ef4444";                    // red
}

function safetyLabel(score) {
  if (score <= 0.30) return "safe";
  if (score <= 0.55) return "moderate";
  return "unsafe";
}

// ─── Auto-fit map bounds when route changes ──────────────────
function FitBounds({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (coords && coords.length > 1) {
      const bounds = coords.map((c) => [c.lat, c.lng]);
      map.fitBounds(bounds, { padding: [60, 60] });
    }
  }, [coords, map]);
  return null;
}

// ─── Map background: default centre over Dadar area ─────────
const DEFAULT_CENTER = [19.027, 72.850];
const DEFAULT_ZOOM   = 14;

export default function MapView({ route }) {
  const segments    = route?.segments    ?? [];
  const pathCoords  = route?.pathCoords  ?? [];

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ height: "100%", width: "100%" }}
      zoomControl={true}
    >
      {/* Dark map tiles */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Fit map to route */}
      {pathCoords.length > 1 && <FitBounds coords={pathCoords} />}

      {/* Draw each segment in its safety colour */}
      {segments.map((seg, i) => {
        const fromCoord = pathCoords.find((c) => c.id === seg.from);
        const toCoord   = pathCoords.find((c) => c.id === seg.to);
        if (!fromCoord || !toCoord) return null;

        const color = safetyColor(seg.safetyScore);
        const positions = [
          [fromCoord.lat, fromCoord.lng],
          [toCoord.lat,   toCoord.lng],
        ];

        return (
          <Polyline
            key={i}
            positions={positions}
            pathOptions={{
              color,
              weight: 6,
              opacity: 0.85,
              lineCap: "round",
              lineJoin: "round",
            }}
          >
            <Popup>
              <div>
                <strong style={{ fontSize: 13 }}>
                  {seg.fromName} → {seg.toName}
                </strong>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#94a3b8" }}>Distance</span>
                    <span>{seg.distanceKm} km</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#94a3b8" }}>Crime</span>
                    <span style={{ color: safetyColor(seg.crime) }}>{(seg.crime * 10).toFixed(1)}/10</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#94a3b8" }}>Lighting</span>
                    <span style={{ color: safetyColor(seg.lighting) }}>{(seg.lighting * 10).toFixed(1)}/10</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#94a3b8" }}>Crowd</span>
                    <span style={{ color: safetyColor(seg.crowd) }}>{(seg.crowd * 10).toFixed(1)}/10</span>
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      padding: "4px 10px",
                      borderRadius: 99,
                      background: `${color}22`,
                      border: `1px solid ${color}55`,
                      color,
                      textAlign: "center",
                      fontWeight: 700,
                      fontSize: 12,
                      textTransform: "capitalize",
                    }}
                  >
                    {safetyLabel(seg.safetyScore)} — score {seg.safetyScore}
                  </div>
                </div>
              </div>
            </Popup>
          </Polyline>
        );
      })}

      {/* Waypoint circles */}
      {pathCoords.map((coord, i) => {
        const isFirst = i === 0;
        const isLast  = i === pathCoords.length - 1;
        const color   = isFirst ? "#22c55e" : isLast ? "#ef4444" : "#3b82f6";
        const radius  = isFirst || isLast ? 10 : 6;

        return (
          <CircleMarker
            key={coord.id}
            center={[coord.lat, coord.lng]}
            radius={radius}
            pathOptions={{
              fillColor: color,
              color: "#fff",
              weight: 2,
              opacity: 1,
              fillOpacity: 0.95,
            }}
          >
            <Popup>
              <strong>{coord.name}</strong>
              {isFirst && <div style={{ color: "#22c55e", fontSize: 11, marginTop: 4 }}>📍 Start</div>}
              {isLast  && <div style={{ color: "#ef4444", fontSize: 11, marginTop: 4 }}>🏁 Destination</div>}
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
