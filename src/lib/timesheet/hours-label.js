// hour labels shared by the audit screens and the flagged reports, so the
// PDF and the page cannot spell the same figure two ways. Pure - no react,
// no pdf-lib - importable from either side.

// "10:20 AM" - the full clock label
export function ampmLabel(min) {
  if (min == null) return null;
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// "1 hr 30 min" beside 1.50h - and null on round hours, Mánu's rule: "if its
// round number like 1.00h 2.00h 3.00h etc lets NOT include the 1 hr label"
export function minsWords(m) {
  if (m == null || m % 60 === 0) return null;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return h ? `${h} hr ${r} min` : `${r} min`;
}
