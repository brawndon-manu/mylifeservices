// What stands behind each premium hour.
//
// Every premium in a batch lands in exactly one bucket, and the buckets are
// grouped by the KIND of evidence behind them, not by how bad they look:
//
//   witnessed  a source document says so outright
//   ruled      no document says it, a person decided it
//   open       the documents support two readings equally
//   cleared    answered, and no longer owed
//
// The distinction between "witnessed" and "ruled" is the point of the whole
// file. 125 of these hours are owed because Mánu ruled that silence in the Rest
// Periods Report means no break was taken. That is a defensible reading and it
// is not the same thing as a document saying so, and anyone reading this later
// deserves to be told which one they are looking at.
//
// Reads stored days only. Nothing is re-derived, so this says what the engine
// actually did rather than what it would do if it ran again.

export const WAIVER_MAX_HOURS = 6;

// gap bands, matching RULES.mealMinMin / mealMaxMin in parse.js
const MEAL_GAP_MIN = 21;
const MEAL_GAP_MAX = 90;

// punches stay in DOCUMENT order. that is what pairs an out with its in, and
// sorting them by time invents gaps on days where two bookings overlap.
export function longestGapMin(punches) {
  const p = (punches || []).map((x) => x.min);
  let max = 0;
  for (let i = 1; i + 1 < p.length; i += 2) max = Math.max(max, p[i + 1] - p[i]);
  return max;
}

const DEFS = [
  { code: "M1", kind: "meal", group: "witnessed",
    label: "Rostered and punched, but started after the fifth hour" },
  { code: "M2", kind: "meal", group: "witnessed",
    label: "Over 6 hours, no meal rostered, nothing meal-shaped punched" },
  { code: "R1", kind: "rest", group: "witnessed",
    label: "The Rest Periods Report covers them and shows a shortfall" },
  { code: "R2", kind: "rest", group: "ruled",
    label: "The Rest Periods Report never mentions this person",
    note: "Settled: no record means none taken. Entitlement already follows hours worked, so short days are charged nothing." },
  { code: "M3", kind: "meal", group: "open",
    label: "Over 6 hours, no meal rostered, but a 21 to 90 minute gap was punched",
    note: "Does the roster show every break that happens? If people take unrostered lunches, these are not owed." },
  { code: "M4", kind: "meal", group: "open",
    label: "Over 6 hours, no meal rostered, but a gap over 90 minutes was punched",
    note: "Usually two client bookings with a hole between them. Split shift or unrostered lunch, and only the roster can say." },
  { code: "M5", kind: "meal", group: "cleared",
    label: "The day was 6 hours or less and a signed waiver covers it",
    note: "Waivers are on paper today and move into the portal later, so every current member of staff is treated as having signed one." },
];

// which meal bucket a day belongs to. one day, one answer.
function mealBucket(d) {
  if (d.mealWaived) return "M5";
  if (!d.mealViolation) return null;
  if (d.mealLate) return "M1";
  if (d.mealGapMin != null) return "M3";
  return longestGapMin(d.punches) > MEAL_GAP_MAX ? "M4" : "M2";
}

export function premiumEvidence(sheets) {
  const buckets = DEFS.map((d) => ({ ...d, days: 0, people: new Set() }));
  const by = Object.fromEntries(buckets.map((b) => [b.code, b]));
  const neverPunched = [];

  for (const t of sheets || []) {
    const name = t.sourceName;
    const days = t.data?.days || [];

    for (const d of days) {
      const m = mealBucket(d);
      if (m) { by[m].days++; by[m].people.add(name); }
      if (d.restViolation) {
        const code = d.restSource === "none" ? "R2" : "R1";
        by[code].days++; by[code].people.add(name);
      }
    }

    // a whole period with no break punched on any day, on somebody who had days
    // that owed one. NOT a wage question - the premium is charged either way -
    // but a configuration problem should not hide inside a wage figure.
    if (days.length) {
      const punchedBreaks = days.reduce((n, d) => n + (d.punches.length / 2 - 1), 0);
      const owed = days.filter((d) => d.restRequired > 0).length;
      if (punchedBreaks === 0 && owed > 0) {
        neverPunched.push({ name, days: days.length, owed, timesheetId: t.id ?? null });
      }
    }
  }

  const sum = (group) => buckets.filter((b) => b.group === group).reduce((n, b) => n + b.days, 0);
  const cleared = sum("cleared");
  const witnessed = sum("witnessed");
  const ruled = sum("ruled");
  const open = sum("open");

  neverPunched.sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));

  return {
    buckets: buckets.map((b) => ({ ...b, people: b.people.size })),
    neverPunched,
    totals: {
      // one premium hour per violation, so a day count IS an hour figure
      owed: witnessed + ruled + open,
      witnessed, ruled, open, cleared,
      settled: witnessed + ruled,
      gross: witnessed + ruled + open + cleared,
    },
  };
}
