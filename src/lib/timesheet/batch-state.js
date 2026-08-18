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
    // THE WORD LIVE MOVED, THE KEY DID NOT. Mánu 2026-08-17: this state means
    // the export has not reached the end of the fortnight, which is nothing to
    // do with anything being live - and LIVE is wanted for the state that
    // matters to him, which is timesheets out for signature. So the label says
    // what it always meant and the word went to `signatureState` below.
    //
    // The KEY stays `live` deliberately. `canSendAll` is
    // `batchState(...).key === "final"`, and five other places branch on this
    // key including the panel that explains why Send all is blocked. Renaming
    // it to match a label is how a guard on sixty outgoing timesheets gets
    // broken by a cosmetic change.
    label: "STILL COMING IN",
    pill: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300",
    edge: "border-l-rose-500",
    dot: "bg-rose-600",
    // AND IT STOPPED BLINKING. The pulse is now the signature badge's alone -
    // that is the whole point of a blinking light, and two of them meaning
    // different things is how both stop being read.
    pulses: false,
  },
  "needs-decision": {
    key: "needs-decision",
    label: "NEEDS A DECISION",
    pill: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-300",
    edge: "border-l-amber-500",
    dot: "bg-amber-500",
    pulses: false,
  },
  superseded: {
    key: "superseded",
    label: "SUPERSEDED",
    // grey and mute. This is history: a later export of the same fortnight
    // exists and is the one being worked. Three batches all pulsing LIVE said
    // three periods were in progress when there is only ever one.
    pill: "border-border-strong bg-surface-2 text-faint",
    edge: "border-l-border-strong",
    dot: "bg-slate-400",
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
export function batchState(batch, { newerInPeriod = false } = {}) {
  const reach = batchReach(batch);
  let end = asDate(batch?.periodTo);
  // THE DAY PROGRAM'S TARGET IS THE LAST WEEKDAY OF THE PERIOD. Their export
  // ends when their week does - 08/15/26 is a Saturday nobody works - so the
  // MLS rule would read STILL COMING IN forever and hold Send all hostage for
  // a day that cannot arrive. Weekday means Mon-Fri here; a batch whose
  // program column was not selected reads undefined, stays on the MLS rule,
  // and errs toward refusing to send - the safe direction.
  if (batch?.program === "DP" && end) {
    while (end.getDay() === 0 || end.getDay() === 6) end = new Date(end - DAY);
  }
  const at = asDate(reach);
  const covered = !!(end && at && at >= end);
  // SUPERSEDED BEATS EVERYTHING. Only one upload of a fortnight is the one being
  // worked, and it is the newest. The three August batches all read LIVE, which
  // said three periods were in progress and put a blinking light on two exports
  // nobody will ever open again.
  const key = newerInPeriod
    ? "superseded"
    : batch?.lockedAt ? "final" : covered ? "needs-decision" : "live";
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

// IS THIS PERIOD OUT FOR SIGNATURE RIGHT NOW?
//
// A SECOND AXIS, AND THAT IS THE WHOLE FIX. `batchState` answers "how far has
// the data got and may it be sent". This answers "has it gone, and is it coming
// back". They are independent - a superseded upload can be locked, a locked one
// may not have been sent - and squeezing both into one pill is why the badge
// read wrong. Mánu 2026-08-17.
//
// COUNTED AGAINST SENT, NOT AGAINST THE BATCH, his call. "0 of 3 signed"
// describes the people actually asked; on a batch where 3 of 59 have gone out,
// "0 of 59" would describe a question nobody has been asked yet. Once the whole
// period goes out the two are the same number anyway.
export function signatureState(sent = 0, signed = 0) {
  const out = Math.max(0, Number(sent) || 0);
  // a signature on a sheet that is somehow not marked sent still counts as
  // returned, but it can never make the fraction read more than all of them
  const back = Math.min(out, Math.max(0, Number(signed) || 0));
  // NOT SENT IS NOT A STATE, IT IS THE ABSENCE OF ONE. Nothing has been asked,
  // so there is nothing to report and no badge at all - which is also what
  // every screen looked like before today, when 0 of 12 batches had ever sent.
  if (out === 0) return null;
  const all = back === out;
  return {
    key: all ? "all-signed" : "awaiting",
    label: all ? "ALL SIGNED" : "LIVE",
    detail: `${back} of ${out} signed`,
    sent: out,
    signed: back,
    // ONLY THIS BLINKS, ANYWHERE. And only while something is still owed - a
    // period everybody has signed is finished, and a light still flashing over
    // it would be the exact fault the old comment warned about.
    pulses: !all,
    pill: all
      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300"
      : "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300",
    dot: all ? "bg-emerald-600" : "bg-rose-600",
  };
}

// WHICH UPLOAD OF THE FORTNIGHT THIS IS. The other half of the split: purely
// about supersession, with no opinion on where the period has got to.
export function versionState(newerInPeriod = false) {
  return newerInPeriod
    ? {
      key: "superseded",
      label: "SUPERSEDED",
      pill: "border-border-strong bg-surface-2 text-faint",
    }
    : {
      key: "current",
      label: "MOST RECENT VERSION",
      pill: "border-border-strong bg-surface-2 text-muted",
    };
}

// Only a period somebody has attested may be sent. The precondition is not
// enough on its own: the data reaching the 15th does not mean the schedule
// stopped moving, and that is the whole reason the question exists.
export function canSendAll(batch, opts) {
  return batchState(batch, opts).key === "final";
}

// which batch of each period is the one being worked. Given every batch, the
// ids of the ones that have a newer sibling - so a caller can hand
// `newerInPeriod` in without asking the database a second question per row.
export function supersededIds(batches = []) {
  const newest = new Map();
  for (const b of batches) {
    const k = `${b.periodFrom}..${b.periodTo}`;
    const prev = newest.get(k);
    if (!prev || new Date(b.createdAt) > new Date(prev.createdAt)) newest.set(k, b);
  }
  const keep = new Set([...newest.values()].map((b) => b.id));
  return new Set(batches.filter((b) => !keep.has(b.id)).map((b) => b.id));
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

// ONE CARD PER PAY PERIOD, NEWEST FIRST.
//
// Four uploads of one fortnight were four rows that all looked equally current,
// and only one of them is. The period is the thing being worked; the uploads are
// versions of it. So they fold: the newest is the card and the rest are reachable
// underneath it.
//
// Grouped on the printed period rather than on the start day alone, because
// 08/01-08/15 and a hypothetical 08/01-08/31 are not the same fortnight even
// though they open on the same date.
export function groupByPeriod(batches = []) {
  const groups = new Map();
  for (const b of batches) {
    // THE PROGRAM IS PART OF THE KEY. Both payrolls run the same fortnights,
    // and without this the day program's 08/01-08/15 would fold under the MLS
    // card and flip the live 60-sheet batch to SUPERSEDED. A batch selected
    // without `program` keys as MLS, which is what every batch was before the
    // column existed.
    const k = `${b.periodFrom}..${b.periodTo}..${b.program || "MLS"}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(b);
  }
  return [...groups.entries()]
    .map(([key, rows]) => {
      const sorted = [...rows].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return {
        key,
        periodFrom: sorted[0].periodFrom,
        periodTo: sorted[0].periodTo,
        // the one being worked. Everything else is history that still opens.
        current: sorted[0],
        earlier: sorted.slice(1),
        uploads: sorted.length,
      };
    })
    // newest period first, by its newest upload
    .sort((a, b) => new Date(b.current.createdAt) - new Date(a.current.createdAt));
}
