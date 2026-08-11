"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { putBlob, hasBlobStorage } from "@/lib/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import {
  parseTimesheetPdf,
  analyzeTimesheet,
  applyOvertime,
  analyzeDay,
  punchCoverage,
} from "@/lib/timesheet/parse";
import { reviewSheet, repairConfirmedDays } from "@/lib/timesheet/anomalies";
import { buildQuestions, patchesFor } from "@/lib/timesheet/questions";
import { storedDay, totalsFromDays } from "@/lib/timesheet/stored";
import {
  parseSchedulePdf, scheduleKey, compareToSchedule, scheduleBlocks,
} from "@/lib/timesheet/schedule";
import { parseClockReport, clockKey, gradePremiums } from "@/lib/timesheet/clock";
import { parseRestReport, restKey, allRestRows, clockMin, serviceFit, FULL_REST_MIN } from "@/lib/timesheet/rests";
import { parsePayrollReport, payrollTotals } from "@/lib/timesheet/payroll";
import { indexByAccount, lookupAcross, suggestAlias } from "@/lib/timesheet/identity";
import { renderCorrected } from "@/lib/timesheet/render";
import { matchEmployee } from "@/lib/timesheet/match";
import { signTimesheetToken } from "@/lib/timesheet-token";
import { sendTimesheet, isLiveSend, liveSendConfigured } from "@/lib/timesheet-send";
import { sendCorrectionAlert } from "@/lib/timesheet-correction-email";
import { notifyOversight } from "@/lib/notify";
import { progressKey, setProgress } from "@/lib/timesheet-progress";
import { pushRecent } from "@/lib/timesheet-stages";
import { companyDate } from "@/lib/company-time";
import {
  isCorrectionKind,
  CORRECTION_KINDS,
  patchFor,
  mergeOverride,
  recomputeSheet,
} from "@/lib/timesheet/corrections";

async function requireTimesheetAccess() {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");
  return user;
}

const r2 = (n) => Math.round((n || 0) * 100) / 100;

// upload a QSP export: store the source, parse every employee, suggest a match
// for each, and render their corrected PDF. nothing is emailed here - the
// operator reviews the matches first.
export async function uploadBatch(formData) {
  const user = await requireTimesheetAccess();

  const file = formData.get("file");
  if (!file || typeof file !== "object" || !("size" in file) || file.size === 0) {
    redirect("/portal/admin/timesheets/new?error=nofile");
  }
  if (file.type && file.type !== "application/pdf") {
    redirect("/portal/admin/timesheets/new?error=notpdf");
  }

  // All three exports are required now, and that is a deliberate change.
  //
  // Measured on 07/16-07/31: of 622 premium hours, the clock export evidences
  // 386 and the schedule corroborates a further 215, leaving 21 that need a
  // person. Without both files that same batch is 622 hours resting on one
  // source. An upload that can't be stood behind isn't worth the time it takes
  // to generate, so it's refused rather than half-done.
  const schedFile = formData.get("schedule");
  const hasSched = schedFile && typeof schedFile === "object" && "size" in schedFile && schedFile.size > 0;
  if (!hasSched) redirect("/portal/admin/timesheets/new?error=noschedule");

  // The Simple Payroll Processing Report: QSP's OWN regular, overtime and
  // double-time totals per employee. It is what settles a disagreement about
  // overtime without anybody re-reading a PDF, and it reconciles with the
  // timesheet exactly - so a mismatch means one of the two files is from a
  // different pull, which is worth knowing before 59 sheets go out.
  const payFile = formData.get("payroll");
  const hasPay = payFile && typeof payFile === "object" && "size" in payFile && payFile.size > 0;
  if (!hasPay) redirect("/portal/admin/timesheets/new?error=nopayroll");

  // The Rest Periods Report is back. It was briefly dropped with the move to
  // three reports, and that took every rest premium with it: nothing else
  // records a rest break, so all 549 qualifying days came back unanswerable.
  // It is the only definitive source for the bigger half of the premium total.
  const restFile = formData.get("rests");
  const hasRests = restFile && typeof restFile === "object" && "size" in restFile && restFile.size > 0;
  if (!hasRests) redirect("/portal/admin/timesheets/new?error=norests");

  // QSClock stays out for now - the decision was "hold, we may add it later".
  // null means no punch is graded clocked-vs-typed, which every reader below
  // already handles.
  const clockFile = null;

  // the browser made this id up before submitting, so it can poll for progress
  // while this action runs. namespaced under the user inside progressKey - it is
  // never trusted as a key by itself. A null key makes every write a no-op, so
  // an upload with no id behaves exactly as it did before.
  const prog = progressKey(user.id, formData.get("uploadId"));
  // the whole reported state, held here so each write is a single set
  const P = { stage: "reading", done: 0, total: null, recent: [] };
  await setProgress(prog, P);

  const bytes = new Uint8Array(await file.arrayBuffer());

  let sheets;
  let parseError = null;
  try {
    sheets = await parseTimesheetPdf(bytes);
  } catch (e) {
    console.error("timesheet parse failed:", e);
    // carry a short reason to the screen. "couldn't read that PDF" on its own
    // sends people hunting for a bad file when the real cause was something
    // else entirely.
    parseError = (e?.message || String(e)).slice(0, 120);
  }
  if (parseError) {
    redirect(
      `/portal/admin/timesheets/new?error=parse&why=${encodeURIComponent(parseError)}`,
    );
  }
  const withHours = sheets.filter((s) => !s.empty);
  if (!withHours.length) {
    // it read fine but held no timesheet rows - usually the wrong export, or a
    // corrected sheet uploaded back into the tool by mistake.
    redirect(
      `/portal/admin/timesheets/new?error=empty&why=${encodeURIComponent(
        `read ${sheets.length} page group(s), none with hours`,
      )}`,
    );
  }

  P.stage = "checking";
  P.total = withHours.length;
  P.pages = sheets.reduce((n, s) => n + (s.pages?.length || 0), 0);
  await setProgress(prog, P);

  // ---- three guards on the export itself, all from real near-misses ----

  // QSP prints SCHEDULED shifts exactly like worked ones. pull a period before
  // it has ended and most of the file is time nobody has worked - one real pull
  // on the 3rd had 454 of 510 day-cases in the future, all carrying punch times.
  // generating timesheets from that asks people to attest to shifts that
  // haven't happened.
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const futureDates = new Set();
  for (const s of withHours) {
    for (const d of s.days) {
      const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(d.date || "");
      if (!m) continue;
      if (new Date(2000 + +m[3], +m[1] - 1, +m[2]) > today) futureDates.add(d.date);
    }
  }
  if (futureDates.size) {
    const sample = [...futureDates].sort().slice(0, 3).join(", ");
    redirect(
      `/portal/admin/timesheets/new?error=future&why=${encodeURIComponent(
        `${futureDates.size} dated after today (${sample}). Wait until the pay period has ended.`,
      )}`,
    );
  }

  // asking QSP for a range that spans two pay periods returns BOTH, as separate
  // sheets - 118 for 60 people. uploading that gives everyone two timesheets.
  const nameCounts = new Map();
  for (const s of withHours) {
    const k = (s.employee || "").trim().toLowerCase();
    nameCounts.set(k, (nameCounts.get(k) || 0) + 1);
  }
  const dupes = [...nameCounts].filter(([, n]) => n > 1);
  if (dupes.length) {
    redirect(
      `/portal/admin/timesheets/new?error=twoperiods&why=${encodeURIComponent(
        `${dupes.length} employees appear more than once. QSP returns whole pay periods, so a range spanning two gives you both. Ask for one period only.`,
      )}`,
    );
  }

  // did we actually READ the punch grid, or only think we did? a print-to-PDF of
  // the same export merges two times into one cell, so half the punches never
  // reach us while every employee, every row and every printed daily total look
  // perfectly intact. it parses clean to a premium figure that is 44 hours out.
  // the arithmetic lives in punchCoverage() so it has tests; this only decides.
  const cover = punchCoverage(withHours);
  if (!cover.ok) {
    redirect(
      `/portal/admin/timesheets/new?error=punches&why=${encodeURIComponent(
        `the punches account for ${cover.punchHours.toFixed(2)} hours against QSP's own printed ` +
          `${cover.printedHours.toFixed(2)}, and ${cover.driftDays} of ${cover.comparedDays} days disagree with the total QSP printed beside them`,
      )}`,
    );
  }

  const period = withHours[0].payPeriod || { from: "", to: "" };
  // the waiting screen names the period it is working on
  P.period = period;
  await setProgress(prog, P);

  // storage has to work BEFORE we create anything. a batch whose PDFs failed to
  // upload looks fine in the list but emails staff a link to a 404, so the whole
  // upload fails loudly here instead of silently half-succeeding.
  let sourceUrl = null;
  if (!hasBlobStorage()) {
    redirect("/portal/admin/timesheets/new?error=noblob");
  }
  try {
    const key = `timesheets/source/${randomBytes(10).toString("hex")}.pdf`;
    const blob = await putBlob(key, Buffer.from(bytes), {
      access: "public",
      contentType: "application/pdf",
    });
    sourceUrl = blob.url;
  } catch (e) {
    console.error("timesheet source upload failed:", e);
    redirect("/portal/admin/timesheets/new?error=blob");
  }

  // the schedule export, if one was given. it's the second record of the same
  // time, and the only way to catch a punch that was typed into the wrong box -
  // those are invisible in the timesheet alone, especially when two of them
  // cancel out and leave a total that looks perfectly ordinary.
  let schedules = null;
  let scheduleError = null;
  let scheduleUrl = null;
  // "no-file" | "parse-failed" | "parsed" - these three look identical from the
  // batch screen otherwise, and a file that silently failed to parse is exactly
  // the case you most need to be told about.
  let scheduleStatus = "no-file";
  console.log(
    `timesheet upload: timesheet=${file?.name || "?"} (${file?.size || 0}b), ` +
    `schedule=${schedFile?.name || "none"} (${schedFile?.size || 0}b), ` +
    `clock=${clockFile?.name || "none"} (${clockFile?.size || 0}b)`,
  );
  if (hasSched) {
    P.stage = "schedule";
    await setProgress(prog, P);
    const sbytes = new Uint8Array(await schedFile.arrayBuffer());

    // keep the file itself, not just what we read out of it. the checks screen
    // quotes this document back at people and asks them to act on it, so they
    // need to be able to open the page it came off. stored before the parse so
    // a file that FAILED to parse can still be looked at.
    try {
      const key = `timesheets/schedule/${randomBytes(10).toString("hex")}.pdf`;
      const blob = await putBlob(key, Buffer.from(sbytes), {
        access: "public",
        contentType: "application/pdf",
      });
      scheduleUrl = blob.url;
    } catch (e) {
      // the schedule is the optional second file - losing the copy of it must
      // never cost the whole upload, and the comparison still works without it
      console.error("schedule source upload failed:", e);
    }

    try {
      const people = await parseSchedulePdf(sbytes);
      schedules = new Map(people.map((p) => [scheduleKey(p.employee), p]));
      scheduleStatus = "parsed";
      console.log(`schedule parsed: ${people.length} employee pages`);
    } catch (e) {
      console.error("schedule parse failed:", e);
      // never lose the whole upload over the optional second file
      scheduleError = (e?.message || String(e)).slice(0, 160);
      scheduleStatus = "parse-failed";
    }
  }

  // QSClock and the Rest Periods Report were dropped on 2026-08-06. Both stay
  // null, and every reader below already handles that: `clocks` null means no
  // premium gets graded clocked-vs-typed, `rests` null means nothing can say a
  // rest break happened, which analyzeDay turns into restUnknown rather than
  // charging for it.
  let clocks = null;
  let clockUrl = null;

  // the rest report. refused rather than skipped: a batch missing it silently
  // loses every rest premium, and nothing on screen would say why.
  let rests = null;
  let restsUrl = null;
  let restsMalformed = [];
  let restsByDate = [];
  {
    P.stage = "rests";
    await setProgress(prog, P);
    const rbytes = new Uint8Array(await restFile.arrayBuffer());
    try {
      const key = `timesheets/rests/${randomBytes(10).toString("hex")}.xls`;
      const blob = await putBlob(key, Buffer.from(rbytes), {
        access: "public",
        contentType: "application/vnd.ms-excel",
      });
      restsUrl = blob.url;
    } catch (e) {
      console.error("rest report upload failed:", e);
    }
    try {
      rests = parseRestReport(Buffer.from(rbytes));
      // EVERY row, with the times it recorded. the signed sheet colours only
      // what the two reports actually recorded, and a properly taken rest is
      // paid and stays on the clock - so there is usually no punch gap to
      // colour and a count was never going to be enough.
      restsByDate = allRestRows(Buffer.from(rbytes));
      restsMalformed = restsByDate.filter((r) => r.kind && !r.counted);
      console.log(
        `rest report parsed: ${rests.size} employees, ${restsByDate.length} rows, ` +
        `${restsByDate.filter((r) => r.kind).length} needing attention, ${restsMalformed.length} not counted`,
      );
    } catch (e) {
      console.error("rest report parse failed:", e);
      redirect(
        `/portal/admin/timesheets/new?error=restparse&why=${encodeURIComponent(
          (e?.message || String(e)).slice(0, 160),
        )}`,
      );
    }
  }

  // The Simple Payroll Processing Report. Refused rather than skipped, the same
  // way the clock export used to be: it is the only thing that can say what QSP
  // itself thinks each person is owed, and a batch generated without it is a
  // batch nobody can check.
  let payroll = null;
  let payrollUrl = null;
  let payrollSummary = null;
  {
    P.stage = "payroll";
    await setProgress(prog, P);
    const pbytes = new Uint8Array(await payFile.arrayBuffer());
    try {
      const key = `timesheets/payroll/${randomBytes(10).toString("hex")}.xls`;
      const blob = await putBlob(key, Buffer.from(pbytes), {
        access: "public",
        contentType: "application/vnd.ms-excel",
      });
      payrollUrl = blob.url;
    } catch (e) {
      console.error("payroll report upload failed:", e);
    }
    try {
      payroll = parsePayrollReport(Buffer.from(pbytes));
      payrollSummary = payrollTotals(payroll);
      console.log(
        `payroll parsed: ${payroll.size} employees, ` +
          `${payrollSummary.regular.toFixed(2)} reg + ${payrollSummary.overtime.toFixed(2)} ot ` +
          `= ${payrollSummary.paid.toFixed(2)} paid`,
      );
    } catch (e) {
      console.error("payroll parse failed:", e);
      redirect(
        `/portal/admin/timesheets/new?error=payrollparse&why=${encodeURIComponent(
          (e?.message || String(e)).slice(0, 160),
        )}`,
      );
    }
  }

  const staff = await prisma.user.findMany({
    where: { deactivatedAt: null },
    select: { id: true, name: true, preferredFirstName: true, preferredLastName: true },
  });

  // ---- does this schedule actually cover the people on the timesheet? ----
  //
  // On 2026-08-09 a schedule export holding ONE employee was uploaded against a
  // 59-person timesheet. Nothing errored. 454 days came back mealUnknown,
  // because a day with no schedule is unanswerable rather than a violation, and
  // the batch landed at 426 premium hours instead of 680. It looked like a
  // finished batch and was wrong by 254 hours, which is far worse than a
  // refusal - the same export at 59 people is a 479KB file and the single
  // person one is 184KB, so nothing about the file names or the screen said so.
  //
  // Refused rather than warned, on the same principle as an export with no
  // timesheet rows: a number nobody can evidence should not reach a screen.
  //
  // THIS HAS TO RUN BEFORE THE BATCH ROW IS CREATED. It first shipped below it,
  // so a refused upload left an empty batch on the list and the error said
  // "Nothing was created" while a row sat there saying otherwise. The lookup
  // needs only the timesheet, the parsed schedule and the staff list, all of
  // which exist by here, so there was never a reason for it to be lower.
  const scheduleNamesForCover = schedules ? [...schedules.values()].map((p) => p.employee) : [];
  const scheduleCoverIndex = indexByAccount(scheduleNamesForCover, staff);
  const scheduleCovers = withHours.filter((raw) => {
    const m = matchEmployee(raw.employee, staff);
    return !!lookupAcross(raw.employee, m, {
      get: (k) => schedules.get(k) || null,
      keyOf: scheduleKey,
      byUser: scheduleCoverIndex,
    }).value;
  }).length;
  if (scheduleCovers * 2 < withHours.length) {
    redirect(
      `/portal/admin/timesheets/new?error=schedule&why=${encodeURIComponent(
        `the schedule covers ${scheduleCovers} of the ${withHours.length} people on the timesheet` +
          ` - meal periods cannot be evidenced for the rest, so the premium total would be far too low`,
      )}`,
    );
  }

  const batch = await prisma.timesheetBatch.create({
    data: {
      periodFrom: period.from || "",
      periodTo: period.to || "",
      sourceUrl,
      sourceName: file.name || null,
      scheduleUrl,
      scheduleName: scheduleUrl ? schedFile?.name || null : null,
      clockUrl,
      clockName: clockUrl ? clockFile?.name || null : null,
      restsUrl,
      restsName: restsUrl ? restFile?.name || null : null,
      restsByDate: restsByDate.length ? restsByDate : null,
      payrollUrl,
      payrollName: payrollUrl ? payFile?.name || null : null,
      // whether the live-send PHRASE was set when this batch was made. Not the
      // send gate: that also requires being on the real deployment, and a big
      // upload has to be run from localhost because of Vercel's 4.5MB body cap,
      // so gating the badge on the environment would mark every real batch
      // "test" purely because of where it was uploaded from.
      testMode: !liveSendConfigured(),
      uploadedById: user.id,
    },
  });

  P.stage = "generating";
  P.done = 0;
  P.recent = [];
  await setProgress(prog, P);

  // QSP prints different names for the same person across its own reports, so
  // both spellings are resolved through the portal account rather than compared
  // to each other. See identity.js.
  const clockNames = clocks ? [...clocks.values()].map((p) => p.name) : [];
  const restNames = rests ? [...rests.values()].map((p) => p.name) : [];
  const scheduleNames = schedules ? [...schedules.values()].map((p) => p.employee) : [];
  const clockByUser = indexByAccount(clockNames, staff);
  const restByUser = indexByAccount(restNames, staff);
  // the schedule was the one support file still looked up by plain name, so a
  // person QSP spells differently across its own exports got NO schedule
  // cross-check at all. On 07/16-07/31 that was Ruth Delgado Pineda (Angel on
  // the other reports) and Francisco Velasquez (Frank): 97 hours and 14 premium
  // hours with no second opinion, and a 5.9-hour punch question nothing could
  // settle - all of it over a spelling.
  const scheduleByUser = indexByAccount(scheduleNames, staff);

  // people we could not place in one of the other reports, with the best guess
  // and how sure it is. shown, never acted on.
  const aliasQuestions = [];

  // what the finished screen says. gathered as we go rather than re-queried
  // afterwards, so the summary is of exactly the sheets that were just written.
  const sum = {
    employees: 0, paidHours: 0, premiumHours: 0,
    punchPeople: 0, punchDays: 0, schedulePeople: 0, scheduleDays: 0,
    scheduleMatched: 0, failed: [],
    support: { recorded: 0, supported: 0, unverified: 0 },
  };

  // Counted rest windows in minutes, per person and date. Built once from the
  // report rows so the engine can tell a rest taken hard against the rostered
  // lunch from one taken in the middle of a work period. Keyed on the report's
  // own spelling; the day builder looks it up under the same key.
  //
  // EACH WINDOW CARRIES THE SERVICE IT WAS LOGGED AGAINST. Mánu 2026-08-11:
  // "rest periods are tied to a service. theres no way to document them without
  // having a service to add it to." So the report itself says where a break was
  // meant to sit, and until now the engine threw that away and guessed from
  // punch gaps instead - which is why the old snap rule found 3 of the 10 rows
  // that actually sit hard against a service edge.
  const restWindows = new Map();
  for (const row of restsByDate) {
    if (!row.counted || !row.date) continue;
    const out = clockMin(row.out);
    const inn = clockMin(row.in);
    if (out == null || inn == null) continue;
    const k = `${restKey(row.name)}|${row.date}`;
    if (!restWindows.has(k)) restWindows.set(k, []);
    restWindows.get(k).push({ out, in: inn, fit: serviceFit(row) });
  }

  for (const raw of withHours) {
    // hand each day QSP's own count of rest breaks taken, where the report
    // covers this person. `analyzeDay` uses it to decide the violation and
    // nothing else - hours still come from the punches on the timesheet.
    // the account first, so the other reports can be found under whatever name
    // they used for the same person
    const m = matchEmployee(raw.employee, staff);

    const restHit = rests
      ? lookupAcross(raw.employee, m, {
          get: (k) => rests.get(k) || null,
          keyOf: restKey,
          byUser: restByUser,
        })
      : { value: null, via: null };
    const rest = restHit.value;

    // the schedule has to be resolved BEFORE the days are analyzed now: whether
    // a meal was actually rostered is what decides the meal violation, so it is
    // an input to analyzeDay rather than something checked afterwards.
    const schedHit = schedules
      ? lookupAcross(raw.employee, m, {
          get: (k) => schedules.get(k) || null,
          keyOf: scheduleKey,
          byUser: scheduleByUser,
        })
      : { value: null, via: null };
    const sched = schedHit.value;
    const schedDay = new Map((sched?.days || []).map((d) => [d.date, d]));

    const withRests = {
      ...raw,
      days: raw.days.map((d) => {
        const sd = schedDay.get(d.date);
        return {
          ...d,
          // no rest report coverage means no record. Since 2026-08-06 there is
          // no rest report at all, so this is undefined on every day and the
          // day comes back restUnknown instead of owing a premium.
          restRecorded: rest ? rest.byDate[d.date]?.taken ?? 0 : undefined,
          // QSP stopped deducting rest breaks on 2026-08-06: they sit inside the
          // work segments already, so adding them back would pay them twice
          // (+23.58 hours over 07/16-07/31). This is about HOURS only. Whether a
          // break happened is a separate question, answered by the rest report.
          restsAlreadyPaid: true,
          // whether a rest source was collected AT ALL. Not the same as whether
          // it covers this person: uncovered means no break was recorded, which
          // is a premium. Only a batch with no report at all is unanswerable.
          restSourceAvailable: !!rests,
          // true = a "-Meal Break" block was rostered, false = the schedule
          // covers the day and rosters none, null = no schedule for the day,
          // which is unanswerable and goes to a person instead of being charged
          mealScheduled: sd ? (sd.entries || []).some((e) => e.meal) : null,
          // the day's rostered blocks as minutes, so the engine can say whether
          // a punched gap is the seam between two client bookings or somebody
          // stepping away mid-booking. without this it only ever sees a hole.
          scheduleBlocks: sd ? scheduleBlocks(sd.entries) : null,
          // the day's counted rest windows in minutes, so the engine can see a
          // rest taken hard against the rostered lunch, or one recorded outside
          // the shift. a count could never show either.
          //
          // Keyed on the REST REPORT's own spelling of the name, via the person
          // `lookupAcross` already matched - `restWindows` is built from that
          // document, and QSP does not always spell somebody the same way in
          // two exports. Falling back to the timesheet's name only matters when
          // the report has no row for them, in which case there is nothing to
          // find under either name.
          restTimes: restWindows.get(`${restKey(rest?.name || raw.employee)}|${d.date}`) || null,
        };
      }),
    };

    let t = analyzeTimesheet(withRests);

    // ---- the one repair we make on our own ----
    //
    // A reversed rest break makes two punch pairs overlap, so the same ten
    // minutes get billed twice and the day reads high. We only fix it when the
    // SCHEDULE agrees with the repaired figure. Not corroboration - the
    // timesheet is generated FROM the schedule - but the schedule is the
    // clean original and the timesheet is the copy that got mangled during
    // entry, so a match means we recovered what was entered. Measured on
    // 07/16-07/31, swapping every reversed break would have been wrong on 15 of
    // the 24 days the schedule can judge and stripped 15.58 hours off eleven
    // people. With that gate it was right 9 times out of 9.
    //
    // Applied to the parsed punches and then re-analyzed from scratch, so the
    // totals, overtime and premiums are the pipeline's own and never patched.
    const repair = repairConfirmedDays(withRests.days, t.days, sched?.days, analyzeDay);
    const punchCorrections = repair.corrections;
    if (punchCorrections.length) t = analyzeTimesheet({ ...withRests, days: repair.days });

    // two quality checks, both recorded rather than acted on. the figures are
    // never altered here - somebody looks at these and decides. re-run against
    // the repaired days so a fixed one stops being flagged.
    //
    // NOT independent of each other: the timesheet is generated from the
    // schedule, so compareToSchedule is a document against its own source. It
    // catches mangling that happened during entry, not a second observation of
    // the day. `scheduleDiff` came out 0 across all 59 people on 07/16-07/31,
    // which is not everyone working exactly to plan - it is the two files being
    // the same data.
    const punchIssues = reviewSheet(t.days, analyzeDay);
    const scheduleCheck = sched
      ? compareToSchedule(t.days, sched.days, { toleranceHours: 1 })
      : null;

    // how well each premium-bearing day is evidenced. computed here so the
    // grade is stored with the batch rather than recalculated from files that
    // may be gone by the time anyone reads it.
    const clockHit = clocks
      ? lookupAcross(t.employee, m, {
          get: (k) => clocks.get(k) || null,
          keyOf: clockKey,
          byUser: clockByUser,
        })
      : { value: null, via: null };
    const clk = clockHit.value;

    // matched under another spelling, but not a certain one. applied, and said
    // out loud - a 50% link must never read as a fact.
    for (const [report, hit] of [["clock", clockHit], ["rests", restHit], ["schedule", schedHit]]) {
      if (hit.via && !hit.exact) {
        aliasQuestions.push({
          kind: "estimated",
          sourceName: t.employee,
          report,
          candidate: hit.via,
          confidence: hit.confidence,
          premiumHours: r2(t.premiums.totalHours),
        });
      }
    }

    // nothing found under any spelling: the best guess, for the screen only
    if (clocks && !clk) {
      const guess = suggestAlias(t.employee, clockNames, staff);
      if (guess) {
        aliasQuestions.push({
          kind: "unmatched",
          sourceName: t.employee,
          report: "clock",
          candidate: guess.name,
          confidence: guess.confidence,
          premiumHours: r2(t.premiums.totalHours),
        });
      }
    }
    const scheduleByDate = scheduleCheck
      ? Object.fromEntries(
          scheduleCheck.rows.filter((r) => r.shifts?.length).map((r) => [r.date, { shifts: r.shifts }]),
        )
      : {};
    const support = gradePremiums(t.days, {
      clockDays: clk?.byDate || null,
      // whether QSP's rest report holds this person at all. if it does, its
      // count is what decided every rest violation on the sheet.
      restCovered: !!rest,
      scheduleByDate,
    });

    // Render once, to find out whether this sheet CAN render and to capture the
    // approval rectangle - then throw the bytes away. The unsigned PDF is a
    // pure function of `data`, so it is built on demand instead of stored: 59
    // blob writes per upload and another 59 per recompute, each orphaning the
    // last, is what filled the store and exhausted the write allowance.
    let renderOk = false;
    let approvalRect = null;
    const generatedOn = new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
    try {
      const rendered = await renderCorrected(
        {
          ...t,
          punchCorrections,
          // the Breaks column shows what the two reports RECORDED. it is not
          // derived from the punches, so it has to be handed in.
          restsByDate,
          scheduleByDate,
        },
        { printedBy: t.employee, generatedOn },
      );
      approvalRect = rendered.approvalRect;
      renderOk = rendered.bytes?.length > 0;
    } catch (e) {
      console.error(`timesheet render failed for ${t.employee}:`, e);
    }

    const storedDays = t.days.map(storedDay);
    await prisma.timesheet.create({
      data: {
        batchId: batch.id,
        sourceName: t.employee || "(unknown)",
        userId: m.userId,
        matchMethod: m.method,
        // summed from the ROUNDED days, so these columns equal what the sheet
        // prints. Mánu 2026-08-09: the sheet wins. See totalsFromDays().
        ...totalsFromDays(storedDays),
        premiumHours: r2(t.premiums.totalHours),
        partialWeek: t.partialWeekDates.length > 0,
        renderOk,
        data: {
          approvalRect,
          // frozen at upload. rendering on demand with today's date would put a
          // different "generated on" on the same sheet every time it opened.
          generatedOn,
          suggestions: m.suggestions,
          confidence: m.confidence,
          premiums: t.premiums,
          partialWeekDates: t.partialWeekDates,
          payPeriod: t.payPeriod || null,
          comments: t.comments || null,
          // which pages of each source PDF this person is on. the parsers have
          // always known - it just went nowhere, so the checks screen could
          // quote a document without being able to point at it.
          sourcePages: t.pages || [],
          schedulePages: sched?.pages || [],
          // premium hours split by how well the day behind them is evidenced,
          // plus the raw clock picture for this person
          premiumSupport: {
            totals: support.totals,
            byDate: support.byDate,
            // the spelling the other reports used, when it differed. shown
            // rather than silently substituted.
            readAs: {
              clock: clockHit.via
                ? { name: clockHit.via, confidence: clockHit.confidence, exact: clockHit.exact }
                : null,
              rests: restHit.via
                ? { name: restHit.via, confidence: restHit.confidence, exact: restHit.exact }
                : null,
              schedule: schedHit.via
                ? { name: schedHit.via, confidence: schedHit.confidence, exact: schedHit.exact }
                : null,
            },
            clock: clk
              ? {
                  matched: true,
                  shifts: clk.shifts,
                  missingIn: clk.missingIn,
                  missingOut: clk.missingOut,
                  byDate: clk.byDate,
                }
              : { matched: false },
          },
          // data-quality findings. stored, surfaced, never auto-applied.
          punchIssues,
          // the one exception: reversed breaks where the repaired figure
          // matches the schedule the timesheet was generated from. these WERE
          // applied, so what changed is kept beside the figures it produced
          // and printed on the sheet the employee signs.
          punchCorrections,
          scheduleCheck: scheduleCheck
            ? {
                matched: true,
                status: "parsed",
                timesheetTotal: scheduleCheck.timesheetTotal,
                scheduleTotal: scheduleCheck.scheduleTotal,
                // the flags stay lean - they're a table of figures, and the
                // batch screen only counts them
                flagged: scheduleCheck.flagged.map(
                  ({ shifts, schedulePages, ...rest }) => rest,
                ),
                // the shifts themselves, by date, for EVERY day the schedule
                // covered - not just the flagged ones. A day with a bad punch
                // often agrees with the schedule on total while disagreeing on
                // shape, and the scheduled times are what make a 5:15a that
                // should be 5:15p obvious.
                byDate: Object.fromEntries(
                  scheduleCheck.rows
                    .filter((r) => r.shifts?.length)
                    .map((r) => [r.date, { shifts: r.shifts, pages: r.schedulePages }]),
                ),
              }
            : {
                matched: false,
                // a schedule that parsed but had no page for this person is a
                // different problem from no schedule at all
                status: schedules ? "name-not-found" : scheduleStatus,
                error: scheduleError || null,
              },
          // punches + breaks are kept so a sheet can be recomputed and
          // re-rendered after a correction without going back to the source
          // export. mealMin is what a worked-through meal would add back.
          days: storedDays,
        },
      },
    });

    // the name is the point: a bare number climbing tells you it's alive, a
    // name tells you WHERE it is, so a sheet that hangs the render names itself
    // instead of being guessed at.
    sum.employees += 1;
    sum.paidHours += t.totals.paidHours;
    sum.premiumHours += t.premiums.totalHours;
    if (punchIssues.length) { sum.punchPeople += 1; sum.punchDays += punchIssues.length; }
    if (scheduleCheck?.flagged?.length) { sum.schedulePeople += 1; sum.scheduleDays += scheduleCheck.flagged.length; }
    if (scheduleCheck) sum.scheduleMatched += 1;
    if (!renderOk) sum.failed.push(t.employee || "(unknown)");
    sum.support.recorded += support.totals.recorded;
    sum.support.supported += support.totals.supported;
    sum.support.unverified += support.totals.unverified;

    P.done += 1;
    P.recent = pushRecent(P.recent, {
      name: t.employee || "(unknown)",
      hours: r2(t.totals.paidHours),
      premium: r2(t.premiums.totalHours),
      // a render failure is worth seeing as it happens
      failed: !renderOk,
    });
    // throttled: the screen polls once a second, so writing faster than that
    // buys nothing and costs a round-trip inside the slow loop
    await setProgress(prog, P, { minGapMs: 300 });
  }

  P.stage = "saving";
  await setProgress(prog, P);

  revalidatePath("/portal/admin/timesheets");

  const summary = {
    ...sum,
    aliasQuestions,
    paidHours: r2(sum.paidHours),
    premiumHours: r2(sum.premiumHours),
    pages: P.pages || 0,
    periodFrom: batch.periodFrom,
    periodTo: batch.periodTo,
    scheduleError: scheduleError || null,
  };

  P.stage = "done";
  P.batchId = batch.id;
  P.summary = summary;
  await setProgress(prog, P);

  // deliberately NOT a redirect.
  //
  // It used to throw you straight at the batch page the instant the last sheet
  // was written, which threw away everything the upload had just learned - and
  // landed you on a screen whose main button is "Send all". The page now shows
  // what it found, then moves on by itself.
  //
  // The href is returned rather than navigated to here so the screen can decide
  // when to follow it. If anything on the client fails, the link is still on
  // screen to click.
  return {
    ok: true,
    href: `/portal/admin/timesheets/${batch.id}${
      scheduleError ? `?schedfail=${encodeURIComponent(scheduleError)}` : ""
    }`,
    summary,
  };
}

// bin a whole batch. a bad upload used to mean clearing it out of the database
// by hand, which is not a thing anyone should need help with.
//
// this destroys signatures, so the count of them is handed back to the button
// and named in the confirm rather than being discovered afterwards.
export async function deleteBatch(batchId) {
  const user = await requireTimesheetAccess();

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      periodFrom: true,
      periodTo: true,
      _count: { select: { timesheets: true } },
    },
  });
  if (!batch) return { ok: false, error: "gone" };

  const signed = await prisma.timesheet.count({
    where: { batchId, OR: [{ signedAt: { not: null } }, { approvedAt: { not: null } }] },
  });

  // the timesheets and their corrections cascade from the batch row
  await prisma.timesheetBatch.delete({ where: { id: batchId } });

  console.log(
    `timesheet batch deleted by ${user.id}: ${batch.periodFrom}-${batch.periodTo}, ` +
    `${batch._count.timesheets} sheets, ${signed} of them signed or approved`,
  );

  revalidatePath("/portal/admin/timesheets");
  redirect("/portal/admin/timesheets?deleted=1");
}

// how much would be lost - read before showing the confirm, never after
export async function batchDeletionImpact(batchId) {
  await requireTimesheetAccess();
  const [sheets, signed, approved, sent] = await Promise.all([
    prisma.timesheet.count({ where: { batchId } }),
    prisma.timesheet.count({ where: { batchId, signedAt: { not: null } } }),
    prisma.timesheet.count({ where: { batchId, approvedAt: { not: null } } }),
    prisma.timesheet.count({ where: { batchId, sentAt: { not: null } } }),
  ]);
  return { sheets, signed, approved, sent };
}

// correct or set the employee a timesheet belongs to
export async function assignTimesheet(timesheetId, userId) {
  await requireTimesheetAccess();
  const target = await prisma.user.findFirst({
    where: { id: userId, deactivatedAt: null },
    select: { id: true },
  });
  if (!target) return;
  const ts = await prisma.timesheet.update({
    where: { id: timesheetId },
    data: { userId: target.id, matchMethod: "manual" },
    select: { batchId: true },
  });
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}`);
}

export async function clearTimesheetAssignment(timesheetId) {
  await requireTimesheetAccess();
  const ts = await prisma.timesheet.update({
    where: { id: timesheetId },
    data: { userId: null, matchMethod: "unmatched" },
    select: { batchId: true },
  });
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}`);
}

// send one timesheet, or every unsent matched one in the batch. the message +
// deadline come from the review screen. test mode redirects every address.
export async function sendTimesheets(batchId, formData) {
  await requireTimesheetAccess();

  const onlyId = formData.get("timesheetId");
  const message = (formData.get("message") || "").toString().trim().slice(0, 2000) || null;
  const dueRaw = (formData.get("dueAt") || "").toString();
  const dueAt = dueRaw ? new Date(dueRaw) : null;
  const resend = formData.get("resend") === "on";

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id: batchId },
    // restsByDate carries the 30-minute entries filed as rest breaks, which the
    // email has to ask about. They live on the batch, not the sheet.
    select: { id: true, periodFrom: true, periodTo: true, restsByDate: true },
  });
  if (!batch) redirect("/portal/admin/timesheets");

  // a row with no generated PDF would email someone a link to a 404, so it is
  // never sendable - the review screen flags those separately. a sheet with an
  // open dispute isn't sendable either: asking someone to sign again while
  // their report sits unanswered is exactly the chasing this replaces.
  const where = {
    batchId,
    userId: { not: null },
    renderOk: true,
    disputedAt: null,
  };
  if (onlyId) where.id = onlyId.toString();
  else if (!resend) where.sentAt = null;

  const rows = await prisma.timesheet.findMany({
    where,
    include: {
      user: { select: { id: true, email: true, name: true, preferredFirstName: true, preferredLastName: true } },
      // what they have already told us, so a RESEND says "penalty pay added"
      // rather than repeating an assumption they have already corrected
      corrections: {
        where: { kind: { startsWith: "q_" }, status: { not: "open" } },
        select: { kind: true, date: true, status: true },
      },
    },
  });

  const base = process.env.AUTH_URL || "https://www.mylifeservicesinc.com";
  const periodLabel = `${batch.periodFrom} to ${batch.periodTo}`;
  const dueLabel = dueAt && !Number.isNaN(dueAt.getTime())
    ? companyDate(dueAt, { month: "long", day: "numeric", year: "numeric" })
    : null;

  let sent = 0;
  let failed = 0;
  for (const ts of rows) {
    if (!ts.user?.email) { failed++; continue; }
    const url = `${base}/t/${signTimesheetToken(ts.id)}`;
    // HOW MANY QUESTIONS THEY HAVE, WHICH IS THE ONLY NUMBER THE EMAIL CARRIES.
    // Mánu 2026-08-11 cut the figures, the checks tables and the policy
    // paragraph: everything they said is on the page the button opens, beside
    // the document it describes, and a payroll figure quoted in an email goes
    // stale the moment somebody answers one of these.
    //
    // Counted from the same classifier the page renders from, so the email
    // cannot promise a different number of cards than the person then sees.
    const asked = buildQuestions(ts.data, {
      restRows: batch.restsByDate || [],
      sourceName: ts.sourceName,
    }).length;
    const res = await sendTimesheet({
      intendedEmail: ts.user.email,
      // `sentAt` is stamped by the first send, so a row that already has one is
      // getting this sheet for at least the second time
      isResend: !!ts.sentAt,
      employeeName: preferredName(ts.user) || ts.sourceName,
      periodLabel,
      message,
      dueAt: dueLabel,
      signUrl: url,
      questionCount: asked,
    });
    if (res.ok) {
      sent++;
      await prisma.timesheet.update({
        where: { id: ts.id },
        data: {
          sentAt: new Date(),
          sentToEmail: res.sentTo,
          intendedEmail: ts.user.email,
          dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null,
          message,
        },
      });
    } else {
      failed++;
    }
  }

  revalidatePath(`/portal/admin/timesheets/${batchId}`);
  redirect(`/portal/admin/timesheets/${batchId}?sent=${sent}${failed ? `&failed=${failed}` : ""}`);
}

// management sign-off, after the employee has signed. stores the approved copy
// as the final record - that's what the batch downloads hand back for filing.
export async function approveTimesheet({ timesheetId, signatureDataUrl }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) return { ok: false, error: "auth" };

  const ts = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    select: {
      id: true, batchId: true, signedAt: true, approvedAt: true,
      signedPdfUrl: true, pdfUrl: true, data: true,
    },
  });
  if (!ts) return { ok: false, error: "auth" };
  // approving something the employee hasn't signed would put management's
  // signature on an unattested document
  if (!ts.signedAt) return { ok: false, error: "notsigned" };
  if (ts.approvedAt) return { ok: false, error: "already" };
  if (typeof signatureDataUrl !== "string" || !signatureDataUrl.startsWith("data:image")) {
    return { ok: false, error: "nosignature" };
  }

  const sourceUrl = ts.signedPdfUrl || ts.pdfUrl;
  if (!sourceUrl) return { ok: false, error: "nofile" };
  const rect = ts.data?.approvalRect;
  // batches generated before the approval work don't carry the coordinates, so
  // there's nowhere to place the signature - say so plainly instead of silently
  // approving a document with no visible sign-off on it.
  if (!rect) return { ok: false, error: "norect" };

  // stamp the signature onto the employee-signed copy
  let pdfBase64;
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return { ok: false, error: "nofile" };
    const doc = await PDFDocument.load(await res.arrayBuffer());
    const page = doc.getPages()[rect.pageIndex] || doc.getPages()[0];
    const png = await doc.embedPng(signatureDataUrl);
    // fit inside the line without distorting the drawing
    const k = Math.min(rect.width / png.width, rect.height / png.height);
    const w = png.width * k;
    const h = png.height * k;
    page.drawImage(png, {
      x: rect.x + (rect.width - w) / 2,
      y: rect.y + (rect.height - h) / 2,
      width: w,
      height: h,
    });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    // pinned to Pacific, not the server clock. Vercel runs UTC, so an approval
    // signed at 11:30pm Pacific would otherwise print tomorrow's date on a
    // payroll document - and disagree with the employee's date, which their
    // browser writes in local time.
    const approvedOn = new Date().toLocaleDateString("en-US", {
      timeZone: "America/Los_Angeles",
    });
    page.drawText(approvedOn, {
      x: rect.dateX + 4,
      y: rect.dateY + 4,
      size: 9,
      font,
    });
    pdfBase64 = Buffer.from(await doc.save()).toString("base64");
  } catch (e) {
    console.error("approval stamp failed:", e);
    return { ok: false, error: "stamp" };
  }

  let approvedPdfUrl = null;
  if (hasBlobStorage()) {
    try {
      const key = `timesheets/approved/${randomBytes(12).toString("hex")}.pdf`;
      const blob = await putBlob(key, Buffer.from(pdfBase64, "base64"), {
        access: "public",
        contentType: "application/pdf",
      });
      approvedPdfUrl = blob.url;
    } catch (e) {
      console.error("approved timesheet upload failed:", e);
      return { ok: false, error: "store" };
    }
  }

  await prisma.timesheet.update({
    where: { id: timesheetId },
    data: { approvedAt: new Date(), approvedById: user.id, approvedPdfUrl },
  });

  revalidatePath(`/portal/admin/timesheets/${ts.batchId}`);
  return { ok: true };
}

// employee-side: report that something on the timesheet is wrong. takes the
// token, like signing does - the person reporting has no portal login.
//
// this records claims and nothing more. no figure on the timesheet moves here;
// that only happens when someone with access accepts a correction. the sheet is
// marked disputed so it can't be signed in the meantime.
export async function submitTimesheetCorrections({ token, items }) {
  const { verifyTimesheetToken } = await import("@/lib/timesheet-token");
  const id = verifyTimesheetToken(token);
  if (!id) return { ok: false, error: "auth" };

  if (!Array.isArray(items) || !items.length) return { ok: false, error: "empty" };
  // a generous cap - a fortnight has at most ~14 days and a couple of issues
  // each. this is only here so a malformed client can't write unbounded rows.
  if (items.length > 40) return { ok: false, error: "empty" };

  const ts = await prisma.timesheet.findUnique({
    where: { id },
    include: {
      batch: { select: { id: true, periodFrom: true, periodTo: true, uploadedById: true } },
      user: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
      corrections: { where: { status: "open" }, select: { id: true } },
    },
  });
  if (!ts) return { ok: false, error: "auth" };
  // signing attests the document is right, so a signed sheet is closed to this
  if (ts.signedAt) return { ok: false, error: "already" };
  if (ts.corrections.length) return { ok: false, error: "reported" };

  const knownDates = new Set((ts.data?.days || []).map((d) => d.date));

  const clean = [];
  for (const raw of items) {
    const kind = String(raw?.kind || "");
    if (!isCorrectionKind(kind)) continue;
    const spec = CORRECTION_KINDS[kind];

    // a date has to be one this sheet actually lists, otherwise an accepted
    // correction would patch a day that doesn't exist. "a day that isn't
    // listed" carries its date in the note instead, for a human to read.
    let date = raw?.date ? String(raw.date).slice(0, 12) : null;
    if (date && !knownDates.has(date)) date = null;
    if (spec.scope === "day" && !date) continue;

    let claimedHours = null;
    if (spec.asksHours && raw?.claimedHours != null) {
      const n = Number(raw.claimedHours);
      if (Number.isFinite(n) && n >= 0 && n <= 24) claimedHours = Math.round(n * 100) / 100;
    }

    const note = raw?.note ? String(raw.note).trim().slice(0, 1000) : null;
    if (spec.needsNote && !note) continue;

    clean.push({ date, kind, claimedHours, note });
  }
  if (!clean.length) return { ok: false, error: "empty" };

  await prisma.$transaction([
    prisma.timesheetCorrection.createMany({
      data: clean.map((c) => ({ ...c, timesheetId: ts.id })),
    }),
    prisma.timesheet.update({
      where: { id: ts.id },
      data: { disputedAt: new Date() },
    }),
  ]);

  const who = ts.user ? preferredName(ts.user) : ts.sourceName;
  const periodLabel = `${ts.batch.periodFrom} to ${ts.batch.periodTo}`;
  const base = process.env.AUTH_URL || "https://www.mylifeservicesinc.com";
  const reviewUrl = `${base}/portal/admin/timesheets/${ts.batchId}/corrections`;

  // who hears about it. an explicit address list wins; otherwise it goes to
  // whoever uploaded the batch, since they're the one running this period.
  let to = (process.env.TIMESHEET_ALERT_TO || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!to.length && ts.batch.uploadedById) {
    const uploader = await prisma.user.findUnique({
      where: { id: ts.batch.uploadedById },
      select: { email: true },
    });
    if (uploader?.email) to = [uploader.email];
  }

  // best-effort, like every other notification here: a mail hiccup must not
  // lose the report itself, which is already safely written above.
  try {
    if (to.length) {
      await sendCorrectionAlert({
        to,
        employeeName: who,
        periodLabel,
        items: clean,
        reviewUrl,
      });
    }
  } catch (e) {
    console.error("correction alert failed:", e);
  }

  await notifyOversight({
    type: "TIMESHEET_DISPUTED",
    title: `${who} reported a timesheet problem`,
    body: `${clean.length} item${clean.length === 1 ? "" : "s"} on the ${periodLabel} timesheet. Their signature is on hold.`,
    link: `/portal/admin/timesheets/${ts.batchId}/corrections`,
  });

  revalidatePath(`/portal/admin/timesheets/${ts.batchId}`);
  return { ok: true };
}

// accept or decline one reported problem. accepting stores a per-day override;
// the figures don't move until recomputeTimesheet runs, which the caller does
// once all the open items are dealt with.
export async function resolveCorrection(correctionId, decision, formData) {
  const user = await requireTimesheetAccess();
  if (decision !== "accepted" && decision !== "declined") return;

  const note = formData
    ? (formData.get("resolutionNote") || "").toString().trim().slice(0, 1000) || null
    : null;

  const c = await prisma.timesheetCorrection.findUnique({
    where: { id: correctionId },
    include: { timesheet: { select: { id: true, batchId: true, data: true, overrides: true } } },
  });
  if (!c || c.status !== "open") return;

  let overrides = c.timesheet.overrides || {};
  if (decision === "accepted") {
    const day = (c.timesheet.data?.days || []).find((d) => d.date === c.date) || null;
    const patch = patchFor(c.kind, day, c.claimedHours);
    if (c.date) overrides = mergeOverride(overrides, c.date, patch);
  }

  await prisma.$transaction([
    prisma.timesheetCorrection.update({
      where: { id: correctionId },
      data: {
        status: decision,
        resolvedAt: new Date(),
        resolvedById: user.id,
        resolutionNote: note,
      },
    }),
    prisma.timesheet.update({
      where: { id: c.timesheet.id },
      data: { overrides },
    }),
  ]);

  revalidatePath(`/portal/admin/timesheets/${c.timesheet.batchId}/corrections`);
}

// correct a single day by hand, from the data-checks screen.
//
// this is the admin-side twin of accepting an employee's correction: same
// override store, same recompute, same audit trail. it exists because the checks
// screen can already see that a day is wrong and what it probably should be, and
// there was no way to act on that without an employee reporting it first.
//
// provenance is written alongside the figure. a corrected timesheet has to be
// able to say who changed it, when, from what, and why - a bare number appearing
// in a payroll document with no explanation is worse than the error.
export async function overrideDayHours(timesheetId, formData) {
  const user = await requireTimesheetAccess();

  const date = (formData.get("date") || "").toString().slice(0, 12);
  const raw = (formData.get("hours") || "").toString().trim();
  const note = (formData.get("note") || "").toString().trim().slice(0, 500) || null;
  const hours = Number(raw);
  if (!date) return { ok: false, error: "nodate" };
  if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
    return { ok: false, error: "badhours" };
  }

  const ts = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    select: { id: true, batchId: true, data: true, overrides: true, signedAt: true },
  });
  if (!ts) return { ok: false, error: "gone" };
  // changing the figures under a signature would leave them attesting to a
  // document that no longer says what they signed
  if (ts.signedAt) return { ok: false, error: "signed" };

  const day = (ts.data?.days || []).find((d) => d.date === date);
  if (!day) return { ok: false, error: "noday" };

  const overrides = mergeOverride(ts.overrides, date, {
    paidHours: Math.round(hours * 100) / 100,
    _was: day.paidHours,
    _by: preferredName(user) || user.id,
    _at: new Date().toISOString(),
    _note: note,
    _source: "data-check",
  });

  await prisma.timesheet.update({
    where: { id: ts.id },
    data: { overrides },
  });

  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/checks`);
  return { ok: true };
}

export async function clearDayOverride(timesheetId, date) {
  await requireTimesheetAccess();
  const ts = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    select: { id: true, batchId: true, overrides: true },
  });
  if (!ts?.overrides) return { ok: false, error: "gone" };
  const next = { ...ts.overrides };
  delete next[date];
  await prisma.timesheet.update({ where: { id: ts.id }, data: { overrides: next } });
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/checks`);
  return { ok: true };
}

// re-run one employee's figures from their stored days plus whatever overrides
// were accepted, regenerate the PDF, and clear the dispute so it can be sent
// again for signature.
//
// only this one sheet is touched. the batch, and everyone else in it, is left
// exactly as it was.
export async function recomputeTimesheet(timesheetId) {
  await requireTimesheetAccess();

  const ts = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    include: {
      batch: { select: { id: true, periodFrom: true, periodTo: true, restsByDate: true } },
      corrections: { where: { status: "open" }, select: { id: true } },
    },
  });
  if (!ts) return { ok: false, error: "auth" };
  // recomputing with items still open would produce a sheet that's about to
  // change again - deal with all of them first.
  if (ts.corrections.length) return { ok: false, error: "openitems" };

  return rebuildSheetFor(ts, ts.overrides);
}

// Recompute one sheet against a set of overrides, re-render its PDF, and store
// the result. Shared by the admin recompute above and by the employee answering
// a rest-repair question on their own sheet, so there is exactly one place that
// knows how a corrected document is produced.
//
// The caller does the authorisation and the guards. This does the work.
async function rebuildSheetFor(ts, overrides, { keepSent = false } = {}) {
  const stored = ts.data || {};
  // RECOMPUTE FROM THE PRISTINE DAYS, NOT THE STORED ONES.
  //
  // `recomputeSheet` returns the PATCHED days and we write them straight back
  // into `data.days`, so after one rebuild the stored days already carry the
  // correction. Recomputing from those with the override removed starts from
  // the corrected figures and changes nothing - an override could be applied
  // and never undone. Caught by an employee answering a rest question "yes"
  // and then "no": the premium went 16.00 -> 15.00 -> 15.00.
  //
  // So the untouched set is kept once, the first time a sheet is rebuilt, and
  // every rebuild starts from it.
  const days = stored.daysOriginal || stored.days || [];
  // batches uploaded before corrections existed don't carry the punch detail the
  // renderer needs, so there's nothing to rebuild from. say so plainly rather
  // than emit a sheet with an empty punch column.
  if (!days.length || !days.some((d) => Array.isArray(d.punches))) {
    return { ok: false, error: "nodetail" };
  }

  const payPeriod =
    stored.payPeriod || { from: ts.batch.periodFrom, to: ts.batch.periodTo };

  const next = recomputeSheet({ days, payPeriod, overrides }, applyOvertime);

  // A rebuild renders to CHECK, and to refresh the approval rectangle, then
  // discards the bytes - the sheet itself is built on demand. This is the loop
  // that used to write 59 blobs and orphan 59 more every time it ran.
  //
  // `generatedOn` is NOT refreshed. It records when the figures were produced,
  // and a recompute of stored days does not make the timesheet new.
  let approvalRect = stored.approvalRect || null;
  const generatedOn =
    stored.generatedOn ||
    new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
  try {
    const rendered = await renderCorrected(
      {
        employee: ts.sourceName,
        payPeriod,
        days: next.days,
        totals: next.totals,
        premiums: next.premiums,
        comments: stored.comments || null,
        // same two sources as at upload, so a rebuilt sheet keeps its Breaks
        // column rather than silently losing it on the first recompute
        restsByDate: ts.batch.restsByDate || [],
        scheduleByDate: stored.scheduleCheck?.byDate || null,
      },
      { printedBy: ts.sourceName, generatedOn },
    );
    approvalRect = rendered.approvalRect;
  } catch (e) {
    console.error(`timesheet recompute render failed for ${ts.sourceName}:`, e);
    return { ok: false, error: "render" };
  }

  await prisma.timesheet.update({
    where: { id: ts.id },
    data: {
      rawHours: r2(next.totals.rawHours),
      paidHours: r2(next.totals.paidHours),
      regularHours: r2(next.totals.regularHours),
      otHours: r2(next.totals.otHours),
      doubleHours: r2(next.totals.doubleHours),
      premiumHours: r2(next.premiums.totalHours),
      partialWeek: next.partialWeekDates.length > 0,
      renderOk: true,
      // the stored copy is gone: the sheet is rendered on demand now, and a
      // stale blob would be a different document from the one on screen.
      pdfUrl: null,
      overrides,
      // the corrected sheet is a different document, so the old signature and
      // sign-off can't carry over to it. it goes back out unsigned.
      signedAt: null,
      signedPdfUrl: null,
      signedName: null,
      signedIp: null,
      approvedAt: null,
      approvedById: null,
      approvedPdfUrl: null,
      // an admin recompute has to go back OUT, so it stops counting as sent.
      // an employee answering a question on the sheet in front of them is about
      // to sign that same sheet - clearing sentAt there would put them back on
      // the chase list for a document they are already looking at.
      ...(keepSent ? {} : { sentAt: null }),
      disputedAt: null,
      recomputedAt: new Date(),
      data: {
        ...stored,
        approvalRect,
        premiums: next.premiums,
        partialWeekDates: next.partialWeekDates,
        generatedOn,
        // stashed on the first rebuild only, and never overwritten after
        daysOriginal: days,
        days: next.days,
      },
    },
  });

  revalidatePath(`/portal/admin/timesheets/${ts.batchId}`);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/corrections`);
  return { ok: true };
}

// "13:15" -> 795, or null if it is not a time on this clock. One parser, so the
// single-answer path and the per-day times cannot disagree about what counts.
function hhmmToMin(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? "").trim());
  if (!m) return null;
  const min = Number(m[1]) * 60 + Number(m[2]);
  return min >= 0 && min <= 1439 ? min : null;
}

// minutes past midnight -> the short form every time on the sheet uses, so an
// employee-stated break prints like "2:10p" beside QSP's own punches rather than
// in a second format that reads as a different kind of thing.
function shortClock(min) {
  const h24 = Math.floor(min / 60);
  const mm = min % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${h24 < 12 ? "a" : "p"}`;
}

// THE ONE ACTION BEHIND ALL FIVE QUESTIONS.
//
// It never trusts what it is handed. The question list is rebuilt from the
// sheet and the batch's own rest rows, and the incoming `id` has to match one
// of them, so a client cannot answer a question nobody asked. That is the same
// defence the old single-question action had, which matched on name, date and
// out-time; this generalises it to all five kinds.
//
// OVERRIDES ARE COMPUTED FROM SCRATCH on every answer, from the full set of
// stored answers rather than by toggling. Changing an answer back really does
// put the figure back, instead of leaving half an override behind.
//
// Two of the five arrive with the correction ALREADY APPLIED by the engine
// (`restOutsideShift`, `shortMealRest`). For those, declining is what moves the
// money - and it moves it back UP. Mánu 2026-08-09: "if they make corrections
// against our presumed corrections then a new timesheet pdf should be built for
// them with the updated count."
// ONE ANSWER, OR A WHOLE CARD OF THEM.
//
// `{ id, choice }` is one question. `{ batch: [{ id, choice, at }] }` is a card
// answered day by day and committed together - Mánu 2026-08-09 late, on the
// twelve-day breaks card: answering each day separately would mean thirteen
// confirm panels and thirteen sheet rebuilds for Ford.
//
// EVERY ID IS STILL RE-DERIVED FROM THE CLASSIFIER, one at a time, exactly as
// before. A batch is a batch of writes, not a relaxation of the check: a client
// cannot answer a question nobody asked, whichever shape it arrives in.
export async function answerTimesheetQuestion({ token, id, choice, at, batch }) {
  const { verifyTimesheetToken } = await import("@/lib/timesheet-token");
  const tsId = verifyTimesheetToken(token);
  if (!tsId) return { ok: false, error: "auth" };

  const asked = Array.isArray(batch) && batch.length
    ? batch.map((b) => ({ id: b?.id, choice: b?.choice, at: b?.at ?? null, times: b?.times || null }))
    : [{ id, choice, at: at ?? null, times: null }];
  if (asked.length > 40) return { ok: false, error: "toomany" };
  if (asked.some((a) => a.choice !== "yes" && a.choice !== "no")) {
    return { ok: false, error: "badchoice" };
  }

  const ts = await prisma.timesheet.findUnique({
    where: { id: tsId },
    include: {
      batch: { select: { id: true, restsByDate: true } },
      corrections: { where: { status: "open" }, select: { id: true } },
    },
  });
  if (!ts) return { ok: false, error: "auth" };
  if (ts.signedAt) return { ok: false, error: "already" };
  if (ts.corrections.length) return { ok: false, error: "reported" };

  const questions = buildQuestions(ts.data, {
    restRows: ts.batch.restsByDate || [],
    sourceName: ts.sourceName,
  });
  // RESOLVE AND VALIDATE EVERYTHING BEFORE WRITING ANYTHING. A batch where the
  // ninth day carries a time we cannot read must not leave the first eight
  // written and the sheet half rebuilt.
  const resolved = [];
  for (const a of asked) {
    const q = questions.find((x) => x.id === a.id);
    if (!q) return { ok: false, error: "unknown" };

    // a typed time is only meaningful where the question asks for one
    let stated = null;
    if (a.choice === "yes" && q.canGiveTime && a.at != null && a.at !== "") {
      const start = hhmmToMin(a.at);
      if (start == null) return { ok: false, error: "badtime" };
      if (start + FULL_REST_MIN > 1439) return { ok: false, error: "badtime" };
      stated = {
        from: shortClock(start),
        to: shortClock(start + FULL_REST_MIN),
        minutes: FULL_REST_MIN,
      };
    }
    // THE TIMES THEY GAVE FOR BREAKS NOTHING RECORDED. Required: a day cannot
    // be answered "I took them" without saying when, because the record is the
    // whole point of asking (Mánu 2026-08-10). Validated here, before anything
    // is written, so a bad time on the ninth day cannot leave the first eight
    // saved and the sheet half rebuilt.
    let statedBreaks = null;
    if (a.choice === "yes" && q.needs?.length) {
      const given = a.times || {};
      const list = [];
      for (const need of q.needs) {
        const raw = given[need.slot];
        const start = hhmmToMin(raw);
        if (start == null) return { ok: false, error: "missingtime" };
        if (start + need.minutes > 1439) return { ok: false, error: "badtime" };
        // WHICH KIND OF TIME THIS IS, decided here rather than taken from the
        // client. It only drives the sheet's footnote, but "you typed this" is
        // a claim about where a figure on a signed document came from and a
        // browser does not get to assert it.
        const from = shortClock(start);
        const source =
          need.prefill && from === need.prefill ? "schedule"
            : need.suggest && from === need.suggest ? "gap"
              : "typed";
        list.push({
          slot: need.slot, kindOf: need.kindOf, minutes: need.minutes,
          from, to: shortClock(start + need.minutes), source,
        });
      }
      statedBreaks = list;
    }

    resolved.push({ q, choice: a.choice, stated, statedBreaks });
  }

  // record the answers first, so rebuilding the overrides below sees them
  for (const { q, choice: pick, stated, statedBreaks } of resolved) {
    const kindKey = `q_${q.kind}`;
    const dates = q.dates || [q.date];
    for (const date of dates) {
      const existing = await prisma.timesheetCorrection.findFirst({
        where: { timesheetId: ts.id, date, kind: kindKey },
        select: { id: true },
      });
      const record = {
        status: pick === "yes" ? "accepted" : "declined",
        resolvedAt: new Date(),
        resolvedById: ts.userId || null,
        note: `Asked about the ${date} ${QUESTION_NOUN[q.kind]}.`,
        resolutionNote: resolutionFor(q, pick, stated, statedBreaks),
        // cleared on a "no", so changing your mind from yes does not leave
        // times on the record for breaks you have since said you never got
        statedBreaks: pick === "yes" ? statedBreaks : null,
      };
      if (existing) {
        await prisma.timesheetCorrection.update({ where: { id: existing.id }, data: record });
      } else {
        await prisma.timesheetCorrection.create({
          data: { timesheetId: ts.id, date, kind: kindKey, ...record },
        });
      }
    }
  }

  // rebuild EVERY override from every answer on record, this one included
  const answers = await prisma.timesheetCorrection.findMany({
    where: { timesheetId: ts.id, kind: { startsWith: "q_" }, status: { not: "open" } },
    select: { date: true, kind: true, status: true, resolutionNote: true, statedBreaks: true },
  });
  const overrides = {};
  for (const q2 of questions) {
    for (const date of q2.dates || [q2.date]) {
      const a = answers.find((x) => x.date === date && x.kind === `q_${q2.kind}`);
      if (!a) continue;
      const day = (ts.data?.days || []).find((d) => d.date === date);
      const patch = patchesFor(q2, a.status === "accepted" ? "yes" : "no", day);
      const clean = Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v != null),
      );
      if (Object.keys(clean).length) {
        overrides[date] = { ...(overrides[date] || {}), ...clean };
      }
      // THE TIMES COME BACK FROM THE ANSWER, not from the override that wrote
      // them. Overrides are rebuilt from scratch on every reply, so anything
      // held only in the blob is dropped the moment somebody answers a
      // different question - which is what happened to `statedRest` until
      // 2026-08-10. Kept on the correction row, they survive every rebuild.
      //
      // MERGED, NOT REPLACED, since the split on 2026-08-10. A day short both a
      // meal and its rests now has TWO answer rows, each carrying its own times.
      // Assigning here would have let whichever ran second silently drop the
      // other's - the lunch time vanishing off a sheet somebody then signs.
      // De-duped by slot so a rebuild cannot stack the same break twice.
      if (Array.isArray(a.statedBreaks) && a.statedBreaks.length) {
        const merged = [...(overrides[date]?.statedBreaks || []), ...a.statedBreaks];
        const bySlot = new Map(merged.map((b) => [b.slot, b]));
        overrides[date] = { ...(overrides[date] || {}), statedBreaks: [...bySlot.values()] };
      }
    }
  }
  // the employee's own time rides on the day row, same as before
  for (const { q, stated } of resolved) {
    if (stated && q.date) {
      overrides[q.date] = { ...(overrides[q.date] || {}), statedRest: stated };
    }
  }

  // ONE REBUILD, whatever came in. A thirteen day card rebuilding the sheet
  // thirteen times is why the batch shape exists.
  const rebuilt = await rebuildSheetFor(ts, overrides, { keepSent: true });
  if (!rebuilt.ok) return rebuilt;

  revalidatePath(`/t/${token}`);
  return { ok: true, answered: resolved.length };
}

const QUESTION_NOUN = {
  repair: "rest entry we could not read",
  restIsMealLength: "thirty minute break filed as a rest",
  restNoTimes: "rest entry recorded with no times",
  restOutsideShift: "rest recorded outside the rostered day",
  restAtServiceEdge: "rest logged against the edge of its own service",
  nothingDocumented: "day with no break recorded at all",
  // split per part 2026-08-10, so the audit note names which break was asked
  // about rather than "the day"
  nothingDocumentedMeal: "meal break with nothing recorded",
  nothingDocumentedRest: "rest periods with nothing recorded",
  shortMealRest: "ten minute meal block read as a rest period",
  restTooLongOffClock: "break too long to be a rest, on a day whose meal is accounted for",
};

function resolutionFor(q, choice, stated, statedBreaks) {
  const yes = choice === "yes";
  switch (q.kind) {
    case "repair":
      return yes
        ? stated
          ? `Employee confirmed the break was taken but gave their own time: ${stated.from} to ${stated.to}. Rest premium removed for this day.`
          : `Employee confirmed the break was taken; read as ${q.proposed.from} to ${q.proposed.to}. Rest premium removed for this day.`
        : "Employee said the break was not taken. Premium stands and the QSP entry still needs correcting.";
    case "restIsMealLength":
      return yes
        ? "Employee confirmed the thirty minute entry was their meal break. Meal premium removed for this day."
        : "Employee said it was a rest break, not their meal. Meal premium stands.";
    case "restNoTimes":
      return yes
        ? stated
          ? `Employee confirmed the break was taken at ${stated.from} to ${stated.to}. Rest premium removed for this day.`
          : "Employee confirmed the break was taken. Rest premium removed for this day."
        : "Employee said the break was not taken. Premium stands.";
    case "restOutsideShift":
      return yes
        ? "Employee confirmed the time was entered wrongly and they were not on a break then. The minutes have been taken back off."
        : "Employee said the break really was taken at that time, off the clock. The minutes stand as paid.";
    case "nothingDocumented":
      // THE TIMES GO IN THE NOTE, not just on the day row. This note is the
      // audit trail payroll reads, and "they said they took them" without the
      // times is the same record-keeping hole this question exists to close.
      return yes
        ? "Employee confirmed they took their breaks and did not record them" +
          ((statedBreaks || []).length
            ? `, at ${statedBreaks
                .map((b) => `${b.kindOf === "meal" ? "meal" : "rest"} ${b.from}-${b.to}` +
                  (b.source === "typed" ? " (given by the employee)" : " (from their schedule, accepted)"))
                .join(", ")}`
            : "") +
          ". No premium owed, per the signed acknowledgment that recording them is theirs to do."
        : "Employee says they did not get their breaks. Premium restored for the days concerned - one hour for a missed meal and one for missed rests, per UPS v. Superior Court.";
    // ONE BREAK, ONE ANSWER, ONE HOUR. Split from the combined kind above on
    // 2026-08-10 so a day short both can be answered honestly either way. The
    // note names the specific break, because payroll reads these and "their
    // breaks" no longer says which.
    case "nothingDocumentedMeal":
    case "nothingDocumentedRest": {
      const noun = q.kind === "nothingDocumentedMeal" ? "meal break" : "rest periods";
      if (!yes) {
        return `Employee says they did not get their ${noun} that day. One hour of premium restored, per UPS v. Superior Court.`;
      }
      const when = (statedBreaks || []).length
        ? `, at ${statedBreaks
            .map((b) => `${b.from}-${b.to}` +
              (b.source === "typed" ? " (given by the employee)" : " (from their schedule, accepted)"))
            .join(", ")}`
        : "";
      return `Employee confirmed they took their ${noun} and did not record ${
        q.kind === "nothingDocumentedMeal" ? "it" : "them"
      }${when}. No premium owed, per the signed acknowledgment that recording them is theirs to do.`;
    }
    case "restTooLongOffClock":
      // NEITHER ANSWER MOVES A FIGURE. The row was already not counted and the
      // day already stands as it stands; this exists so the record says what
      // happened rather than the entry being binned unexamined.
      return yes
        ? "Employee confirmed this was a real break they took. Recorded as taken; no change to hours or premium."
        : "Employee says the entry was a mistake. Flagged for payroll as a mis-entry; no change to hours or premium.";
    case "restAtServiceEdge":
      return yes
        ? "Employee confirmed the break belonged inside the service and was logged against its edge by mistake. The minutes have been taken back off."
        : "FLAG FOR PAYROLL: employee says the break really was taken outside the service, so the ten is being entered against the wrong shift in QSClock. The minutes stand as paid.";
    case "shortMealRest":
      return yes
        ? "Employee confirmed the short meal block was their rest period. Credit stands."
        : "Employee said it was not their rest period. The credit has been removed and any premium restored.";
    default:
      return "";
  }
}

// employee-side: store the signed PDF against their timesheet. called from the
// token page, so it takes the token rather than a session.
export async function submitSignedTimesheet({ token, pdfBase64, signedName }) {
  const { verifyTimesheetToken } = await import("@/lib/timesheet-token");
  const id = verifyTimesheetToken(token);
  if (!id) return { ok: false, error: "auth" };

  const ts = await prisma.timesheet.findUnique({
    where: { id },
    select: { id: true, batchId: true, signedAt: true, disputedAt: true },
  });
  if (!ts) return { ok: false, error: "auth" };
  if (ts.signedAt) return { ok: false, error: "already" };
  // you shouldn't attest to a document you've told us is wrong. the page hides
  // the signer while a report is open; this is the server-side half of that.
  if (ts.disputedAt) return { ok: false, error: "disputed" };
  if (typeof pdfBase64 !== "string" || pdfBase64.length < 100) return { ok: false, error: "nofile" };
  if (pdfBase64.length > 8_000_000) return { ok: false, error: "toobig" };

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  let signedPdfUrl = null;
  if (hasBlobStorage()) {
    try {
      const key = `timesheets/signed/${randomBytes(12).toString("hex")}.pdf`;
      const blob = await putBlob(key, Buffer.from(pdfBase64, "base64"), {
        access: "public",
        contentType: "application/pdf",
      });
      signedPdfUrl = blob.url;
    } catch (e) {
      console.error("signed timesheet upload failed:", e);
      return { ok: false, error: "store" };
    }
  }

  await prisma.timesheet.update({
    where: { id },
    data: {
      signedAt: new Date(),
      signedPdfUrl,
      signedName: (signedName || "").toString().slice(0, 120) || null,
      signedIp: ip,
    },
  });

  revalidatePath(`/portal/admin/timesheets/${ts.batchId}`);
  return { ok: true };
}
