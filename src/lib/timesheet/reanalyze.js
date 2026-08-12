// RE-RUNNING THE ENGINE OVER A BATCH THAT IS ALREADY STORED.
//
// Until now `rebuildSheetFor` never called `analyzeDay` again, so every rule
// that landed after an upload reached exactly nothing. Two entitlement rules
// went in on 2026-08-12 and moved 148 premium hours to 106 in a scratch script,
// and not one figure on any screen. This is the file that closes that gap, and
// it is the step toward what Mánu actually wants: a sheet that takes a fresh
// export and corrects itself from whatever people fixed in QSP.
//
// THE WHOLE PROBLEM IS THE DROPPED INPUTS. `stored.js` keeps the ANSWERS
// `analyzeDay` produced and throws away the raw material it read, on purpose, so
// a stored day is a projection rather than a recording. Re-running therefore
// means rebuilding that raw material first. There are six, not one:
//
//   scheduleBlocks       <- scheduleCheck.byDate[date].shifts, which kept `text`
//                           and `meal`, which is all `scheduleBlocks()` reads
//   restTimes            <- the batch's own restsByDate rows
//   restsAlreadyPaid     <- true since 2026-08-06, set at upload
//   restSourceAvailable  <- whether a rest report was collected at all
//   mealWaiverOnFile     <- never stored; the RULES default applies, as at upload
//   restsOffClockConfirmed / miscWorked <- answer state, carried on the day
//
// MISS TWO OF THEM AND IT LOOKS LIKE IT WORKED. Rebuilding only
// `scheduleBlocks` - which is what the 08-12 handoff said was the only one -
// inflated `paidHours` on 84 of 658 July days, because without
// `restsAlreadyPaid` the engine adds rest minutes back into the day and pays
// them twice. It read as ten days mysteriously gaining a violation. With all six
// restored, `paidHours` matches stored on all 658, and what moves is the rules
// moving.
//
// So `paidHours` is the canary and the caller is told when it drifts. A
// re-analysis that changes what somebody is PAID is not a rule taking effect, it
// is a reconstruction that went wrong.
import { analyzeDay } from "./parse.js";
import { scheduleBlocks } from "./schedule.js";

// the raw inputs, injected for the re-run and taken straight back off. Left on,
// they would ride `...day` into the stored projection and quietly make the
// stored day twice the size it should be, carrying the very fields `stored.js`
// drops deliberately.
const INJECTED = [
  "scheduleBlocks",
  "restTimes",
  "restsAlreadyPaid",
  "restSourceAvailable",
];

function withoutInjected(day) {
  const out = { ...day };
  for (const k of INJECTED) delete out[k];
  return out;
}

// Re-run `analyzeDay` over stored days.
//
// `scheduleByDate` is `data.scheduleCheck.byDate`. `restTimesFor(date)` hands
// back this person's rest windows for a day, built by the caller because the
// helpers that read them live in `rests.js`, which pulls the xls stack in.
//
// A DAY WE CANNOT REBUILD IS LEFT EXACTLY AS IT WAS. No schedule shifts means no
// `scheduleBlocks`, and re-analysing without them would silently go back to
// judging the whole day as one lump - charging breaks the two new rules say are
// not owed. Keeping the stored answer is the honest outcome, and `skipped` says
// how often it happened rather than letting it pass unremarked.
export function reanalyzeDays(days, {
  scheduleByDate = null,
  restTimesFor = () => null,
  restSourceAvailable = false,
  overrides = null,
} = {}) {
  const out = [];
  const moved = [];
  let skipped = 0;
  let paidDrift = 0;

  for (const d of days || []) {
    const shifts = scheduleByDate?.[d.date]?.shifts;
    if (!shifts?.length) {
      skipped++;
      out.push(d);
      continue;
    }
    // an answer already given about the Misc time on this day. `analyzeDay`
    // reads `miscWorked` at the top, so a re-analysis that ignored it would
    // recompute the entitlement straight back over somebody's answer - the same
    // shape of bug as Dinley 08/07, where `reentitle` undid what she had said.
    const answered = overrides?.[d.date] || {};
    const before = analyzeDayInput(d, {
      shifts,
      restTimes: restTimesFor(d.date),
      restSourceAvailable,
      miscWorked: answered.miscWorked === true || d.miscWorked === true,
    });
    const after = withoutInjected(analyzeDay(before));

    // THE CANARY. Paid hours come from the punches and the printed floor, and
    // neither of those changed, so a re-analysis must not move them. If it does,
    // an input was not rebuilt properly and every figure downstream is suspect.
    if (Math.abs((after.paidHours || 0) - (d.paidHours || 0)) > 0.005) {
      paidDrift++;
      moved.push({
        date: d.date,
        field: "paidHours",
        was: d.paidHours,
        now: after.paidHours,
        suspect: true,
      });
    }
    // what the rules moved, which is the point of running at all. Reported so a
    // re-analysis that changes what somebody is charged can be seen rather than
    // happening quietly.
    for (const f of ["restRequired", "mealRequired", "restViolation", "mealViolation"]) {
      if ((d[f] ?? null) !== (after[f] ?? null)) {
        moved.push({ date: d.date, field: f, was: d[f] ?? null, now: after[f] ?? null });
      }
    }
    out.push(after);
  }

  return { days: out, moved, skipped, paidDrift };
}

// the day handed to `analyzeDay`, with the dropped inputs put back. Split out so
// the list of what gets rebuilt is readable in one place and the test can assert
// against it.
function analyzeDayInput(d, { shifts, restTimes, restSourceAvailable, miscWorked }) {
  return {
    ...d,
    scheduleBlocks: scheduleBlocks(shifts),
    restTimes,
    // QSP stopped deducting rest breaks on 2026-08-06 - they sit inside the work
    // segments already. Without this the engine adds them back and pays them
    // twice, which is the 84-day drift described at the top.
    restsAlreadyPaid: true,
    restSourceAvailable,
    miscWorked,
  };
}

// The rest windows for one sheet, keyed by date, built the way the upload path
// builds them. Kept here beside the re-analysis it feeds so the two cannot drift,
// but taking its helpers as arguments so this module stays free of the xls stack.
//
// `rows` should already be narrowed to ONE person. Narrowing on the rest
// report's own spelling of their name is the caller's job, and it matters: the
// report files Delgado Pineda, Ruth under "Delgado Pineda, Angel", and a filter
// on the timesheet's spelling comes back empty and silently rebuilds her with no
// rests at all.
export function restWindowsByDate(rows, { restRowTimes, clockMin, serviceFit }) {
  const byDate = new Map();
  for (const row of rows || []) {
    if (!row?.counted || !row?.date) continue;
    const t = restRowTimes(row);
    const out = clockMin(t.from);
    const inn = clockMin(t.to);
    // a window nobody can place is worse than no window: `restsOutsideShift`
    // reads absence as "not outside", and a wrong pair of minutes as fact.
    if (out == null || inn == null) continue;
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push({ out, in: inn, fit: serviceFit(row) });
  }
  return byDate;
}
