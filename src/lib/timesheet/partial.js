// UPLOADING A PAY PERIOD THAT HAS NOT ENDED YET.
//
// QSP prints SCHEDULED shifts exactly like worked ones, with punch times on
// them, so an export pulled mid-period is part record and part forecast and
// nothing in the file says which is which. Generating timesheets from that asks
// people to sign for shifts they have not worked - one real pull on the 3rd had
// 454 of 510 day-cases in the future - so the upload refuses the whole file.
//
// That refusal is right for payroll and wrong for testing an August period while
// August is still running. Mánu 2026-08-11: "im testing partial weeks for august
// so I want to be able to add a testing partial pay period option that allows me
// to have it in... we'd only use the days from the time sheet because those are
// the only ones that have been recorded so far."
//
// THE RANGE HAS TO BE TYPED, BECAUSE QSP IGNORES THE ONE YOU ASK IT FOR. Mánu
// 2026-08-12: "on QSP, I put August first to August ninth, and it still spit out
// everything else." The export snaps to whole pay periods, so the range that
// came back is not the range that was requested and the file cannot be trusted
// to describe its own extent. So the window is given here instead of inferred.
//
// ONE DEFINITION OF "FUTURE", USED TWICE. The guard that refuses and the trim
// that keeps are the same comparison from the same function. Written separately
// they would drift, and the failure would be silent in the worst direction: a
// day the guard called safe but the trim threw away is a day of real work that
// vanishes out of somebody's pay.

// "07/16/26" -> Date at midnight local, or null. 20xx because that is what QSP
// prints and this tool did not exist in 1926.
export function sheetDate(mmddyy) {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(mmddyy || "");
  if (!m) return null;
  return new Date(2000 + +m[3], +m[1] - 1, +m[2]);
}

// "2026-08-09" -> Date at midnight local, or null. What <input type="date">
// submits. Built field by field rather than through `new Date(str)`, which reads
// a bare ISO date as UTC and lands on the previous evening anywhere west of
// Greenwich - which is to say, here.
export function isoDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || "");
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

export function endOfDay(now = new Date()) {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

// Every date in these sheets that has not happened yet. Unparseable dates are
// left alone rather than guessed at - they are somebody else's bug and dropping
// a day over one would be worse than keeping it.
export function futureDates(sheets, now = new Date()) {
  const cutoff = endOfDay(now);
  const out = new Set();
  for (const s of sheets || []) {
    for (const d of s.days || []) {
      const at = sheetDate(d.date);
      if (at && at > cutoff) out.add(d.date);
    }
  }
  return out;
}

// Keep the days inside the window, drop the rest, and say what went.
//
// `from` and `to` are optional Dates - typically what the operator typed. The
// end of the window is ALWAYS clamped to today no matter what was asked for:
// letting a typed date reach past today would quietly re-admit the scheduled
// shifts this whole check exists to keep out, and a timesheet must never hold a
// day nobody has worked. `clamped` says when that happened so the screen can
// tell them rather than silently giving them a narrower window than they asked
// for.
//
// Sheets come back with `days` replaced and nothing else touched - every total,
// the overtime and the weekly boundaries are recomputed downstream by
// `analyzeTimesheet` from whatever days survive, so trimming here cannot leave a
// figure that disagrees with the days beneath it.
//
// A sheet left with NO days is dropped entirely: it belongs to somebody who
// worked nothing inside the window, and an empty timesheet asking for a
// signature is the thing this whole check exists to prevent.
export function trimDays(sheets, { now = new Date(), from = null, to = null } = {}) {
  const today = endOfDay(now);
  const wanted = to ? endOfDay(to) : null;
  const clamped = !!wanted && wanted > today;
  const end = wanted && !clamped ? wanted : today;
  const start = from || null;

  const dropped = new Set();
  const kept = [];
  let first = null;
  let last = null;

  for (const s of sheets || []) {
    const days = [];
    for (const d of s.days || []) {
      const at = sheetDate(d.date);
      if (at && (at > end || (start && at < start))) {
        dropped.add(d.date);
        continue;
      }
      days.push(d);
      if (at) {
        if (!first || at < first.at) first = { at, date: d.date };
        if (!last || at > last.at) last = { at, date: d.date };
      }
    }
    if (days.length) kept.push({ ...s, days });
    else dropped.add(`${s.employee || "?"} (no days in range)`);
  }

  return {
    sheets: kept,
    // the dates themselves, sorted, so the screen can name them rather than
    // report a count somebody then has to go and reconcile by hand
    dropped: [...dropped].sort(),
    droppedPeople: (sheets || []).length - kept.length,
    // the first and last day that actually survived. `periodFrom`/`periodTo`
    // still say what QSP printed, because that is what the document says and
    // rewriting it would be a lie about the source.
    from: first?.date || null,
    through: last?.date || null,
    // true when the end they typed was in the future and got pulled back
    clamped,
  };
}
