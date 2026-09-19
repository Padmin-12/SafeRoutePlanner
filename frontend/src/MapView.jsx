import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";
import { safetyLabel, barColor, riskBarColor } from "./utils";

// ─── Safety color map (Higher is safer) ──────────────────────
function safetyColor(score) {
  const s = Number(score) || 0;
  if (s >= 0.50) return "#22c55e"; // green = safe
  if (s >= 0.30) return "#f59e0b"; // amber = moderate
  return "#ef4444";                // red = unsafe
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

// ─── Draw one route's segments ───────────────────────────────
function RouteLayer({ routeData, colorOverride, isDashed = false }) {
  if (!routeData) return null;
  const segments   = routeData.segments   ?? [];
  const pathCoords = routeData.pathCoords ?? [];

  return (
    <>
      {segments.map((seg, i) => {
        const fromCoord = pathCoords.find((c) => c.id === seg.from);
        const toCoord   = pathCoords.find((c) => c.id === seg.to);
        if (!fromCoord || !toCoord) return null;

        const color = colorOverride ?? safetyColor(seg.safetyScore);
        const positions = [
          [fromCoord.lat, fromCoord.lng],
          [toCoord.lat,   toCoord.lng],
        ];

        const riskVal = seg.risk ?? seg.crime ?? 0;

        return (
          <Polyline
            key={`${seg.from}-${seg.to}-${i}`}
            positions={positions}
            pathOptions={{
              color,
              weight: colorOverride ? 4 : 6,
              opacity: colorOverride ? 0.75 : 0.90,
              lineCap: "round",
              lineJoin: "round",
              dashArray: isDashed ? "8 6" : null,
            }}
          >
            <Popup>
              <div style={{ minWidth: 190 }}>
                <strong style={{ fontSize: 13, color: "#0f172a" }}>
                  {seg.fromName} → {seg.toName}
                </strong>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "#64748b" }}>Segment Distance</span>
                    <span style={{ fontWeight: 600 }}>{seg.distanceKm} km</span>
                  </div>

                  {!colorOverride ? (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ color: "#64748b" }}>Lighting</span>
                        <span style={{ fontWeight: 600, color: barColor(seg.lighting) }}>
                          {(seg.lighting * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ color: "#64748b" }}>Crowd / Activity</span>
                        <span style={{ fontWeight: 600, color: barColor(seg.crowd) }}>
                          {(seg.crowd * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ color: "#64748b" }}>Risk Proximity</span>
                        <span style={{ fontWeight: 600, color: riskBarColor(riskVal) }}>
                          {(riskVal * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          padding: "4px 8px",
                          borderRadius: 6,
                          background: `${color}22`,
                          border: `1px solid ${color}66`,
                          color,
                          textAlign: "center",
                          fontWeight: 700,
                          fontSize: 11,
                          textTransform: "capitalize",
                        }}
                      >
                        {safetyLabel(seg.safetyScore)} — Score {(seg.safetyScore * 100).toFixed(0)}/100
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: "#3b82f6", fontWeight: 600 }}>
                      Shortest Path Segment (Distance Only)
                    </div>
                  )}
                </div>
              </div>
            </Popup>
          </Polyline>
        );
      })}

      {/* Origin and Destination Waypoint Markers */}
      {pathCoords.map((coord, i) => {
        const isFirst = i === 0;
        const isLast  = i === pathCoords.length - 1;

        if (!isFirst && !isLast) return null;

        const color  = isFirst ? "#22c55e" : "#ef4444";
        const label  = isFirst ? "Start: " : "Destination: ";

        return (
          <CircleMarker
            key={`node-${coord.id}-${i}`}
            center={[coord.lat, coord.lng]}
            radius={8}
            pathOptions={{
              fillColor: color,
              color: "#ffffff",
              weight: 2,
              opacity: 1,
              fillOpacity: 1,
            }}
          >
            <Popup>
              <div style={{ fontSize: 12 }}>
                <strong style={{ color }}>{label}</strong>
                <span>{coord.name}</span>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

const DEFAULT_CENTER = [19.027, 72.850];
const DEFAULT_ZOOM   = 14;

export default function MapView({ route, showShortest = true }) {
  const safest   = route?.safestRoute   ?? (route?.segments ? route : null);
  const shortest = route?.shortestRoute ?? null;

  // Use all coordinates for bounds fitting
  const fitCoords = safest?.pathCoords?.length
    ? safest.pathCoords
    : (shortest?.pathCoords ?? []);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ height: "100%", width: "100%" }}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {fitCoords.length > 1 && <FitBounds coords={fitCoords} />}

        {/* Shortest route rendered as dashed blue line */}
        {showShortest && shortest && (
          <RouteLayer routeData={shortest} colorOverride="#3b82f6" isDashed={true} />
        )}

        {/* Safest route rendered with safety-weighted colors */}
        {safest && (
          <RouteLayer routeData={safest} colorOverride={null} isDashed={false} />
        )}
      </MapContainer>

      {/* Floating Route Legend */}
      <div className="map-legend">
        <div className="map-legend-title">Route Safety</div>
        <div className="map-legend-row">
          <span className="map-legend-line" style={{ background: "#22c55e" }} />
          <span>Well-lit / Safe (&gt;50%)</span>
        </div>
        <div className="map-legend-row">
          <span className="map-legend-line" style={{ background: "#f59e0b" }} />
          <span>Moderate (30–49%)</span>
        </div>
        <div className="map-legend-row">
          <span className="map-legend-line" style={{ background: "#ef4444" }} />
          <span>Elevated Risk (&lt;30%)</span>
        </div>
        {shortest && (
          <div className="map-legend-row">
            <span
              className="map-legend-line"
              style={{
                background: "transparent",
                borderTop: "2px dashed #3b82f6",
                height: 0,
                marginTop: 2,
              }}
            />
            <span style={{ color: "#93c5fd" }}>Direct (Shortest)</span>
          </div>
        )}
      </div>
    </div>
  );
}