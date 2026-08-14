// IS THIS PERIOD STILL COMING IN, OR IS IT DONE?
//
// Three states, and the two transitions between them are different in kind.
// The first the portal works out for itself; the second it cannot know and has
// to ask.
//
//   live            the data has not reached the end of the period yet. Derived:
//                   QSP prints "Pay Period: 08/01/26 to 08/15/26" on the
//                   timesheet and the last day in the export is 08/12, so three
//                   days are still to come.
//   needs-decision  the data reaches the last day, and nobody has said the
//                   schedule is locked. The schedule locks around 8pm on the
//                   final day and NOTHING IN ANY OF THE FOUR EXPORTS RECORDS IT,
//                   so this is where the portal stops deriving and asks.
//   final           somebody attested it. Only now can a period be sent.
//
// Deliberately NOT time-of-day aware. An upload at 7:45pm and one at 8:15pm are
// identical from here and only one of them is safe, so the hour is never
// guessed at.
import { batchReach } from "./mark-key.js";

const asDate = (s) => {
  const [m, d, y] = String(s || "").split("/").map(Number);
  return m && d && y ? new Date(2000 + y, m - 1, d) : null;
};

const DAY = 86400000;

export const BATCH_STATES = {
  live: {
    key: "live",
    label: "LIVE",
    // rose, and the dot pulses. The only state that blinks - a light that never
    // stops meaning something stops being read.
    pill: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300",
    edge: "border-l-rose-500",
    dot: "bg-rose-600",
    pulses: true,
  },
  "needs-decision": {
    key: "needs-decision",
    label: "NEEDS A DECISION",
    pill: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-300",
    edge: "border-l-amber-500",
    dot: "bg-amber-500",
    pulses: false,
  },
  final: {
    key: "final",
    label: "FINAL",
    pill: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300",
    edge: "border-l-emerald-600",
    dot: "bg-emerald-600",
    pulses: false,
  },
};

// `batch` needs periodFrom/periodTo/lockedAt, and either `timesheets` with their
// days or `restsByDate`, so the reach can be read. Given neither, reach is null
// and the period is treated as still coming in - the safe direction, because it
// is the one that refuses to send.
export function batchState(batch) {
  const reach = batchReach(batch);
  const end = asDate(batch?.periodTo);
  const at = asDate(reach);
  const covered = !!(end && at && at >= end);
  const key = batch?.lockedAt ? "final" : covered ? "needs-decision" : "live";
  return {
    ...BATCH_STATES[key],
    reach,
    covered,
    // how many days of the period are not in the export yet. Null when either
    // date is unreadable, rather than 0 - "none missing" and "cannot tell" are
    // different answers and only one of them should let a send through.
    daysToCome: end && at ? Math.max(0, Math.round((end - at) / DAY)) : null,
    lockedAt: batch?.lockedAt ?? null,
    lockedByName: batch?.lockedByName ?? null,
  };
}

// Only a period somebody has attested may be sent. The precondition is not
// enough on its own: the data reaching the 15th does not mean the schedule
// stopped moving, and that is the whole reason the question exists.
export function canSendAll(batch) {
  return batchState(batch).key === "final";
}

// Every day of the period, and whether the export covers it. Drives the strip
// under the header, which is what makes "3 days still to come" checkable rather
// than a number to trust.
export function periodDays(batch) {
  const from = asDate(batch?.periodFrom), to = asDate(batch?.periodTo);
  const at = asDate(batchReach(batch));
  if (!from || !to) return [];
  const out = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY) {
    const d = new Date(t);
    out.push({
      date: d,
      day: d.getDate(),
      weekend: d.getDay() === 0 || d.getDay() === 6,
      covered: !!at && d <= at,
    });
  }
  return out;
}
