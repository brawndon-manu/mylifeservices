// Builds the Timesheet rows a day program upload writes - extracted from the
// server action so the local re-upload probe runs the EXACT code the portal
// runs, rather than a hand-copied twin that drifts. Everything here is a pure
// function of the analysis result plus the active user list.

import { matchEmployee } from "../timesheet/match.js";
import { renderSheet } from "../timesheet/render-sheet.js";

const r2 = (n) => Math.round((n || 0) * 100) / 100;

export async function buildDayProgramSheetRows(result, users, generatedOn) {
  const sheetRows = [];
  for (const p of result.people) {
    const m = matchEmployee(p.sourceName, users);

    // the sources' words ride in `data.comments`, where renderSheet already
    // prints them - italic, because they are somebody's words rather than
    // QSP's.
    //
    // Mánu 2026-08-18: the per-day column keeps saying rest 0/2 / compliant
    // like the MLS sheet, and the bottom block carries "their reasons they
    // missed as well as their own scheduled notes for reference" - which is
    // the notes themselves, dated, since the missed-break reasons are written
    // inside them.
    const comments = [...(p.comments || [])];
    for (const n of p.scheduleNotes || []) {
      comments.push({ text: `${n.date}: ${n.note}`, italic: true });
    }
    // A second break credited from a note is SAID OUT LOUD on the sheet. It was
    // read out of free text rather than off a column, so the person signing is
    // told which days it happened on and can say if it is wrong.
    //
    // This replaced the same sentence naming the retired rest break audit
    // (2026-08-22) - same principle, different source.
    const notedDates = p.days.filter((d) => (d.noteRests || 0) > 0).map((d) => d.date);
    if (notedDates.length) {
      comments.push({
        text: `Second rest breaks on ${notedDates.join(", ")} credited from the times recorded in the schedule notes above.`,
        italic: true,
      });
    }

    const data = {
      generatedOn,
      suggestions: m.suggestions,
      confidence: m.confidence,
      premiums: p.premiums,
      partialWeekDates: p.partialWeekDates,
      payPeriod: p.payPeriod || null,
      comments: comments.length ? comments : null,
      // MILES, off the day program's own mileage export rather than a payroll
      // report - it has none. Still null when that export was not uploaded,
      // which is not zero miles: null draws no mileage line on the sheet and
      // drops the mileage clause from the paragraph they sign, so nobody is
      // ever asked to attest to a figure we did not receive.
      qspMiles: p.miles ?? null,
      sourcePages: p.pages || [],
      schedulePages: p.schedulePages || [],
      // the evidence block, holding what this batch actually has: a rest
      // report and nothing else. `readAs.rests` is what restNameFor() reads,
      // and it is how Yesenia's sheet finds the rows QSP filed under
      // "Ramirez, Patricia".
      premiumSupport: {
        totals: { recorded: 0, supported: 0, unverified: 0 },
        byDate: {},
        readAs: {
          clock: null,
          rests:
            p.restName && p.restName !== p.sourceName
              ? { name: p.restName, confidence: 100, exact: true }
              : null,
          schedule: null,
        },
        clock: { matched: false },
      },
      punchIssues: p.punchIssues || [],
      punchCorrections: [],
      // the schedule's second opinion when the Employee Schedules PDF was
      // uploaded, stored in the exact MLS shape so the checks screens read it
      // unchanged. Absent schedule stays its own honest status.
      scheduleCheck: p.scheduleCheck
        ? {
            matched: true,
            status: "parsed",
            timesheetTotal: p.scheduleCheck.timesheetTotal,
            scheduleTotal: p.scheduleCheck.scheduleTotal,
            flagged: p.scheduleCheck.flagged.map(({ shifts, schedulePages, ...rest }) => rest),
            byDate: Object.fromEntries(
              p.scheduleCheck.rows
                .filter((r) => r.shifts?.length)
                .map((r) => [r.date, { shifts: r.shifts, pages: r.schedulePages }]),
            ),
          }
        : { matched: false, status: "not-collected", error: null },
      days: p.days,
      // picks the on-duty meal attestation, the Day Program header line and
      // the meal-less colour key - see render-sheet.js and render.js.
      onDutyMeal: true,
    };

    // rendered once purely to learn renderOk + approvalRect, exactly like
    // uploadBatch - a render failure surfaces on the review screen rather
    // than in front of an employee at 6pm.
    let renderOk = false;
    let approvalRect = null;
    try {
      const rendered = await renderSheet(
        {
          data,
          sourceName: p.sourceName,
          user: null,
          userId: null,
          batch: {
            periodFrom: result.payPeriod?.from || "",
            periodTo: result.payPeriod?.to || "",
            restsByDate: result.restRows,
          },
        },
        { basis: "projected" },
      );
      approvalRect = rendered?.approvalRect || null;
      renderOk = (rendered?.bytes?.length || 0) > 0;
    } catch (e) {
      console.error(`day program render failed for ${p.sourceName}:`, e);
    }
    data.approvalRect = approvalRect;

    sheetRows.push({
      sourceName: p.sourceName,
      userId: m.userId,
      matchMethod: m.method,
      rawHours: p.totals.rawHours,
      paidHours: p.totals.paidHours,
      regularHours: p.totals.regularHours,
      otHours: p.totals.otHours,
      doubleHours: p.totals.doubleHours,
      premiumHours: r2(p.premiums?.totalHours || 0),
      partialWeek: p.partialWeekDates.length > 0,
      renderOk,
      data,
    });
  }
  return sheetRows;
}
