// The four figures on an audit card, formatted once for both screens.
//
// StudyMode and AuditCards had their own copies of these and were one edit away
// from disagreeing about the same shift.

export const clock = (min) => {
  if (min == null) return null;
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`;
};

export const span = (a, b) => (a == null || b == null ? null : `${clock(a)}-${clock(b)}`);

export const hrs = (m) => (m == null ? null : `${(m / 60).toFixed(2)}h`);

// WHAT THE CLOCK RECORDED, INCLUDING HALF OF IT.
//
// Mánu 2026-08-27: "how do we display only one sided clock in or clock out."
//
// A shift clocked at one end has no duration, so it used to read "not clocked"
// and the punch we DO hold went unshown - Delgado Pineda 08/17 clocked in at
// 8:55a and never out, and the card said nothing about the 8:55a. Eight shifts
// in the 08/16-08/25 export, all of them clock-in with no clock-out.
//
// Four of those eight carry the flag with no time against it: QSP says they
// clocked and records no minute. There is nothing to show for those, so they
// keep saying "not clocked" rather than inventing a time.
export function clockedFigure(row) {
  if (!row.clockAvailable) return { value: "no clock export", sub: null, tone: "faint" };

  const from = row.actualFrom;
  const to = row.actualTo;
  if (from != null && to != null) {
    return { value: hrs(row.clockedMin), sub: span(from, to), tone: null };
  }
  if (from != null) return { value: "no clock-out", sub: `in ${clock(from)}`, tone: "bad" };
  if (to != null) return { value: "no clock-in", sub: `out ${clock(to)}`, tone: "bad" };
  return { value: "not clocked", sub: null, tone: "bad" };
}
