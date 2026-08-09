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

export async function renderSheet(ts) {
  const d = ts.data || {};
  const days = d.days || [];
  if (!days.length) return null;

  return renderCorrected(
    {
      employee: ts.sourceName,
      payPeriod: d.payPeriod || { from: ts.batch?.periodFrom, to: ts.batch?.periodTo },
      days,
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
      premiums: d.premiums,
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
