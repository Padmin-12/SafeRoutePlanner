// ─── Safety Score → Classification ───────────────────────────
// Scale: 0.0 to 1.0, where 1.0 is safest and 0.0 is highest risk.

export function safetyClass(score) {
  const s = Number(score) || 0;
  if (s >= 0.50) return "safe";
  if (s >= 0.30) return "moderate";
  return "unsafe";
}

export function safetyLabel(score) {
  const s = Number(score) || 0;
  if (s >= 0.50) return "Safe";
  if (s >= 0.30) return "Moderate";
  return "Unsafe";
}

// ─── Positive Metric Bar Color (Lighting, Crowd, Overall Safety) ──
// Higher is better: Green >= 50%, Amber >= 30%, Red < 30%
export function barColor(value) {
  const v = Number(value) || 0;
  if (v >= 0.50) return "#22c55e"; // green
  if (v >= 0.30) return "#f59e0b"; // amber
  return "#ef4444";                // red
}

// ─── Risk / Hazard Bar Color ────────────────────────────────────
// Lower is better: Green <= 30%, Amber <= 50%, Red > 50%
export function riskBarColor(value) {
  const v = Number(value) || 0;
  if (v <= 0.30) return "#22c55e"; // low risk = green
  if (v <= 0.50) return "#f59e0b"; // moderate risk = amber
  return "#ef4444";                // high risk = red
}
