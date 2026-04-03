import { useState } from "react";
import { safetyClass, safetyLabel, barColor } from "./utils";

// ─── Safety bar row ───────────────────────────────────────────
function SafetyBar({ label, value }) {
  const pct   = Math.round(value * 100);
  const color = barColor(value);
  return (
    <div className="safety-bar-row">
      <span className="safety-bar-label">{label}</span>
      <div className="safety-bar-track">
        <div
          className="safety-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="safety-bar-val" style={{ color }}>{pct}%</span>
    </div>
  );
}

// ─── Segment pill ─────────────────────────────────────────────
function SegPill({ score }) {
  const cls = safetyClass(score);
  return (
    <span className={`seg-pill ${cls}`}>
      <span>{cls === "safe" ? "✓" : cls === "moderate" ? "◈" : "✕"}</span>
      {safetyLabel(score)}
    </span>
  );
}

// ─── Single route detail panel ────────────────────────────────
function RouteDetail({ routeData, label }) {
  if (!routeData) return <p style={{ color: "#94a3b8", padding: 16 }}>No {label} data available.</p>;

  const cls         = safetyClass(routeData.avgSafetyScore);
  const emoji       = cls === "safe" ? "🟢" : cls === "moderate" ? "🟡" : "🔴";
  const avgCrime    = avg(routeData.segments, "crime");
  const avgLighting = avg(routeData.segments, "lighting");
  const avgCrowd    = avg(routeData.segments, "crowd");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Summary card */}
      <div className="card">
        <div className="card-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          {label}
        </div>

        <div className={`result-badge ${cls}`}>
          {emoji} {routeData.safetyRating} Route
        </div>

        <div className="stat-grid">
          <div className="stat-box">
            <span className="stat-label">Distance</span>
            <span className="stat-value">{routeData.totalDistanceKm}</span>
            <span className="stat-unit">km</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Est. Time</span>
            <span className="stat-value">{routeData.estimatedTimeMin}</span>
            <span className="stat-unit">min</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Safety Score</span>
            <span className="stat-value" style={{ color: barColor(routeData.avgSafetyScore) }}>
              {((1 - routeData.avgSafetyScore) * 100).toFixed(0)}
            </span>
            <span className="stat-unit">/ 100</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Stops</span>
            <span className="stat-value">{routeData.path?.length ?? "—"}</span>
            <span className="stat-unit">waypoints</span>
          </div>
        </div>

        <div className="safety-bars">
          <SafetyBar label="Crime"    value={avgCrime}    />
          <SafetyBar label="Lighting" value={avgLighting} />
          <SafetyBar label="Crowd"    value={avgCrowd}    />
        </div>
      </div>

      {/* Route waypoints */}
      <div className="card">
        <div className="card-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/>
          </svg>
          Route Path
        </div>

        <div className="path-steps">
          {(routeData.path ?? []).map((nodeId, i) => {
            const isFirst = i === 0;
            const isLast  = i === routeData.path.length - 1;
            const seg     = i < routeData.segments.length ? routeData.segments[i] : null;

            return (
              <div key={nodeId} className="path-node">
                <div className={`path-node-dot ${isFirst ? "first" : isLast ? "last" : ""}`} />
                <div className="path-node-info">
                  <div className="path-node-name">
                    {routeData.pathNames?.[i] ?? nodeId}
                    {isFirst && <span style={{ marginLeft: 6, fontSize: 10, color: "#22c55e", fontWeight: 700 }}>START</span>}
                    {isLast  && <span style={{ marginLeft: 6, fontSize: 10, color: "#ef4444", fontWeight: 700 }}>END</span>}
                  </div>
                  {seg && (
                    <div className="path-segment-info">
                      <span>{seg.distanceKm} km</span>
                      <SegPill score={seg.safetyScore} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main ResultPanel ─────────────────────────────────────────
export default function ResultPanel({ route }) {
  const [tab, setTab] = useState("safest");

  if (!route) {
    return (
      <div className="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 13l4.553 2.276A1 1 0 0021 21.382V10.618a1 1 0 00-.553-.894L15 7m0 13V7m0 0L9 4"/>
        </svg>
        <p>Select start and end locations,<br />then click <strong>Find Safe Route</strong>.</p>
      </div>
    );
  }

  // Support both new dual-route shape { safestRoute, shortestRoute }
  // and legacy flat shape (single route object)
  const safest   = route.safestRoute   ?? (route.segments ? route : null);
  const shortest = route.shortestRoute ?? null;

  // If only one route exists (legacy), skip tabs
  if (!shortest) {
    return <RouteDetail routeData={safest} label="Safest Route" />;
  }

  return (
    <div>
      {/* Tab bar */}
      <div style={{
        display: "flex",
        borderBottom: "1px solid #1e293b",
        marginBottom: 0,
      }}>
        <button
          onClick={() => setTab("safest")}
          style={{
            flex: 1,
            padding: "10px 0",
            background: "none",
            border: "none",
            borderBottom: tab === "safest" ? "2px solid #22c55e" : "2px solid transparent",
            color: tab === "safest" ? "#22c55e" : "#64748b",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          🟢 Safest Route
        </button>
        <button
          onClick={() => setTab("shortest")}
          style={{
            flex: 1,
            padding: "10px 0",
            background: "none",
            border: "none",
            borderBottom: tab === "shortest" ? "2px solid #3b82f6" : "2px solid transparent",
            color: tab === "shortest" ? "#3b82f6" : "#64748b",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          🔵 Shortest Route
        </button>
      </div>

      {tab === "safest"
        ? <RouteDetail routeData={safest}   label="Safest Route"   />
        : <RouteDetail routeData={shortest} label="Shortest Route" />
      }
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────
function avg(segments = [], field) {
  if (!segments.length) return 0;
  return segments.reduce((s, e) => s + (e[field] ?? 0), 0) / segments.length;
}