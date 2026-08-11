import { shiftsOf } from "@/lib/timesheet/questions";

// ONE DAY DRAWN ON A TIME AXIS - the shape Mánu asked for on 2026-08-11, after
// sketching it against his own calendar: "I feel like this may be too
// complicated. Maybe we can add a simple view option as well, for something
// they're more familiar with."
//
// The reason a calendar earns its place here rather than being decoration: every
// rule these questions turn on is SPATIAL. A ten belongs in the first four hours
// or the last four (`restWindow`), a meal has to start before the fifth hour, a
// break logged at a shift edge is time added rather than time taken. Written as
// sentences those have to be parsed. Drawn on an axis, a break in the wrong
// place is simply in the wrong place.
//
// Presentational only. Every answer still goes through TimesheetQuestion, which
// owns the choices, the per-slot times, the locking and the change warning.

// THE COLOURS THE SIGNED DOCUMENT USES, taken from render.js rather than picked
// again here - REST rgb(1, .949, .6) and MEAL rgb(.71, .85, .98). The whole
// argument for this view is that it looks like the paperwork they already read,
// so a second colour vocabulary would defeat it. Mánu's own sketch drew a rest
// in blue, which is the colour the report already spends on a meal.
const REST = "#fff299";
const MEAL = "#b5d9fa";

// A 15 minute rest is 11px at 44px/hour and a ten is 7px - too short to hold a
// label, and under any sane touch target. So the bar is floored at a height that
// can carry its text, which distorts the very shortest breaks upward by a few
// pixels. That is the right trade: the bar is the PICTURE, and the tap target is
// the question card underneath it.
const MIN_BLOCK_PX = 15;
const PX_PER_HOUR = 44;

const hhmm = (m) => {
  const h = (Math.floor(m / 60) % 12) || 12;
  const mm = m % 60;
  return `${h}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${m % 1440 < 720 ? "a" : "p"}`;
};

// ONE SCALE, BUT EACH DAY CROPPED TO ITS OWN HOURS.
//
// The constant is PX_PER_HOUR, not the window: a ten hour day draws twice as
// tall as a five hour one, so the picture still cannot tell you a short day and
// a long day are the same size. What is NOT shared is the start and end, and
// that matters more than it sounds. Held to one 7a-7p window across the sheet -
// which is what this did first - Uribe's 07/16 works 11a to 5:30p and spends
// about two fifths of its column on empty hours, on a phone, once per day, for
// thirteen days. Cropping costs nothing true and gives back the screen.
function dayWindow(day, shifts) {
  let lo = shifts[0].from;
  let hi = shifts[shifts.length - 1].to;
  for (const b of day.breaks || []) {
    if (Number.isFinite(b.start?.min)) lo = Math.min(lo, b.start.min);
    if (Number.isFinite(b.end?.min)) hi = Math.max(hi, b.end.min);
  }
  // out to whole hours so the gridline labels are hours, not 7:23
  return { from: Math.floor(lo / 60) * 60, to: Math.ceil(hi / 60) * 60 };
}

// A PUNCH GAP IS NOT A REST PERIOD, and this drew it as one.
//
// Mánu 2026-08-11, looking at his own 07/16: "Why is it showing rest one PM and
// rest three fifteen? I've already said this before. If there's nothing on the
// schedule for a time slot in between shifts, those are unworked hours.
// Therefore, we cannot assume that the rest is right there."
//
// He is right and the engine already agreed with him - 07/16 carries
// `restRecorded: 0` and `restTaken: 0`, and not one rest row in the report is
// under his name that day. `parse.js` files any 10-15 minute gap between punch
// pairs as `kind: "rest"` for its own arithmetic, and drawing that in the
// document's yellow put "you took two rests" directly beside a question asking
// whether he took any. Across his sheet it drew two on five days that record
// none, and none on three days that record one.
//
// THE LINE IS PAID vs UNPAID. A rest period is paid and ON the clock, so it can
// never be the gap between two punches - a gap means he was not being paid, and
// unscheduled time is the thing the outside-your-shift question penalises. A
// meal is unpaid and OFF the clock, so a meal-length gap genuinely is how a meal
// gets recorded. So meals still come from the punches and rests never do: a rest
// is drawn only where one is actually on record for this person.
const MEAL_KIND = "meal";

// the gaps between shifts, which are unscheduled time and are labelled as such
function gapsOf(day, shifts) {
  const meals = new Set(
    (day.breaks || []).filter((b) => b.kind === MEAL_KIND).map((b) => b.start?.min),
  );
  const out = [];
  for (let i = 1; i < shifts.length; i++) {
    const from = shifts[i - 1].to;
    const to = shifts[i].from;
    if (to <= from) continue;
    out.push({ from, to, meal: meals.has(from) });
  }
  return out;
}

// what the day says out loud. The blocks are aria-hidden - absolutely positioned
// colour is nothing at all to a screen reader, and this page is read by people
// who use one.
function spoken(day, shifts, rests) {
  const bits = shifts.map((s) => `worked ${hhmm(s.from)} to ${hhmm(s.to)}`);
  for (const g of gapsOf(day, shifts)) {
    bits.push(
      `${g.meal ? "meal break" : "not scheduled"} ${hhmm(g.from)} to ${hhmm(g.to)}`,
    );
  }
  for (const r of rests) bits.push(`rest period on record at ${hhmm(r.min)}`);
  return bits.length ? `${bits.join(", ")}.` : "Nothing recorded for this day.";
}

export default function DayCalendar({ day, rests = [] }) {
  const shifts = shiftsOf(day);
  if (!shifts.length) return null;

  const axis = dayWindow(day, shifts);
  const span = axis.to - axis.from;
  const height = (span / 60) * PX_PER_HOUR;
  const top = (m) => ((m - axis.from) / span) * 100;
  const tall = (from, to) => Math.max(((to - from) / span) * 100, (MIN_BLOCK_PX / height) * 100);

  const hours = [];
  for (let m = axis.from; m <= axis.to; m += 60) hours.push(m);

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{spoken(day, shifts, rests)}</figcaption>
      <div
        aria-hidden="true"
        className="relative ml-11 border-l border-border"
        style={{ height: `${height}px` }}
      >
        {hours.map((m) => (
          <div
            key={m}
            className="absolute inset-x-0 border-t border-border/70"
            style={{ top: `${top(m)}%` }}
          >
            <span className="absolute -left-11 -top-2 w-10 text-right font-mono text-[10px] leading-4 text-faint">
              {hhmm(m)}
            </span>
          </div>
        ))}

        {/* WORKED TIME. No service or client name on it: the day rows carry
            punches and breaks and nothing that names what the shift was for, so
            labelling these "ILS Service" would be inventing it. */}
        {shifts.map((s) => (
          <div
            key={`w-${s.from}`}
            className="absolute left-0 right-1 rounded-r-sm border-l-[3px] border-brand bg-brand/10 px-1.5 py-0.5"
            style={{ top: `${top(s.from)}%`, height: `${tall(s.from, s.to)}%` }}
          >
            <span className="font-mono text-[10px] leading-3 text-muted">
              {hhmm(s.from)}&ndash;{hhmm(s.to)}
            </span>
          </div>
        ))}

        {/* THE GAPS BETWEEN SHIFTS. Unscheduled time unless it is meal length,
            in which case the punch-out IS the meal. Never a rest period - see
            the note above. */}
        {gapsOf(day, shifts).map((g) => (
          <div
            key={`g-${g.from}`}
            className={`absolute left-1.5 right-2 flex items-center overflow-hidden rounded-sm px-1.5 ${
              g.meal
                ? "text-[#12243a]"
                : "border border-dashed border-border-strong text-faint"
            }`}
            style={{
              top: `${top(g.from)}%`,
              height: `${tall(g.from, g.to)}%`,
              background: g.meal ? MEAL : "transparent",
            }}
          >
            <span className="truncate text-[10px] font-semibold leading-3">
              {g.meal ? "Meal" : "Not scheduled"}{" "}
              <span className="font-mono font-normal opacity-80">{hhmm(g.from)}</span>
            </span>
          </div>
        ))}

        {/* A REST PERIOD ONLY WHERE ONE IS ACTUALLY ON RECORD for this person -
            the times the engine matched to their own name, plus anything they
            corrected. A day the report holds nothing for draws no rest at all,
            which is the honest picture beside a question asking whether they
            took one. */}
        {rests.map((r) => (
          <div
            key={`r-${r.min}`}
            className="absolute left-1.5 right-2 flex items-center overflow-hidden rounded-sm px-1.5 text-[#2b2410]"
            style={{
              top: `${top(r.min)}%`,
              height: `${tall(r.min, r.min + 10)}%`,
              background: REST,
            }}
          >
            <span className="truncate text-[10px] font-semibold leading-3">
              Rest <span className="font-mono font-normal opacity-80">{hhmm(r.min)}</span>
              {r.corrected ? " (you corrected this)" : ""}
            </span>
          </div>
        ))}
      </div>
    </figure>
  );
}
