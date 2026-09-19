import { useState, useEffect } from "react";
import axios from "axios";
import MapView from "./MapView";
import ResultPanel from "./ResultPanel";
import "./index.css";

const DEFAULT_PRESETS = [
  { id: "vjti-dadar", name: "VJTI → Dadar West", start: "VJTI Mumbai", end: "Dadar Station Mumbai" },
  { id: "vjti-dharavi", name: "VJTI → Dadar East (Dharavi Bypass)", start: "VJTI College", end: "Dadar East Station" },
  { id: "matunga-sion", name: "Matunga → Sion Circle", start: "Matunga East Station Mumbai", end: "Sion Circle Mumbai" },
  { id: "kings-dadartt", name: "King's Circle → Dadar TT", start: "King's Circle Mumbai", end: "Dadar TT Circle Mumbai" },
  { id: "wadala-antophill", name: "Wadala → Antop Hill", start: "Wadala", end: "Antop Hill" },
];

const FALLBACK_LOCATIONS = [
  "VJTI College",
  "Matunga East Station",
  "Matunga West Station",
  "Dharavi Junction",
  "Sion Circle",
  "King's Circle",
  "Parel Naka",
  "Dadar TT Circle",
  "Dadar West Station",
  "Dadar East Station",
  "Shivaji Bridge",
  "Naigaon Junction",
  "Cotton Green Road",
  "Antop Hill",
  "Wadala",
];

export default function App() {
  const [start, setStart] = useState("VJTI Mumbai");
  const [end, setEnd] = useState("Dadar Station Mumbai");
  const [travelMode, setTravelMode] = useState("cab"); // "cab" | "walk"
  const [presets, setPresets] = useState(DEFAULT_PRESETS);
  const [locations, setLocations] = useState(FALLBACK_LOCATIONS);
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load presets and bundled locations on mount
  useEffect(() => {
    axios.get("/api/presets")
      .then((res) => {
        if (res.data?.presets?.length) setPresets(res.data.presets);
        if (res.data?.locations?.length) setLocations(res.data.locations);
      })
      .catch(() => {});
  }, []);

  // ── Find safe route ───────────────────────────────────────
  const findRoute = async (customStart = null, customEnd = null) => {
    const s = (customStart ?? start).trim();
    const e = (customEnd ?? end).trim();

    if (!s || !e) {
      setError("Please enter both an origin and destination in Mumbai.");
      return;
    }
    if (s.toLowerCase() === e.toLowerCase()) {
      setError("Origin and destination cannot be the same location.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await axios.post("/api/route", { start: s, end: e });
      if (res.data?.route) {
        setRoute(res.data.route);
      } else {
        setError("Unable to compute route between these locations.");
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || "Failed to find a route. Please verify addresses.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPreset = (p) => {
    setStart(p.start);
    setEnd(p.end);
    setError(null);
    findRoute(p.start, p.end);
  };

  const handleSwap = () => {
    const currentStart = start;
    const currentEnd = end;
    setStart(currentEnd);
    setEnd(currentStart);
    setError(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !loading) findRoute();
  };

  return (
    <>
      {/* ── HTML5 Landmark Autocomplete Datalist ── */}
      <datalist id="mumbai-landmarks">
        {locations.map((loc) => {
          const name = typeof loc === "string" ? loc : loc.name;
          return <option key={name} value={name} />;
        })}
      </datalist>

      {/* ── Top Navigation ── */}
      <nav className="nav">
        <div className="nav-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          SafeRoutePlanner
        </div>
        <span className="nav-badge" style={{ color: "#94a3b8", borderColor: "var(--border)", background: "transparent" }}>
          Mumbai Safe Navigation
        </span>
      </nav>

      {/* ── Main Layout ── */}
      <div className="layout">
        {/* ── Primary Sidebar ── */}
        <aside className="sidebar">

          {/* 1. Route Planner Input Card */}
          <div className="card">
            <div className="card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
              </svg>
              Plan Your Route
            </div>

            {/* Travel Mode Segmented Control */}
            <div className="mode-toggle">
              <button
                type="button"
                className={`mode-btn ${travelMode === "cab" ? "active" : ""}`}
                onClick={() => setTravelMode("cab")}
                disabled={loading}
              >
                <span>🛺</span>
                <span>Auto / Cab</span>
              </button>
              <button
                type="button"
                className={`mode-btn ${travelMode === "walk" ? "active" : ""}`}
                onClick={() => setTravelMode("walk")}
                disabled={loading}
              >
                <span>🚶‍♀️</span>
                <span>Walking</span>
              </button>
            </div>

            {/* Origin */}
            <div>
              <div className="field-label">
                <span className="dot dot-start" />
                Origin
              </div>
              <input
                type="text"
                id="start-input"
                list="mumbai-landmarks"
                placeholder="e.g. VJTI Mumbai"
                value={start}
                onChange={(e) => { setStart(e.target.value); setError(null); }}
                onKeyDown={handleKeyDown}
                disabled={loading}
              />
            </div>

            {/* In-Between Action Row: Swap & Landmark Picker */}
            <div className="field-action-row">
              <button
                type="button"
                className="swap-btn"
                onClick={handleSwap}
                title="Swap origin and destination"
                disabled={loading}
              >
                <span>⇄</span> Swap
              </button>

              <select
                className="landmark-select"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    setEnd(e.target.value);
                    setError(null);
                    e.target.value = "";
                  }
                }}
                disabled={loading}
              >
                <option value="" disabled>⚡ Quick Pick Destination…</option>
                {locations.map((loc) => {
                  const name = typeof loc === "string" ? loc : loc.name;
                  return <option key={name} value={name}>{name}</option>;
                })}
              </select>
            </div>

            {/* Destination */}
            <div>
              <div className="field-label">
                <span className="dot dot-end" />
                Destination
              </div>
              <input
                type="text"
                id="end-input"
                list="mumbai-landmarks"
                placeholder="e.g. Dadar Station Mumbai"
                value={end}
                onChange={(e) => { setEnd(e.target.value); setError(null); }}
                onKeyDown={handleKeyDown}
                disabled={loading}
              />
            </div>

            {/* Sample Route Chips */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Frequent commute corridors:</div>
              <div className="preset-chips">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`preset-chip ${start === p.start && end === p.end ? "active" : ""}`}
                    onClick={() => handleSelectPreset(p)}
                    disabled={loading}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="error-box" style={{ marginTop: 14 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <div style={{ flex: 1 }}>{error}</div>
              </div>
            )}

            {/* Primary Action Button */}
            <button
              id="find-route-btn"
              className="btn-primary"
              onClick={() => findRoute()}
              disabled={!start.trim() || !end.trim() || loading}
            >
              {loading ? (
                <>
                  <div className="spinner" />
                  Finding safe {travelMode === "cab" ? "cab/auto" : "walking"} route…
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

          {/* 2. Route Recommendation & Decision Panel */}
          <ResultPanel
            route={route}
            travelMode={travelMode}
            onTravelModeChange={setTravelMode}
          />
        </aside>

        {/* ── Dominant Map Area ── */}
        <main className="map-wrapper">
          <MapView route={route} />

          {!route && !loading && (
            <div className="map-hint">
              Enter origin & destination in Mumbai or tap a corridor chip, then click <strong>Find Safe Route</strong>.
            </div>
          )}
        </main>
      </div>
    </>
  );
}