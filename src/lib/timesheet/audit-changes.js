// WHAT MOVED SINCE THE PREVIOUS AUDIT COPY - Mánu 2026-09-05, designing the
// daily upload rhythm: "the only thing that changes on new uploads is if
// there is ANY change from the one before regarding hour changes then there
// should be a changes category. if any additioanl notes get added then mark
// those as changes too."
//
// The diff is scoped to the dates BOTH copies cover: a day the old copy never
// reached is new territory, not a change - the Not-decided pile catches it.
// Within the shared days, three kinds:
//   hours - billed or clocked minutes moved on a shift both copies hold
//   note  - a note appeared where there was none, grew, or a schedule note
//           joined a shift that had none
//   new   - a shift appeared on an already-covered day
// A shift that vanished has no row to badge; the summary counts it.

const dayKey = (d) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(d || "");
  return m ? Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]) : 0;
};

// pure: the change map between two audit builds' rows. `overlap` is the
// from/to both copies cover.
export function diffAuditRows(oldRows, newRows, overlap) {
  const from = dayKey(overlap.from);
  const to = dayKey(overlap.to);
  const inScope = (r) => {
    const k = dayKey(r.date);
    return k >= from && k <= to;
  };
  const byKey = new Map(oldRows.filter(inScope).map((r) => [r.shiftKey, r]));
  const changed = {};
  let gone = 0;
  const seen = new Set();
  for (const r of newRows) {
    if (!inScope(r)) continue;
    seen.add(r.shiftKey);
    const prev = byKey.get(r.shiftKey);
    if (!prev) {
      changed[r.shiftKey] = ["new"];
      continue;
    }
    const kinds = [];
    if ((r.billedMin ?? null) !== (prev.billedMin ?? null) || (r.clockedMin ?? null) !== (prev.clockedMin ?? null)) {
      kinds.push("hours");
    }
    const noteGrew =
      (!prev.note && r.note) ||
      (prev.note && r.note && (r.note.words || 0) > (prev.note.words || 0)) ||
      (!prev.scheduleNote && r.scheduleNote);
    if (noteGrew) kinds.push("note");
    if (kinds.length) changed[r.shiftKey] = kinds;
  }
  for (const k of byKey.keys()) if (!seen.has(k)) gone++;
  return { changed, gone };
}

// the shared days of two period ranges, or null when they never touch
export function periodOverlap(a, b) {
  const from = dayKey(a.from) >= dayKey(b.from) ? a.from : b.from;
  const to = dayKey(a.to) <= dayKey(b.to) ? a.to : b.to;
  return dayKey(from) <= dayKey(to) ? { from, to } : null;
}
