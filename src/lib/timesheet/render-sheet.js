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
import { restNameFor } from "./rests.js";
import { addedOvertimeHours } from "./parse.js";
import { applyAssumptions, premiumsFromDays } from "./premium-split.js";
import { formatBreakComments } from "./break-answers.js";
import { sheetDisplayName } from "./display-name.js";

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
//   corrected   the same, WITH the answers folded in. An assumption somebody has
//               settled by telling us they missed the break is NOT applied here,
//               so the gap between the two is the work the batch has done.
//
// `assumed` WAS A THIRD ONE AND IS GONE, removed 2026-08-12. It rendered every
// policy assumption applied and blind to the answers, and it earned its place
// while the engine actually APPLIED one: an off-clock ten was paid on sight, so
// there was a real reading where the assumptions held and a reading where they
// did not, and holding the two side by side was the point.
//
// The same day's reversal - "only add the time once they confirm it was taken
// there" - means the engine assumes nothing on its own, so that render had
// become the projected one with a different name and a different filename. Two
// names for one document above somebody's signature is exactly what the
// renaming note above this exists to prevent.
//
// NOT the same thing as `premiumStanding().ifAssumptionsHold`, which is alive
// and still means something: what the premium total WOULD come to if every open
// question came back confirmed. That is a figure about unanswered questions, not
// a document that pretends they were.
//
// Only `projected` may be served from a stored blob. `corrected` is an opinion
// about an open question and has to be built from what is true right now.
export const BASES = ["projected", "corrected"];

// Everything a render needs, so every caller selects the same fields and none
// of them quietly omits one and produces a subtly different document.
export const RENDER_SELECT = {
  id: true,
  sourceName: true,
  data: true,
  // THE BREAK REASONS ARE KEYED ON IT, and leaving it out cost every one of
  // them. `loadBreakReasons` opens `if (!ts?.userId ... ) return []`, so a
  // select without this column returns NO reasons and no error - the sheet
  // prints a short Comments block that is indistinguishable from a person who
  // was never asked anything. All four render routes had it missing, so no
  // reason has ever reached a real sheet: Mánu typed eleven through his own
  // review page on 2026-08-17 and none of them appeared. Found by rendering
  // the live route beside a probe that fetched the rows directly.
  userId: true,
  // the display name reads the account and the batch's rehearsal flag. Left out
  // of this select they arrive undefined and the sheet silently falls back to
  // `sourceName` - the same class of failure as `restsUrl`, showing up as a
  // recording with the wrong name on it rather than as an error.
  user: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
  batch: {
    select: { periodFrom: true, periodTo: true, restsByDate: true, testOnly: true },
  },
};

// Sum the stored day rows rather than trusting the sheet's own columns.
//
// Those two disagreed by 0.01 on 11 of 59 sheets: the stored total came from
// summing unrounded days and rounding once, while the sheet PRINTS rounded
// dailies, so the Totals row did not equal the column above it. The printed
// document has to add up.
const sum = (days, k) => Math.round(days.reduce((n, d) => n + (d[k] || 0), 0) * 100) / 100;

export async function renderSheet(ts, {
  basis: asked = "projected", confirmed, answers, pastDue,
  // why a break was not taken, the one thing no QSP export carries. Passed in
  // rather than fetched: this file is a pure function of what the database
  // already holds and it stays that way.
  breakReasons = [],
} = {}) {
  const d = ts.data || {};
  const stored = d.days || [];
  if (!stored.length) return null;

  // AN UNKNOWN BASIS BECOMES THE DEFAULT, and it has to be normalised HERE
  // rather than only at the route. `basis` is passed on to `renderCorrected`,
  // which prints the banner from the string - so when `assumed` was removed
  // below without this, a stale `?basis=assumed` produced the PROJECTED days
  // under a page header reading "IF EVERY ASSUMPTION HOLDS - reference copy,
  // not a payslip". Wrong days is a bug; wrong days under a confident heading
  // is the kind that gets signed.
  const basis = BASES.includes(asked) ? asked : "projected";

  // `projected` is the stored days untouched, which is the whole point of it.
  // An unknown basis lands here too, which is the safe way round: the default
  // is the document payroll actually pays.
  const days =
    basis === "corrected"
      ? applyAssumptions(stored, { confirmed, answers, pastDue })
      : stored;

  // QSP prints its own numbered notes under the same heading. Normalised to an
  // array here so the block below is one concatenation rather than a
  // conditional inside an object literal.
  const qspComments = Array.isArray(d.comments) ? d.comments : d.comments ? [d.comments] : [];

  return renderCorrected(
    {
      // WHAT IT PRINTS, not what it matches by - see `sheetDisplayName`. On a
      // rehearsal batch this is the first name alone so a recording can be
      // shown; `restName` below is untouched, because that is the key the
      // Breaks column is matched on and rewriting it strands every rest row.
      employee: sheetDisplayName({ user: ts.user, sourceName: ts.sourceName, batch: ts.batch }),
      // the spelling the Rest Periods Report used, which is what the Breaks
      // column is matched on. Separate from `employee`, which is what the page
      // PRINTS - the sheet has to carry the name payroll knows them by.
      restName: restNameFor(ts.sourceName, d),
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
      // QSP's own numbered notes, plus why a break was not taken - which QSP
      // has no field for at all. One list, continuing one numbering, because
      // to a reader it is one set of things somebody wrote about this period.
      //
      // ONE `comments` KEY. A second one was briefly added thirty lines above
      // this, on the belief that nothing was setting it - a later duplicate in
      // the same object literal silently wins, so the sheets that had notes
      // kept printing them and the ones that did not lost the break reasons.
      // ITALIC, AND ONLY THESE. Mánu 2026-08-17: on the sheet people sign, a
      // break comment goes in quotes and in italic. QSP's own notes stay
      // upright - they are the export's words about clock-ins, not somebody
      // explaining a missed break, and the two should not read as one voice.
      // The quotes come from `formatBreakComments`; the flag is what tells
      // `render.js` which font to draw the line with.
      comments: [
        ...qspComments,
        ...formatBreakComments(breakReasons, qspComments.length)
          .map((text) => ({ text, italic: true })),
      ],
      // MILES DRIVEN, off the payroll report and stored on the sheet at upload.
      // Null where that report predates the mileage column, which is not zero
      // miles - see the note where it is drawn, and the attestation that now
      // covers it.
      milesDriven: d.qspMiles ?? null,
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
