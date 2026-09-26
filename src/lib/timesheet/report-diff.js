// WHAT A REPORT CHANGES ABOUT A DAY, slot by slot.
//
// The draft card under a day prints the difference, not every slot: a shift
// stretched from 4:41-6:30pm to 4:41-11pm reads as the old range crossed out
// beside the new one, with the hours the change adds.
//
// Each reported slot is matched to the recorded shift it overlaps most, once.
// A match with the same edges is left out - it is what the card is quiet
// about. A match with different edges is a change, carrying the old range and
// the hours it adds or takes. A slot that overlaps nothing on record is an
// added shift; a recorded shift nothing matched was taken out. Minutes past
// midnight in, minutes out; the caller draws the clocks.
const r2 = (n) => Math.round(n * 100) / 100;

export function slotChanges(recorded, reported) {
  const was = (recorded || [])
    .filter((s) => Number.isFinite(s?.from) && Number.isFinite(s?.to) && s.to > s.from)
    .map((s) => ({ from: s.from, to: s.to, used: false }));
  const out = [];
  const now = (reported || [])
    .filter((s) => Number.isFinite(s?.from) && Number.isFinite(s?.to) && s.to > s.from)
    .sort((a, b) => a.from - b.from);
  for (const slot of now) {
    let best = null;
    let bestOverlap = 0;
    for (const s of was) {
      if (s.used) continue;
      const overlap = Math.min(s.to, slot.to) - Math.max(s.from, slot.from);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = s;
      }
    }
    if (!best) {
      out.push({ kind: "added", from: slot.from, to: slot.to, delta: r2((slot.to - slot.from) / 60) });
      continue;
    }
    best.used = true;
    if (best.from === slot.from && best.to === slot.to) continue;
    out.push({
      kind: "changed",
      from: slot.from, to: slot.to,
      wasFrom: best.from, wasTo: best.to,
      delta: r2(((slot.to - slot.from) - (best.to - best.from)) / 60),
    });
  }
  for (const s of was) {
    if (!s.used) out.push({ kind: "removed", wasFrom: s.from, wasTo: s.to, delta: r2(-(s.to - s.from) / 60) });
  }
  return out.sort((a, b) => (a.from ?? a.wasFrom) - (b.from ?? b.wasFrom));
}
