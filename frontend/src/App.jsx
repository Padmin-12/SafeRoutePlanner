import { useState } from "react";
import axios from "axios";
import MapView from "./MapView";
import ResultPanel from "./ResultPanel";
import "./index.css";

// ════════════════════════════════════════════════════════════
//  Safe Route Planner — Main App
// ════════════════════════════════════════════════════════════
export default function App() {
  const [start,   setStart]   = useState("VJTI Mumbai");
  const [end,     setEnd]     = useState("Dadar Station Mumbai");
  const [route,   setRoute]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // ── Find safe route ───────────────────────────────────────
  const findRoute = async () => {
    if (!start.trim() || !end.trim()) return;
    if (start.trim() === end.trim()) {
      setError("Start and destination cannot be the same.");
      return;
    }

    setLoading(true);
    setError(null);
    setRoute(null);

    try {
      const res = await axios.post("/api/route", {
        start: start.trim(),
        end:   end.trim(),
      });
      // Flask returns { success, start, end, route: { safestRoute, shortestRoute, ... } }
      setRoute(res.data.route);
    } catch (err) {
      const msg = err.response?.data?.error || "Failed to compute route. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Allow Enter key to trigger search
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !loading) findRoute();
  };

  return (
    <>
      {/* ── Nav ── */}
      <nav className="nav">
        <div className="nav-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          SafeRoute Planner
        </div>
        <span className="nav-badge">Any City · ML Powered</span>
      </nav>

      {/* ── Layout ── */}
      <div className="layout">
        {/* ── Sidebar ── */}
        <aside className="sidebar">

          {/* Route Planner Card */}
          <div className="card">
            <div className="card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
              </svg>
              Route Planner
            </div>

            {/* Start */}
            <div>
              <div className="field-label">
                <span className="dot dot-start" />
                Start Location
              </div>
              <input
                type="text"
                id="start-input"
                placeholder="e.g. VJTI Mumbai"
                value={start}
                onChange={(e) => { setStart(e.target.value); setRoute(null); setError(null); }}
                onKeyDown={handleKeyDown}
                disabled={loading}
              />
            </div>

            {/* End */}
            <div className="field-gap">
              <div className="field-label">
                <span className="dot dot-end" />
                Destination
              </div>
              <input
                type="text"
                id="end-input"
                placeholder="e.g. Dadar Station Mumbai"
                value={end}
                onChange={(e) => { setEnd(e.target.value); setRoute(null); setError(null); }}
                onKeyDown={handleKeyDown}
                disabled={loading}
              />
            </div>

            {/* Loading hint */}
            {loading && (
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, lineHeight: 1.6 }}>
                Fetching road network and scoring segments… this takes ~30s on first search.
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="error-box" style={{ marginTop: 14 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            {/* Find Route button */}
            <button
              id="find-route-btn"
              className="btn-primary"
              onClick={findRoute}
              disabled={!start.trim() || !end.trim() || loading}
            >
              {loading ? (
                <>
                  <div className="spinner" />
                  Computing…
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M22 2 11 13M22 2 15 22 11 13 2 9l20-7z"/>
                  </svg>
                  Find Safe Route
                </>
              )}
            </button>
          </div>

          {/* Safety Legend */}
          <div className="card">
            <div className="card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
              </svg>
              Safety Legend
            </div>
            <div className="legend">
              <div className="legend-item">
                <div className="legend-dot" style={{ background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
                <span><strong style={{ color: "#22c55e" }}>Green</strong> — Safe (score ≥ 0.50)</span>
              </div>
              <div className="legend-item">
                <div className="legend-dot" style={{ background: "#f59e0b", boxShadow: "0 0 6px #f59e0b" }} />
                <span><strong style={{ color: "#f59e0b" }}>Amber</strong> — Moderate (0.30–0.50)</span>
              </div>
              <div className="legend-item">
                <div className="legend-dot" style={{ background: "#ef4444", boxShadow: "0 0 6px #ef4444" }} />
                <span><strong style={{ color: "#ef4444" }}>Red</strong> — Unsafe (score &lt; 0.30)</span>
              </div>
            </div>
            <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.15)", fontSize: 11, color: "#94a3b8", lineHeight: 1.7 }}>
              <strong style={{ color: "#60a5fa" }}>Algorithm:</strong> Modified Dijkstra<br />
              <strong style={{ color: "#60a5fa" }}>Weight:</strong> length ÷ safety score<br />
              <strong style={{ color: "#60a5fa" }}>Factors:</strong> Lighting 30% · Risk 20% · Police 20% · Activity 15% · Connectivity 15%<br />
              <strong style={{ color: "#60a5fa" }}>Data:</strong> OpenStreetMap · RTM methodology
            </div>
          </div>

          {/* Result Panel */}
          <ResultPanel route={route} />
        </aside>

        {/* ── Map ── */}
        <main className="map-wrapper">
          <MapView route={route} />

          {!route && !loading && (
            <div className="map-hint">
              Enter any two locations above — works for any Indian city.
            </div>
          )}
        </main>
      </div>
    </>
  );
}