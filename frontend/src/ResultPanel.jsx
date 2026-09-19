import { useState } from "react";
import { safetyClass, safetyLabel, barColor, riskBarColor } from "./utils";

// ─── Safety Bar Row ───────────────────────────────────────────
function FactorBar({ label, desc, value, isRisk = false }) {
  const pct   = Math.min(100, Math.max(0, Math.round(value * 100)));
  const color = isRisk ? riskBarColor(value) : barColor(value);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{label}</span>
        <span style={{ fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div className="safety-bar-track" style={{ height: 6 }}>
        <div
          className="safety-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {desc && <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{desc}</div>}
    </div>
  );
}

// ─── Segment Pill ─────────────────────────────────────────────
function SegPill({ score }) {
  const cls = safetyClass(score);
  const icon = cls === "safe" ? "✓" : cls === "moderate" ? "◈" : "✕";
  return (
    <span className={`seg-pill ${cls}`}>
      <span>{icon}</span>
      {safetyLabel(score)}
    </span>
  );
}

// ─── Route Detail View ────────────────────────────────────────
function RouteDetail({ routeData, isSafest, tradeoff, travelMode = "cab", onTravelModeChange }) {
  const [showFactors, setShowFactors] = useState(true);
  const [showSteps, setShowSteps] = useState(false);

  if (!routeData) return null;

  const cls = safetyClass(routeData.avgSafetyScore);
  const emoji = cls === "safe" ? "🟢" : cls === "moderate" ? "🟡" : "🔴";

  const avgLighting = avg(routeData.segments, "lighting");
  const avgCrowd    = avg(routeData.segments, "crowd");
  const avgPolice   = avg(routeData.segments, "police");
  const avgConn     = avg(routeData.segments, "connectivity");
  const avgRisk     = avg(routeData.segments, "risk", "crime");

  const estTime = travelMode === "cab"
    ? (routeData.cabTimeMin ?? Math.max(1, Math.round((routeData.totalDistanceKm / 25) * 60)))
    : (routeData.walkTimeMin ?? routeData.estimatedTimeMin ?? Math.max(1, Math.round((routeData.totalDistanceKm / 4) * 60)));

  return (
    <div>
      {/* Hero Decision Card */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div className={`result-badge ${cls}`} style={{ margin: 0 }}>
            {emoji} {routeData.safetyRating}
          </div>

          {/* Travel Mode Switcher */}
          {onTravelModeChange && (
            <div style={{ display: "inline-flex", background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 2 }}>
              <button
                type="button"
                onClick={() => onTravelModeChange("cab")}
                style={{
                  border: "none",
                  background: travelMode === "cab" ? "var(--brand-600)" : "transparent",
                  color: travelMode === "cab" ? "#60a5fa" : "#94a3b8",
                  padding: "4px 8px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                🛺 Cab / Auto
              </button>
              <button
                type="button"
                onClick={() => onTravelModeChange("walk")}
                style={{
                  border: "none",
                  background: travelMode === "walk" ? "var(--brand-600)" : "transparent",
                  color: travelMode === "walk" ? "#22c55e" : "#94a3b8",
                  padding: "4px 8px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                🚶‍♀️ Walk
              </button>
            </div>
          )}
        </div>

        {/* Primary Travel Decision Metrics */}
        <div className="stat-grid" style={{ gridTemplateColumns: "1.2fr 1fr 1fr", marginBottom: 14 }}>
          <div className="stat-box">
            <span className="stat-label">Safety Score</span>
            <span className="stat-value" style={{ color: barColor(routeData.avgSafetyScore) }}>
              {(routeData.avgSafetyScore * 100).toFixed(0)}
            </span>
            <span className="stat-unit">/ 100</span>
          </div>

          <div className="stat-box">
            <span className="stat-label">Distance</span>
            <span className="stat-value">{routeData.totalDistanceKm}</span>
            <span className="stat-unit">km</span>
          </div>

          <div className="stat-box">
            <span className="stat-label">{travelMode === "cab" ? "Est. Drive" : "Est. Walk"}</span>
            <span className="stat-value">{estTime}</span>
            <span className="stat-unit">min</span>
          </div>
        </div>

        {/* Real-world Travel Guidance Banner */}
        {travelMode === "cab" ? (
          <div className="driver-advisory" style={{ marginTop: 0, marginBottom: 14 }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>🛺</span>
            <div>
              <strong style={{ color: "#93c5fd" }}>Passenger Guide (Cab / Auto):</strong>
              <div style={{ marginTop: 2, fontSize: 11, lineHeight: 1.4 }}>
                Show this route to your auto or cab driver. It keeps strictly to wide, well-lit arterial avenues with active commercial surveillance, avoiding dark shortcuts and unmonitored backroads.
              </div>
            </div>
          </div>
        ) : (
          <div
            className="driver-advisory"
            style={{
              marginTop: 0,
              marginBottom: 14,
              background: "rgba(34, 197, 94, 0.08)",
              borderColor: "rgba(34, 197, 94, 0.25)",
              color: "#bbf7d0",
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>🚶‍♀️</span>
            <div>
              <strong style={{ color: "#86efac" }}>Pedestrian Guide:</strong>
              <div style={{ marginTop: 2, fontSize: 11, lineHeight: 1.4 }}>
                Follow illuminated sidewalks along main streets with open shops, transit hubs, and pedestrian activity.
              </div>
            </div>
          </div>
        )}

        {/* Clear Trade-Off Summary Callout */}
        {isSafest && tradeoff && (
          <div style={{
            padding: "12px 14px",
            borderRadius: 10,
            background: tradeoff.isSameRoute ? "rgba(59, 130, 246, 0.08)" : "rgba(34, 197, 94, 0.08)",
            border: tradeoff.isSameRoute ? "1px solid rgba(59, 130, 246, 0.25)" : "1px solid rgba(34, 197, 94, 0.25)",
            fontSize: 12,
            lineHeight: 1.6,
            color: "#e2e8f0"
          }}>
            <div style={{ fontWeight: 700, color: tradeoff.isSameRoute ? "#60a5fa" : "#22c55e", marginBottom: 4 }}>
              {tradeoff.isSameRoute ? "✓ Direct Route is Already the Safest" : "🛡️ Compared with the Direct Route"}
            </div>

            {tradeoff.isSameRoute ? (
              <div style={{ color: "#94a3b8" }}>
                The shortest route naturally follows well-lit arterial streets. No detour is required.
              </div>
            ) : (
              <div>
                Adds <strong>+{tradeoff.distanceDeltaKm} km</strong> ({tradeoff.distanceDeltaPct > 0 ? `+${tradeoff.distanceDeltaPct}%` : "minor"} distance) for a <strong>+{tradeoff.safetyImprovementPct}%</strong> safety score improvement
                {travelMode === "cab" ? (
                  tradeoff.cabTimeDeltaMin > 0 ? ` (+${tradeoff.cabTimeDeltaMin} min drive)` : " (same drive time)"
                ) : (
                  tradeoff.timeDeltaMin > 0 ? ` (+${tradeoff.timeDeltaMin} min walking)` : " (same walking time)"
                )}.
                {tradeoff.riskySegmentsAvoided > 0 && (
                  <div style={{ color: "#4ade80", marginTop: 4, fontWeight: 600 }}>
                    ✓ Successfully avoids {tradeoff.riskySegmentsAvoided} poorly-lit or isolated street segment{tradeoff.riskySegmentsAvoided > 1 ? "s" : ""}.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!isSafest && (
          <div style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(245, 158, 11, 0.08)",
            border: "1px solid rgba(245, 158, 11, 0.2)",
            fontSize: 12,
            lineHeight: 1.5,
            color: "#fde68a"
          }}>
            <strong>Direct route trade-off:</strong> This path saves distance and travel time, but passes through road segments with lower illumination or activity.
          </div>
        )}
      </div>

      {/* Progressive Disclosure Section 1: Why is this route safer? */}
      <div>
        <button
          type="button"
          className={`accordion-header ${showFactors ? "open" : ""}`}
          onClick={() => setShowFactors(!showFactors)}
        >
          <span>Why is this route considered {routeData.safetyRating.toLowerCase()}?</span>
          <svg className="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {showFactors && (
          <div className="accordion-body">
            <FactorBar
              label="Street Illumination"
              desc="Street lamp coverage & well-lit main arterial avenues"
              value={avgLighting}
            />
            <FactorBar
              label="Natural Surveillance / Activity"
              desc="Pedestrian presence, open shops, cafes & active amenities"
              value={avgCrowd}
            />
            <FactorBar
              label="Police Proximity"
              desc="Proximity to local police stations along the path"
              value={avgPolice}
            />
            <FactorBar
              label="Road Connectivity"
              desc="Well-connected intersections with clear sightlines"
              value={avgConn}
            />
            <FactorBar
              label="Hazard Exposure"
              desc="Proximity to unmonitored or industrial areas (lower is better)"
              value={avgRisk}
              isRisk={true}
            />
          </div>
        )}
      </div>

      {/* Progressive Disclosure Section 2: Turn-by-turn road segments */}
      <div>
        <button
          type="button"
          className={`accordion-header ${showSteps ? "open" : ""}`}
          onClick={() => setShowSteps(!showSteps)}
        >
          <span>Turn-by-turn street details ({routeData.segments?.length ?? 0} segments)</span>
          <svg className="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {showSteps && (
          <div className="accordion-body" style={{ padding: 0 }}>
            <div className="path-steps">
              {(routeData.segments ?? []).map((seg, i) => {
                const isFirst = i === 0;
                const isLast  = i === routeData.segments.length - 1;

                return (
                  <div key={`${seg.from}-${seg.to}-${i}`} className="path-node" style={{ padding: "10px 20px" }}>
                    <div className={`path-node-dot ${isFirst ? "first" : isLast ? "last" : ""}`} />
                    <div className="path-node-info">
                      <div className="path-node-name">
                        {seg.fromName} → {seg.toName}
                        {isFirst && <span style={{ marginLeft: 6, fontSize: 10, color: "#22c55e", fontWeight: 700 }}>START</span>}
                        {isLast  && <span style={{ marginLeft: 6, fontSize: 10, color: "#ef4444", fontWeight: 700 }}>END</span>}
                      </div>
                      <div className="path-segment-info">
                        <span>{seg.distanceKm} km</span>
                        <SegPill score={seg.safetyScore} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Honest Relative Safety Framing */}
      <div className="safety-disclaimer">
        <strong>ℹ️ Safety Notice:</strong> Safety scores are estimated relative to available Mumbai street options using OpenStreetMap environmental indicators (lighting, commercial activity, police proximity). This is an algorithmic aid and does not guarantee absolute safety. Always stay vigilant and trust your intuition.
      </div>
    </div>
  );
}

// ─── Main ResultPanel Component ───────────────────────────────
export default function ResultPanel({ route, travelMode = "cab", onTravelModeChange }) {
  const [activeTab, setActiveTab] = useState("safest");

  if (!route) {
    return (
      <div className="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
        <p>
          Enter your Mumbai origin and destination above,<br />
          then tap <strong>Find Safe Route</strong>.
        </p>
      </div>
    );
  }

  const safest   = route.safestRoute   ?? (route.segments ? route : null);
  const shortest = route.shortestRoute ?? null;
  const tradeoff = route.tradeoff      ?? null;

  return (
    <div>
      {/* Route Switcher Tabs */}
      {shortest && (
        <div style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          background: "rgba(13, 21, 38, 0.95)",
        }}>
          <button
            type="button"
            onClick={() => setActiveTab("safest")}
            style={{
              flex: 1,
              padding: "12px 6px",
              background: "none",
              border: "none",
              borderBottom: activeTab === "safest" ? "2px solid #22c55e" : "2px solid transparent",
              color: activeTab === "safest" ? "#22c55e" : "#64748b",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            🛡️ Safer Route ({safest?.safetyRating ?? ""})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("shortest")}
            style={{
              flex: 1,
              padding: "12px 6px",
              background: "none",
              border: "none",
              borderBottom: activeTab === "shortest" ? "2px solid #3b82f6" : "2px solid transparent",
              color: activeTab === "shortest" ? "#3b82f6" : "#64748b",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            📏 Direct Route ({shortest.totalDistanceKm} km)
          </button>
        </div>
      )}

      {/* Active Route View */}
      {activeTab === "safest" ? (
        <RouteDetail
          routeData={safest}
          isSafest={true}
          tradeoff={tradeoff}
          travelMode={travelMode}
          onTravelModeChange={onTravelModeChange}
        />
      ) : (
        <RouteDetail
          routeData={shortest}
          isSafest={false}
          tradeoff={tradeoff}
          travelMode={travelMode}
          onTravelModeChange={onTravelModeChange}
        />
      )}
    </div>
  );
}

// Helper to calculate segment averages safely
function avg(segments = [], field1, field2) {
  if (!segments || !segments.length) return 0;
  return segments.reduce((sum, s) => {
    const val = s[field1] ?? (field2 ? s[field2] : 0) ?? 0;
    return sum + Number(val);
  }, 0) / segments.length;
}