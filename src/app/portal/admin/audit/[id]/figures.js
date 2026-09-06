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

export { ampmLabel, minsWords } from "@/lib/timesheet/hours-label";
import { ampmLabel as ampm } from "@/lib/timesheet/hours-label";

// spans read "11:00 AM - 1:00 PM" everywhere - Mánu 2026-09-04, matching the
// flagged report's dateLine
export const span = (a, b) => (a == null || b == null ? null : `${ampm(a)} - ${ampm(b)}`);

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
  // THE FILE IS HERE AND THIS SHIFT IS NOT IN IT, which is neither "no export"
  // nor "they did not clock". 21 of the 862 billable shifts on 08/16-08/27 are
  // on the roster and absent from the clock export. Saying "not clocked" there
  // accuses somebody of something the document never recorded either way.
  if (row.inClockExport === false) {
    return { value: "not in the clock export", sub: null, tone: "faint" };
  }

  const from = row.actualFrom;
  const to = row.actualTo;
  if (from != null && to != null) {
    return { value: hrs(row.clockedMin), sub: span(from, to), tone: null };
  }
  if (from != null) return { value: "no clock-out", sub: `in ${ampm(from)}`, tone: "bad" };
  if (to != null) return { value: "no clock-in", sub: `out ${ampm(to)}`, tone: "bad" };
  return { value: "not clocked", sub: null, tone: "bad" };
}

// EACH END OF THE CLOCK, ON ITS OWN LINE, WITH ITS LOCATION.
//
// Mánu 2026-08-27 sent QSP's own attendance table as the shape to copy: Clock
// In, Clock In Location, Clock Out, Clock Out Location, each a tick or a cross.
// It reads at a glance and a single "Location: captured" line never did - it
// said nothing about WHICH end, and nothing about the punch itself.
//
// Three states, not two. A shift nobody clocked into never had a location to
// capture, so its location is neither a tick nor a cross: the export leaves it
// blank and so does this. Drawing a cross there would report 127 failures where
// there are 25.
export function punchEnd(row, end) {
  const clocked = end === "in" ? row.actualFrom : row.actualTo;
  const missed = end === "in" ? row.noIn : row.noOut;
  const gps = end === "in" ? row.gpsIn : row.gpsOut;

  // `why` carries the reason there is nothing to draw, because the two reasons
  // are different facts and only one of them is about the person.
  if (!row.clockAvailable) return { mark: null, time: null, gps: null, why: "no clock export" };
  if (row.inClockExport === false) {
    return { mark: null, time: null, gps: null, why: "not in the clock export" };
  }
  // an inherited boundary of a shared session is a time, never a tick - the
  // real punches live on the session's first and last booking
  const inherited = end === "in" ? row.inheritedIn : row.inheritedOut;
  return {
    mark: inherited ? null : clocked != null ? "yes" : missed ? "no" : null,
    time: clock(clocked),
    gps: gps === "yes" ? "yes" : gps === "no" ? "no" : null,
    why: null,
  };
}

// "Christensen, Bradley" reads "Bradley Christensen" on the card headings -
// Mánu 2026-09-05. QSP spelling stays everywhere data is matched or listed.
export const clientFirstLast = (c) => {
  const v = String(c || "");
  const i = v.indexOf(",");
  return i < 0 ? v : `${v.slice(i + 1).trim()} ${v.slice(0, i).trim()}`;
};
