// ─── Safety Score → colour class ──────────────────────────────
export function safetyClass(score) {
  if (score <= 0.30) return "safe";
  if (score <= 0.55) return "moderate";
  return "unsafe";
}

// ─── Safety Score → label ─────────────────────────────────────
export function safetyLabel(score) {
  if (score <= 0.30) return "Safe";
  if (score <= 0.55) return "Moderate";
  return "Unsafe";
}

// ─── Safety Score bar colour (CSS colour string) ─────────────
export function barColor(value) {
  // value 0–1 (0=safe, 1=unsafe)
  if (value <= 0.30) return "#22c55e";
  if (value <= 0.55) return "#f59e0b";
  return "#ef4444";
}
