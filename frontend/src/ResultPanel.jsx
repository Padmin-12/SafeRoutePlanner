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

// ─── Segment pill (Safe / Moderate / Unsafe) ─────────────────
function SegPill({ score }) {
  const cls = safetyClass(score);
  return (
    <span className={`seg-pill ${cls}`}>
      <span>{cls === "safe" ? "✓" : cls === "moderate" ? "◈" : "✕"}</span>
      {safetyLabel(score)}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
export default function ResultPanel({ route }) {
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

  const cls          = safetyClass(route.avgSafetyScore);
  const emoji        = cls === "safe" ? "🟢" : cls === "moderate" ? "🟡" : "🔴";

  // Average safety factors across all segments
  const avgCrime     = avg(route.segments, "crime");
  const avgLighting  = avg(route.segments, "lighting");
  const avgCrowd     = avg(route.segments, "crowd");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* ── Summary ── */}
      <div className="card">
        <div className="card-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          Route Result
        </div>

        <div className={`result-badge ${cls}`}>
          {emoji} {route.safetyRating} Route
        </div>

        {/* Stats grid */}
        <div className="stat-grid">
          <div className="stat-box">
            <span className="stat-label">Distance</span>
            <span className="stat-value">{route.totalDistanceKm}</span>
            <span className="stat-unit">km</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Est. Time</span>
            <span className="stat-value">{route.estimatedTimeMin}</span>
            <span className="stat-unit">min (walk)</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Safety Score</span>
            <span className="stat-value" style={{ color: barColor(route.avgSafetyScore) }}>
              {((1 - route.avgSafetyScore) * 100).toFixed(0)}
            </span>
            <span className="stat-unit">/ 100</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Stops</span>
            <span className="stat-value">{route.path.length}</span>
            <span className="stat-unit">waypoints</span>
          </div>
        </div>

        {/* Safety breakdown bars */}
        <div className="safety-bars">
          <SafetyBar label="Crime"    value={avgCrime}    />
          <SafetyBar label="Lighting" value={avgLighting} />
          <SafetyBar label="Crowd"    value={avgCrowd}    />
        </div>
      </div>

      {/* ── Route waypoints ── */}
      <div className="card">
        <div className="card-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/>
          </svg>
          Route Path
        </div>

        <div className="path-steps">
          {route.path.map((nodeId, i) => {
            const isFirst = i === 0;
            const isLast  = i === route.path.length - 1;
            const seg     = i < route.segments.length ? route.segments[i] : null;

            return (
              <div key={nodeId} className="path-node">
                <div
                  className={`path-node-dot ${isFirst ? "first" : isLast ? "last" : ""}`}
                />
                <div className="path-node-info">
                  <div className="path-node-name">
                    {route.pathNames[i]}
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

// ─── Helper: average a numeric field across segments ─────────
function avg(segments, field) {
  if (!segments.length) return 0;
  return segments.reduce((s, e) => s + e[field], 0) / segments.length;
}
