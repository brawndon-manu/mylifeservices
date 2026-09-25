// a typed break, checked on the card the way the answer action will check it.
//
// the question already carries the stretches it offered as text ("10a-11:15a"),
// so the card reads those instead of working them out again from the day. the
// rules are mealTimeFits and restTimeFits in questions.js, in plain minutes -
// the card used to add ten to "11:55" and compare "11:5510" as text, so a ten
// in the last few minutes of its window showed green and was refused on save.
// no imports but the time reader, so the card and the tests can both load it.
import { parseLooseTime } from "../loose-time.js";

// "1:15p" / "115" -> minutes past midnight
export function minutesOf(raw) {
  const t = parseLooseTime(raw || "", { assumeWorkday: true });
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// ["10a-11:15a", "2:15p-3p"] -> [{ from: 600, to: 675 }, { from: 855, to: 900 }]
export function spansOf(list) {
  return (list || [])
    .map((x) => String(x).split("-"))
    .map(([a, b]) => ({ from: minutesOf(a), to: minutesOf(b) }))
    .filter((w) => w.from != null && w.to != null);
}

const holds = (spans, start, minutes) =>
  spans.some((w) => start >= w.from && start + minutes <= w.to);

// a lunch has to start in one of the gaps it was offered with the whole half
// hour to spare, so a time inside a shift worked is out. a day with no gap at
// all takes any time: the server refuses "window" and never "nogap", because a
// lunch taken without clocking out leaves no gap to find.
export function lunchOutside(need, start) {
  if (need?.kindOf !== "meal" || start == null) return false;
  const gaps = spansOf(need.windows);
  return gaps.length > 0 && !holds(gaps, start, need.minutes || 30);
}

// a rest has to sit inside a shift worked, and inside its own window.
// "outside", "window", or null when it fits
export function restOutside(need, start) {
  if (need?.kindOf !== "rest" || start == null) return null;
  const minutes = need.minutes || 10;
  const shifts = spansOf(need.shifts);
  if (shifts.length && !holds(shifts, start, minutes)) return "outside";
  const windows = spansOf(need.window);
  if (windows.length && !holds(windows, start, minutes)) return "window";
  return null;
}
