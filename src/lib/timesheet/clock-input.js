// A CLOCK TIME AS A PERSON TYPES IT - Mánu 2026-09-06: "the option to
// include the time when adjusting the billable hours so it just shows the
// amount of time that way." He reads spans off the cards ("2:30p-4:45p")
// and should be able to answer in the same language instead of doing the
// arithmetic himself; the figure the review stores is still minutes.
//
// Pure, shared by the adjust control and its tests. Forgiving on the forms
// people actually type - "2:30p", "2:30 PM", "14:30", "2p" - and strict on
// the one thing that cannot be guessed: a bare "9" with no colon and no
// meridiem is morning or evening, so it parses to nothing rather than to a
// coin flip.

// "2:30p" | "2:30 PM" | "14:30" | "2p" -> minutes since midnight, or null
export function clockInMin(s) {
  const v = String(s || "").trim().toLowerCase();
  if (!v) return null;
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?m?\.?)?$/.exec(v);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mm = m[2] ? parseInt(m[2], 10) : 0;
  const mer = m[3] || null;
  if (mm > 59) return null;
  if (mer) {
    if (h < 1 || h > 12) return null;
    if (h === 12) h = 0;
    if (mer === "p") h += 12;
    return h * 60 + mm;
  }
  // no meridiem: only a colon makes it readable as a 24-hour clock
  if (!m[2]) return null;
  if (h > 23) return null;
  return h * 60 + mm;
}

// the minutes between two typed times, or null until both read cleanly and
// the end follows the start. A span across midnight is not guessed at - the
// amount inputs are right there for that one.
export function spanMinutes(from, to) {
  const f = clockInMin(from);
  const t = clockInMin(to);
  if (f == null || t == null || t <= f) return null;
  return t - f;
}
