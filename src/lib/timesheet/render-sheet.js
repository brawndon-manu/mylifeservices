// Render one corrected timesheet from what the database already holds.
//
// The unsigned sheet is a pure function of `data.days` plus the two source
// reports, so storing it was storing something we can always recreate. It cost
// 59 blob writes per batch and another 59 on every recompute, each one leaving
// the previous copy orphaned - which is how a 1 GB store filled to 788 MB and
// how the monthly write allowance ran out mid-rebuild.
//
// A SIGNED copy is different and is still stored: it carries somebody's actual
// signature and cannot be regenerated from anything.
//
// The other half of the point: a change to the renderer now reaches every
// unsigned sheet at once. Landing the landscape layout previously meant
// rebuilding all 59 documents; now it means deploying.

import { renderCorrected } from "./render.js";
import { addedOvertimeHours } from "./parse.js";
import { applyAssumptions, premiumsFromDays } from "./premium-split.js";

// THE THREE DOCUMENTS, and they are one renderer over three sets of day rows.
//
// Mánu 2026-08-09: he wants to hold them side by side for the same person.
//
// THE NAMES MOVED ON 2026-08-11 BECAUSE THE DEFAULT MOVED. `projected` used to
// mean the small figure - the engine's proposal after assuming breaks were
// taken - and `ignoring` meant the big one. The flip makes the big one the
// default and the thing payroll pays, and "projected" is Mánu's word for it. So
// the old `ignoring` IS the new `projected`, and the old `projected` is now
// `assumed`. Renaming rather than quietly swapping the meanings: a stored basis
// string that still said "projected" while meaning the opposite is the sort of
// thing that prints the wrong figure above somebody's signature.
//
//   projected   every fault the reports show, with its penalty. THE DEFAULT,
//               the copy that is emailed and signed, and what payroll pays.
//   assumed     every policy assumption applied - breaks assumed taken, minutes
//               assumed mis-tapped. Blind to the answers on purpose: it is the
//               engine's alternative reading, and comparing it to what came back
//               is the entire point of having it.
//   corrected   the same, WITH the answers folded in. An assumption somebody has
//               settled by telling us they missed the break is NOT applied here,
//               so the gap between the two is the work the batch has done.
//
// Only `projected` may be served from a stored blob. The other two are opinions
// about an open question and have to be built from what is true right now.
export const BASES = ["projected", "assumed", "corrected"];

// Everything a render needs, so every caller selects the same fields and none
// of them quietly omits one and produces a subtly different document.
export const RENDER_SELECT = {
  id: true,
  sourceName: true,
  data: true,
  batch: {
    select: { periodFrom: true, periodTo: true, restsByDate: true },
  },
};

// Sum the stored day rows rather than trusting the sheet's own columns.
//
// Those two disagreed by 0.01 on 11 of 59 sheets: the stored total came from
// summing unrounded days and rounding once, while the sheet PRINTS rounded
// dailies, so the Totals row did not equal the column above it. The printed
// document has to add up.
const sum = (days, k) => Math.round(days.reduce((n, d) => n + (d[k] || 0), 0) * 100) / 100;

export async function renderSheet(ts, { basis = "projected", confirmed, answers, pastDue } = {}) {
  const d = ts.data || {};
  const stored = d.days || [];
  if (!stored.length) return null;

  // The assumed copy is the engine's own alternative reading, so it is
  // deliberately blind to `confirmed`: an answer belongs to the corrected copy.
  // `projected` is the stored days untouched, which is the whole point of it.
  const days =
    basis === "assumed"
      ? applyAssumptions(stored, { pastDue: false })
      : basis === "corrected"
        ? applyAssumptions(stored, { confirmed, answers, pastDue })
        : stored;

  return renderCorrected(
    {
      employee: ts.sourceName,
      payPeriod: d.payPeriod || { from: ts.batch?.periodFrom, to: ts.batch?.periodTo },
      days,
      basis,
      totals: {
        rawHours: sum(days, "rawHours"),
        paidHours: sum(days, "paidHours"),
        regularHours: sum(days, "regularHours"),
        otHours: sum(days, "otHours"),
        doubleHours: sum(days, "doubleHours"),
        // WITHOUT THESE THE "ADDED" PARAGRAPH NEVER PRINTS, and every affected
        // day carries "+0.17 added" with nothing on the page saying what it
        // means. This is the render an employee actually opens - the sheet is
        // built here, on demand, not at upload - so leaving them out meant the
        // explanation existed only in a test.
        addedHours: sum(days, "addedHours"),
        addedOtHours: addedOvertimeHours(days, d.payPeriod || null),
      },
      // RECOUNTED FROM THE ROWS THIS DOCUMENT ACTUALLY DRAWS, never carried
      // over from the stored object. `d.premiums` is the every-fault table by
      // construction, which is exactly the projected document - so it is reused
      // there and rebuilt everywhere else. Reusing it on an assumed render would
      // print Aranda's nine meal days above a page that charges two of them.
      premiums: basis === "projected" ? d.premiums : premiumsFromDays(days),
      comments: d.comments || null,
      punchCorrections: d.punchCorrections || null,
      // the Breaks column: what the two reports RECORDED, never derived from
      // the punches
      restsByDate: ts.batch?.restsByDate || [],
      scheduleByDate: d.scheduleCheck?.byDate || null,
    },
    {
      printedBy: ts.sourceName,
      // STORED, not recomputed. Rendering on demand with `new Date()` would put
      // today's date on a document generated weeks ago, so the same sheet would
      // differ every time somebody opened it.
      generatedOn: d.generatedOn || "",
    },
  );
}
