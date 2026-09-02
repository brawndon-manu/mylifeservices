"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { putBlob, hasBlobStorage } from "@/lib/blob";
import { prisma } from "@/lib/prisma";
import { futureDates, trimDays, isoDate } from "@/lib/timesheet/partial";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets, isSuper } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import {
  parseTimesheetPdf,
  analyzeTimesheet,
  applyOvertime,
  reentitle,
  restsTakenFrom,
  analyzeDay,
  punchCoverage,
} from "@/lib/timesheet/parse";
import { reviewSheet, repairConfirmedDays } from "@/lib/timesheet/anomalies";
import { buildQuestions, patchesFor, restTimeFits, mealTimeFits, MEAL_MIN_MINUTES, collidesWithRecorded, shiftAlreadyHasTen } from "@/lib/timesheet/questions";
// the reported-problem card reads times the same loose way the question cards
// do, and this is the server's own reading of what that box was sent
import { parseLooseTime } from "@/lib/loose-time";
// the one spelling of a break answer's key, shared with the admin day-by-day so
// a reason taken on a call and a reason they typed land on the same row
import {
  breakFindingKey, reasonOwedOn, reasonSlotFor, resetAction,
} from "@/lib/timesheet/break-answers";
// who is actually holding the employee's page when an answer arrives - see the
// note in answer-actor.js for why the default is always the employee
import { answerActorId, actorKindFor } from "@/lib/timesheet/answer-actor";
import { batchForceTo } from "@/lib/timesheet-mode";
import { storedDay, totalsFromDays } from "@/lib/timesheet/stored";
// the approval stamp's placement, read off the signed bytes themselves - see
// the note in approval-anchor.js for why the stored rect cannot be trusted
import { findApprovalAnchor } from "@/lib/timesheet/approval-anchor";
import { questionNoun } from "@/lib/timesheet/question-nouns";
// asked before the upload writes anything, because the database's own answer to
// this arrives as an error code with no person attached
import { unstorable, unstorableRows } from "@/lib/timesheet/storable";
import {
  parseSchedulePdf, scheduleKey, compareToSchedule, scheduleBlocks,
} from "@/lib/timesheet/schedule";
import { parseClockReport, clockShifts, clockKey, clockCoverage, gradePremiums } from "@/lib/timesheet/clock";
import { attendanceFindings } from "@/lib/timesheet/compliance";
import { parseRestReport, restKey, restNameFor, restRowTimes, allRestRows, clockMin, serviceFit, countsAsTaken, FULL_REST_MIN } from "@/lib/timesheet/rests";
import { reanalyzeDays, restWindowsByDate } from "@/lib/timesheet/reanalyze";
import { parsePayrollReport, payrollTotals, payrollKey } from "@/lib/timesheet/payroll";
import { parseServiceNotesPdf } from "@/lib/timesheet/service-notes";
import { parseServiceNotesXls, mergeNotes } from "@/lib/timesheet/service-notes-xls";
import { parseScheduleNotesXls } from "@/lib/timesheet/schedule-notes";
import { indexByAccount, lookupAcross, suggestAlias } from "@/lib/timesheet/identity";
import { renderCorrected } from "@/lib/timesheet/render";
import { matchEmployee } from "@/lib/timesheet/match";
import { signTimesheetToken } from "@/lib/timesheet-token";
// so the employee's own page moves when a reviewer changes something while they
// are on the phone about it - see LiveRefresh
import { bumpSheetVersion, bumpBatchVersion } from "@/lib/timesheet-presence";
import { supersededBy, supersededByForTimesheet, refusal } from "@/lib/timesheet/superseded";
import { sendTimesheet, isLiveSend, liveSendConfigured } from "@/lib/timesheet-send";
import { sendCorrectionAlert } from "@/lib/timesheet-correction-email";
// the signed copy going back, and the review record it carries
import { sendSignedTimesheetCopy } from "@/lib/timesheet-signed-email";
import { reviewChoices } from "@/lib/timesheet/qsp-changes";
// the day-program review's time-off question: what a valid answer is, and the
// lines it adds to both review emails
import { TIME_OFF_KIND, TIME_OFF_STATUS, cleanTimeOffEntries, timeOffReviewItems } from "@/lib/timesheet/time-off";
import { sendReviewCorrections, resolveReviewRecipients } from "@/lib/timesheet-review-email";
import { notifyOversight } from "@/lib/notify";
import { progressKey, setProgress } from "@/lib/timesheet-progress";
import { pushRecent } from "@/lib/timesheet-stages";
import { companyDate } from "@/lib/company-time";
import {
  isCorrectionKind,
  CORRECTION_KINDS,
  patchFor,
  mergeOverride,
  claimedTimesPatch,
  reviewerSettledDates,
  MISC_PATCH_FIELDS,
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

  // WHICH BATCH THIS IS A CORRECTION TO, when it is one. Empty for an ordinary
  // upload, which is every path below until the write itself.
  const intoBatchId = (formData.get("into") || "").toString().trim() || null;
  // EVERY REFUSAL COMES BACK TO THE FORM IT WAS SENT FROM. Eighteen of these
  // named the plain upload page, so a correction that tripped any early check -
  // wrong file, unreadable export - came back as a fresh full upload with the
  // batch it was meant to land on silently dropped. Identical for an ordinary
  // upload, which carries no `into`.
  const NEW = `/portal/admin/timesheets/new?${intoBatchId ? `into=${intoBatchId}&` : ""}`;

  // A FILE ARRIVES ONE OF TWO WAYS NOW. As the picked File riding the form
  // POST - the way it always has - or as a reference to a blob the browser
  // already uploaded straight to storage. The second exists because one
  // request carrying eight exports runs to 30MB+, which Vercel's 4.5MB
  // serverless body cap refuses in production and the preview pane chokes on
  // locally - so the big bytes go browser-to-Blob and this request stays tiny.
  // Only our own blob store is fetched from; anything else is refused.
  const blobRefs = (() => {
    try { return JSON.parse((formData.get("blobs") || "null").toString()) || null; }
    catch { return null; }
  })();
  const BLOB_HOST = /\.blob\.vercel-storage\.com$/i;
  const pickOf = (name) => {
    const b = blobRefs?.[name];
    if (b && typeof b.url === "string") {
      let host = null;
      try { host = new URL(b.url).hostname; } catch {}
      if (!host || !BLOB_HOST.test(host)) redirect(`${NEW}error=blob`);
      return { name: String(b.name || ""), size: Number(b.size) || 0, url: b.url, file: null };
    }
    const f = formData.get(name);
    return f && typeof f === "object" && "size" in f && f.size > 0
      ? { name: f.name || "", size: f.size, url: null, file: f }
      : null;
  };
  // the bytes, from whichever side the file came in on
  const bytesOfPick = async (pk) => {
    if (pk.file) return new Uint8Array(await pk.file.arrayBuffer());
    const res = await fetch(pk.url);
    if (!res.ok) throw new Error(`stored file fetch failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };

  const file = pickOf("file");
  if (!file) {
    redirect(`${NEW}error=nofile`);
  }
  const pdfNamed = (pk) => !pk.name || /\.pdf$/i.test(pk.name);
  if (file.file ? (file.file.type && file.file.type !== "application/pdf") : !pdfNamed(file)) {
    redirect(`${NEW}error=notpdf`);
  }

  // All three exports are required now, and that is a deliberate change.
  //
  // Measured on 07/16-07/31: of 622 premium hours, the clock export evidences
  // 386 and the schedule corroborates a further 215, leaving 21 that need a
  // person. Without both files that same batch is 622 hours resting on one
  // source. An upload that can't be stood behind isn't worth the time it takes
  // to generate, so it's refused rather than half-done.
  const schedFile = pickOf("schedule");
  const hasSched = !!schedFile;
  if (!hasSched) redirect(`${NEW}error=noschedule`);

  // The Simple Payroll Processing Report: QSP's OWN regular, overtime and
  // double-time totals per employee. It is what settles a disagreement about
  // overtime without anybody re-reading a PDF, and it reconciles with the
  // timesheet exactly - so a mismatch means one of the two files is from a
  // different pull, which is worth knowing before 59 sheets go out.
  const payFile = pickOf("payroll");
  if (!payFile) redirect(`${NEW}error=nopayroll`);

  // The Rest Periods Report is back. It was briefly dropped with the move to
  // three reports, and that took every rest premium with it: nothing else
  // records a rest break, so all 549 qualifying days came back unanswerable.
  // It is the only definitive source for the bigger half of the premium total.
  const restFile = pickOf("rests");
  if (!restFile) redirect(`${NEW}error=norests`);

  // QSClock came back on 2026-08-22, optional. It was held out on 08-06 when the
  // export set was cut to three, and the columns below are why it returned:
  // "we can get data about if they clock into their service shift, clck out, if
  // they were geofenced."
  //
  // OPTIONAL, so every batch uploaded without one still works exactly as it has
  // since August: null means no punch is graded clocked-vs-typed and no
  // attendance finding exists, which every reader below already handles.
  const clockFile = pickOf("clock");

  // THE THREE NOTES EXPORTS, 2026-08-27. Mánu: "i want to be able to upload all
  // of this info just to the timesheets page. and the audit card and more to
  // come can just get it from that info."
  //
  // Optional, all three, exactly like the clock export above. A period should
  // still upload when one of them is not ready, and a missing report means
  // nothing was documented ONE WAY - never that nothing was documented.
  const notesFile = pickOf("notes");
  const serviceNotesFile = pickOf("serviceNotes");
  const scheduleNotesFile = pickOf("scheduleNotes");

  // the browser made this id up before submitting, so it can poll for progress
  // while this action runs. namespaced under the user inside progressKey - it is
  // never trusted as a key by itself. A null key makes every write a no-op, so
  // an upload with no id behaves exactly as it did before.
  // TESTING A PERIOD THAT HAS NOT ENDED. Off unless the box is ticked, and what
  // it does is drop days - never widen what counts.
  //
  // THE RANGE IS TYPED BECAUSE THE EXPORT DOES NOT CARRY IT. Mánu 2026-08-12:
  // "on QSP, I put August first to August ninth, and it still spit out
  // everything else." QSP snaps to whole pay periods, so the file says
  // 08/01-08/15 whatever was asked for, and the only record of the intended
  // window is the person who typed it. Both ends optional: no end means today.
  const wantPartial = formData.get("partial") === "on";
  const partialFromInput = isoDate((formData.get("partialFrom") || "").toString());
  const partialToInput = isoDate((formData.get("partialTo") || "").toString());
  if (wantPartial && partialFromInput && partialToInput && partialFromInput > partialToInput) {
    redirect(
      `${NEW}error=range&why=${encodeURIComponent(
        "the start of the range is after its end",
      )}`,
    );
  }

  const prog = progressKey(user.id, formData.get("uploadId"));
  // the whole reported state, held here so each write is a single set
  const P = { stage: "reading", done: 0, total: null, recent: [] };
  await setProgress(prog, P);

  let bytes;
  try {
    bytes = await bytesOfPick(file);
  } catch (e) {
    console.error("timesheet source read failed:", e);
    redirect(`${NEW}error=blob`);
  }

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
      `${NEW}error=parse&why=${encodeURIComponent(parseError)}`,
    );
  }
  const withHours = sheets.filter((s) => !s.empty);
  if (!withHours.length) {
    // it read fine but held no timesheet rows - usually the wrong export, or a
    // corrected sheet uploaded back into the tool by mistake.
    redirect(
      `${NEW}error=empty&why=${encodeURIComponent(
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
  //
  // UNLESS THE UPLOAD SAYS IT IS A PARTIAL PERIOD ON PURPOSE. Mánu 2026-08-11 is
  // testing partial weeks while August is still running, so the box on the form
  // trims the days that have not happened instead of refusing the file. Both
  // paths ask `partial.js` what "future" means, so the day the guard would have
  // refused and the day the trim removes are always the same day.
  let partialDropped = [];
  let partialFrom = null;
  let partialThrough = null;
  const future = futureDates(withHours);
  if (future.size && !wantPartial) {
    const sample = [...future].sort().slice(0, 3).join(", ");
    redirect(
      `${NEW}error=future&why=${encodeURIComponent(
        `${future.size} dated after today (${sample}). Wait until the pay period has ended, ` +
          `or tick "partial pay period" to drop them and keep what has been worked.`,
      )}`,
    );
  }
  // RUN ON EVERY PARTIAL UPLOAD, not only one holding future days. The range is
  // the point of the box now: asking QSP for 08/01-08/09 returns the whole
  // period, and the days to trim off the FRONT of that are all in the past, so
  // gating this on `future.size` would silently ignore the start date on any
  // export pulled after the period ended.
  if (wantPartial) {
    const trimmed = trimDays(withHours, { from: partialFromInput, to: partialToInput });
    partialDropped = trimmed.dropped;
    partialFrom = trimmed.from;
    partialThrough = trimmed.through;
    withHours.length = 0;
    withHours.push(...trimmed.sheets);
    console.log(
      `partial period: kept ${partialFrom} to ${partialThrough}, dropped ` +
        `${trimmed.dropped.length} date(s) and ${trimmed.droppedPeople} employee(s) ` +
        `with nothing in range${trimmed.clamped ? " (end date pulled back to today)" : ""}`,
    );
    if (!withHours.length) {
      redirect(
        `${NEW}error=empty&why=${encodeURIComponent(
          "no day in that export falls inside the range you picked, so there is nothing to generate from",
        )}`,
      );
    }
    P.total = withHours.length;
    await setProgress(prog, P);
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
      `${NEW}error=twoperiods&why=${encodeURIComponent(
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
      `${NEW}error=punches&why=${encodeURIComponent(
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
    redirect(`${NEW}error=noblob`);
  }
  if (file.url) {
    // the browser already put it in the store; that copy IS the kept source
    sourceUrl = file.url;
  } else {
    try {
      const key = `timesheets/source/${randomBytes(10).toString("hex")}.pdf`;
      const blob = await putBlob(key, Buffer.from(bytes), {
        access: "public",
        contentType: "application/pdf",
      });
      sourceUrl = blob.url;
    } catch (e) {
      console.error("timesheet source upload failed:", e);
      redirect(`${NEW}error=blob`);
    }
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
    const sbytes = await bytesOfPick(schedFile);

    // keep the file itself, not just what we read out of it. the checks screen
    // quotes this document back at people and asks them to act on it, so they
    // need to be able to open the page it came off. stored before the parse so
    // a file that FAILED to parse can still be looked at. A client-uploaded
    // blob is already stored - that copy is the kept one.
    if (schedFile.url) {
      scheduleUrl = schedFile.url;
    } else try {
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
  // normalised shifts from the same file, for monitoring. Empty when no clock
  // export was uploaded, which is not the same as everybody clocking - see
  // `attendanceFindings`, which is only ever asked about shifts that exist.
  let clockRows = [];
  if (clockFile) {
    P.stage = "clock";
    await setProgress(prog, P);
    const cbytes = await bytesOfPick(clockFile);
    if (clockFile.url) {
      clockUrl = clockFile.url;
    } else try {
      const key = `timesheets/clock/${randomBytes(10).toString("hex")}.xls`;
      const blob = await putBlob(key, Buffer.from(cbytes), {
        access: "public",
        contentType: "application/vnd.ms-excel",
      });
      clockUrl = blob.url;
    } catch (e) {
      console.error("clock report upload failed:", e);
    }
    try {
      clocks = parseClockReport(Buffer.from(cbytes));
      clockRows = clockShifts(Buffer.from(cbytes));
      console.log(
        `clock parsed: ${clocks.size} employees, ${clockRows.length} shifts, ` +
          `${clockRows.filter((r) => r.noIn).length} never clocked into, ` +
          `${clockRows.filter((r) => r.gpsIn === "no" || r.gpsOut === "no").length} clocked with no GPS`,
      );
    } catch (e) {
      // OPTIONAL MEANS OPTIONAL. A clock export that will not read must not cost
      // the batch: the hours, the premiums and every figure people are paid on
      // come from the other documents, and refusing here would hold up a payroll
      // over a monitoring extra.
      console.error("clock parse failed:", e);
      clocks = null;
      clockRows = [];
    }
  }

  // THE THREE NOTES EXPORTS. None of them touches an hour or a premium: they
  // are what the Audit screen reads, and every figure people are paid on comes
  // off the documents above. So a notes export that will not read is logged and
  // dropped rather than costing a payroll - the same rule the clock export has.
  //
  // TWO REPORTS OF SERVICE NOTES, MERGED, because they are two places a note
  // gets written rather than one report and a broken copy of it. Mánu
  // 2026-08-27: "field supervisors dont do daily service notes. they input
  // their notes in the service notes and schdule notes." Of the 862 billable
  // service shifts on 08/16-08/27 the Daily Service Notes PDF documents 660,
  // the Employee Service Notes .xls 192, and the two together 793.
  let notesUrl = null;
  let serviceNotesUrl = null;
  let scheduleNotesUrl = null;
  let mergedNotes = [];
  let pdfNoteCount = 0;
  let xlsNoteCount = 0;
  if (notesFile || serviceNotesFile || scheduleNotesFile) {
    P.stage = "notes";
    await setProgress(prog, P);
  }
  if (notesFile) {
    const nbytes = await bytesOfPick(notesFile);
    if (notesFile.url) {
      notesUrl = notesFile.url;
    } else try {
      const key = `timesheets/notes/${randomBytes(10).toString("hex")}.pdf`;
      const blob = await putBlob(key, Buffer.from(nbytes), {
        access: "public",
        contentType: "application/pdf",
      });
      notesUrl = blob.url;
    } catch (e) {
      console.error("service notes upload failed:", e);
    }
    try {
      const read = await parseServiceNotesPdf(nbytes);
      pdfNoteCount = read.length;
      mergedNotes = read;
      console.log(`service notes pdf parsed: ${read.length} notes`);
    } catch (e) {
      console.error("service notes pdf parse failed:", e);
    }
  }
  if (serviceNotesFile) {
    const xbytes = await bytesOfPick(serviceNotesFile);
    if (serviceNotesFile.url) {
      serviceNotesUrl = serviceNotesFile.url;
    } else try {
      const key = `timesheets/service-notes/${randomBytes(10).toString("hex")}.xls`;
      const blob = await putBlob(key, Buffer.from(xbytes), {
        access: "public",
        contentType: "application/vnd.ms-excel",
      });
      serviceNotesUrl = blob.url;
    } catch (e) {
      console.error("service notes xls upload failed:", e);
    }
    try {
      const read = parseServiceNotesXls(Buffer.from(xbytes));
      xlsNoteCount = read.length;
      mergedNotes = mergeNotes(mergedNotes, read);
      console.log(
        `service notes xls parsed: ${read.length} notes, ` +
        `${mergedNotes.length} after merging with the pdf's ${pdfNoteCount}`,
      );
    } catch (e) {
      console.error("service notes xls parse failed:", e);
    }
  }
  if (scheduleNotesFile) {
    const sbytes2 = await bytesOfPick(scheduleNotesFile);
    if (scheduleNotesFile.url) {
      scheduleNotesUrl = scheduleNotesFile.url;
    } else try {
      const key = `timesheets/schedule-notes/${randomBytes(10).toString("hex")}.xls`;
      const blob = await putBlob(key, Buffer.from(sbytes2), {
        access: "public",
        contentType: "application/vnd.ms-excel",
      });
      scheduleNotesUrl = blob.url;
    } catch (e) {
      console.error("schedule notes upload failed:", e);
    }
    // PARSED ONLY TO CHECK IT READS. 4ms for a fortnight, so the screens that
    // want it read it back off Blob rather than carrying 87KB on the batch.
    try {
      const read = parseScheduleNotesXls(Buffer.from(sbytes2));
      console.log(`schedule notes parsed: ${read.length} notes`);
    } catch (e) {
      console.error("schedule notes parse failed:", e);
    }
  }

  // the rest report. refused rather than skipped: a batch missing it silently
  // loses every rest premium, and nothing on screen would say why.
  let rests = null;
  let restsUrl = null;
  let restsMalformed = [];
  let restsByDate = [];
  {
    P.stage = "rests";
    await setProgress(prog, P);
    const rbytes = await bytesOfPick(restFile);
    if (restFile.url) {
      restsUrl = restFile.url;
    } else try {
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
        `${NEW}error=restparse&why=${encodeURIComponent(
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
    const pbytes = await bytesOfPick(payFile);
    if (payFile.url) {
      payrollUrl = payFile.url;
    } else try {
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
        `${NEW}error=payrollparse&why=${encodeURIComponent(
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
      `${NEW}error=schedule&why=${encodeURIComponent(
        `the schedule covers ${scheduleCovers} of the ${withHours.length} people on the timesheet` +
          ` - meal periods cannot be evidenced for the rest, so the premium total would be far too low`,
      )}`,
    );
  }

  // NOTHING IS WRITTEN UNTIL EVERY SHEET IS READY.
  //
  // This row used to be created here, before a single sheet had been generated,
  // and the sheets were then written one at a time with nothing catching a
  // database refusal. On 2026-08-15 one invisible character in the 25th of 60
  // people's rows ended the action where it stood and left a 24-sheet corpse -
  // four times over, once per attempt. Each corpse was a NEWER upload of
  // 08/01-08/15, and `supersededBy` asks only which batch is newest, not how
  // much of one arrived, so the real 60-sheet batch went read-only four times.
  //
  // So the row is built here and INSERTED AT THE BOTTOM, in one transaction
  // with its sheets. A failure anywhere in the generating loop now leaves the
  // database exactly as it was, which is the state the error message has
  // claimed all along.
  const batchData = {
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
    notesUrl,
    notesName: notesUrl ? notesFile?.name || null : null,
    serviceNotesUrl,
    serviceNotesName: serviceNotesUrl ? serviceNotesFile?.name || null : null,
    scheduleNotesUrl,
    scheduleNotesName: scheduleNotesUrl ? scheduleNotesFile?.name || null : null,
    // whether the live-send PHRASE was set when this batch was made. Not the
    // send gate: that also requires being on the real deployment, and a big
    // upload has to be run from localhost because of Vercel's 4.5MB body cap,
    // so gating the badge on the environment would mark every real batch
    // "test" purely because of where it was uploaded from.
    testMode: !liveSendConfigured(),
    // uploaded mid-period with the unworked days trimmed off. The hours here
    // are a partial record and the last workweek is cut off mid-week, so its
    // >40 overtime is provisional in exactly the way a period boundary makes
    // it provisional - and six weeks from now nothing else on this row would
    // say the file was ever incomplete.
    partialPeriod: partialDropped.length > 0,
    partialFrom,
    partialThrough,
    uploadedById: user.id,
  };

  // every sheet this upload will write, held until all of them exist. 60 of
  // them is 1.18MB of json on the current period, which is nothing beside the
  // four exports already in memory.
  const sheetRows = [];

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
  // WHAT THE CLOCK EXPORT SAW, gathered per person and written to the BATCH.
  // Never to a sheet - see the note on `clockFindings` in the schema. Keyed by
  // the timesheet's own spelling, so a screen holding a sheet can find its row
  // without this export having stamped anything on that sheet.
  const clockByPerson = {};

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
  //
  // AS THE ROW READS, NOT AS IT WAS TYPED. `restRowTimes` applies the repair and
  // un-reverses the row, which is what every screen and the signed sheet have
  // always drawn - and what this, the one place the ENGINE reads the times, did
  // not. Espinoza 08/05 is the shape: a 4:00 AM rest the classifier had already
  // corrected to 4:00 PM with `fits: true`, measured here at 4:00 AM against a
  // 3:40-5:10 PM shift and so counted as taken outside it. The document drew the
  // break inside his shift and the cards beside it called it outside one.
  //
  // A row still unreadable after that is skipped exactly as before: a window
  // nobody can place is worse than no window, because `restsOutsideShift` reads
  // absence as "not outside" and a wrong pair of minutes as fact.
  const restWindows = new Map();
  for (const row of restsByDate) {
    if (!row.counted || !row.date) continue;
    const t = restRowTimes(row);
    const out = clockMin(t.from);
    const inn = clockMin(t.to);
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

    // The export's entire contribution to this upload, collected rather than
    // attached. Matched through the same `clockHit` the alias work above
    // resolved, so one person is never two people across two readings of one
    // file. `matched: false` is the honest record for somebody the export has
    // no rows for - which is not the same as somebody who clocked everything.
    if (clockRows.length) {
      const mine = clockRows.filter(
        (r) => r.key === clockKey(clk?.name || clockHit.via || t.employee),
      );
      clockByPerson[t.employee] = {
        matched: mine.length > 0,
        shifts: mine.length,
        findings: attendanceFindings(mine),
      };
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
      // WITHHELD ON PURPOSE. Mánu 2026-08-22: "the new report shouldnt do
      // anything to the timesheet its jsut for us to observe for now."
      //
      // Grading a premium "recorded" because the day was clocked is the one
      // thing clock data was ever allowed to move, and it does move it:
      // uploading 08/16-08/22 with the export and without it changed no hour,
      // no premium and no day on any of 62 sheets, but shifted 19 of them from
      // unverified to recorded. That is a real change to a stored figure, so
      // it waits for a decision rather than arriving as a side effect.
      //
      // Passing null is not a new behaviour: every batch before 2026-08-22 had
      // no clock export at all, so this is exactly what they all did. The
      // export's whole contribution stays in `attendance`, which nothing reads
      // but the admin screens.
      //
      // To turn it on, this becomes `clk?.byDate || null` again - one line, and
      // the reason it is off is above it.
      clockDays: null,
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
          // the rest report's own spelling, straight from the match that already
          // happened above. `readAs.rests` below is the same string stored, and
          // it is what every later render resolves through `restNameFor`.
          restName: rest?.name || t.employee,
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
    // gathered, not written - see the note on batchData. The batch id is the
    // one field that cannot be filled in yet, and it is added at the insert.
    sheetRows.push({
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
        // MILES DRIVEN, from the payroll report's own column. Stored on the
        // sheet because it is a per-person figure and the parsed report is
        // otherwise thrown away the moment the upload finishes - the map is
        // built, logged and dropped, so nothing could show it later.
        //
        // Null where the report was not uploaded or did not carry the column,
        // which is not the same as zero miles - see `hasMiles`. Matched on the
        // report's own spelling of the name through `payrollKey`, the same key
        // `reconcile` joins on.
        qspMiles: payroll?.hasMiles
          ? (payroll.get(payrollKey(t.employee || ""))?.miles ?? null)
          : null,
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
            // the clock export names nobody on a sheet - see `clock` below
            clock: null,
            rests: restHit.via
              ? { name: restHit.via, confidence: restHit.confidence, exact: restHit.exact }
              : null,
            schedule: schedHit.via
              ? { name: schedHit.via, confidence: schedHit.confidence, exact: schedHit.exact }
              : null,
          },
          // NOT WRITTEN FROM THE CLOCK EXPORT ANY MORE, 2026-08-22. It used to
          // carry that person's clock picture onto their sheet; the export is
          // observation only now and puts everything on the batch instead, in
          // `clockFindings`. Kept as the shape readers expect, saying the one
          // honest thing left: this sheet holds no clock data.
          clock: { matched: false },
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

  // ---- the one write, asked about first and then made all at once ----

  // WHO WOULD THE DATABASE REFUSE, ANSWERED BEFORE IT IS ASKED. A jsonb value
  // may not hold a NUL or half a surrogate pair, and the exception that comes
  // back names neither the person nor the character - it is `22P05` and a stack
  // trace. `stripControl` takes these off the timesheet PDF at the point the
  // text comes off the page, but the schedule PDF and the two .xls reports feed
  // the same record and have no such pass, so this is the net under all four.
  const refused = [...unstorableRows(sheetRows)];
  // observation only, and on the batch rather than on anybody's sheet
  batchData.clockFindings = clockRows.length
    ? {
        name: clockFile?.name || null,
        shifts: clockRows.length,
        people: Object.keys(clockByPerson).length,
        byPerson: clockByPerson,
        // WHICH FILES THE PERIOD IS HOLDING, and where they are.
        //
        // The audit screen needs the shift rows themselves - "rostered 12p-3p,
        // clocked 12:08p-2:53p" needs the times, and no finding carries them -
        // and it reads them back off the file rather than out of this column.
        //
        // Storing them here was the obvious move and it is the wrong one: the
        // rows come to 225KB of JSON for a single week, and every query that
        // loads a batch without naming its columns would then carry half a
        // megabyte of them per period. Repeat patterns reads every batch there
        // has ever been. Re-reading the file costs 8ms, the batch row stays
        // small, and the export stays the only copy of what it said.
        //
        // A list rather than one, because the report is exported a week at a
        // time and a pay period is a fortnight.
        files: [
          {
            name: clockFile?.name || null,
            url: clockUrl,
            shifts: clockRows.length,
            ...clockCoverage(clockRows),
          },
        ],
      }
    : null;

  const badBatch = unstorable(batchData.restsByDate);
  if (badBatch) refused.push({ name: "the rest periods report", ...badBatch });
  // THE CLOCK FINDINGS GET THE SAME NET AND A DIFFERENT VERDICT.
  //
  // They carry text off a spreadsheet - client and service names, and the file
  // names beside them - into jsonb, where a NUL comes back as `22P05` and a
  // stack trace naming neither the person nor the character. The rest report
  // next door has had this net since the day that happened; this column never
  // did, and it is fed by the same kind of file.
  //
  // Refusing the upload over it would break the rule the parse above already
  // keeps: optional means optional, and the hours everybody is paid on come from
  // the other four documents. So the monitoring extra is dropped and the payroll
  // goes through, which is the same outcome as uploading without the file.
  const badClock = unstorable(batchData.clockFindings);
  if (badClock) {
    console.error(
      `clock export dropped: it carries ${badClock.what} - ${badClock.near}`,
    );
    batchData.clockFindings = null;
  }
  // THE SERVICE NOTES GET IT TOO, and for the same reason twice over: they are
  // free text somebody typed, and the 8/1-8/26 export carried a NUL beside a
  // print date. Dropped rather than refused - the Audit screen loses a period
  // of notes, the payroll goes through, and that is the same outcome as
  // uploading without the file.
  const badNotes = unstorable(mergedNotes);
  if (badNotes) {
    console.error(`service notes dropped: they carry ${badNotes.what} - ${badNotes.near}`);
    mergedNotes = [];
  }
  if (refused.length) {
    for (const r of refused) console.error(`timesheet upload refused: ${r.name} carries ${r.what} - ${r.near}`);
    redirect(
      `${NEW}error=unstorable&why=${encodeURIComponent(
        `${refused.map((r) => r.name).join(", ")} - ${refused[0].what}`,
      )}`,
    );
  }

  // ---- A RE-UPLOAD OF SOME PEOPLE, INTO THE BATCH THAT IS ALREADY OUT ----
  //
  // A handful of sheets are wrong and the rest are signed. Uploading a whole
  // new export to fix four of them replaces a batch fifty people have already
  // signed, and every one of those signatures is against a document that no
  // longer exists. This lands the correction on the batch already in flight
  // and touches nobody else.
  //
  // THE FILES DECIDE WHO. A QSP export pulled for four people contains four
  // people, so there is no list to tick and no name to mistype. Everything
  // above this point ran exactly as it does for a full upload - same parsers,
  // same matching, same analysis - and only the write is different.
  if (intoBatchId) {
    const target = await prisma.timesheetBatch.findUnique({
      where: { id: intoBatchId },
      select: {
        id: true, periodFrom: true, periodTo: true, program: true,
        restsByDate: true, createdAt: true,
      },
    });
    const back = (why) => redirect(
      `/portal/admin/timesheets/new?into=${intoBatchId}&error=partial&why=${encodeURIComponent(why)}`,
    );
    if (!target) back("that batch is gone");
    // THE SAME FORTNIGHT OR NOTHING. A file pulled for a different period would
    // otherwise overwrite four people's hours with somebody else's dates.
    if (target.periodFrom !== batchData.periodFrom || target.periodTo !== batchData.periodTo) {
      back(`this export is ${batchData.periodFrom} to ${batchData.periodTo}, that batch is ${target.periodFrom} to ${target.periodTo}`);
    }
    // A REPLACED UPLOAD IS READ ONLY, the same rule every other write here holds.
    const newer = await supersededBy(intoBatchId);
    if (newer) back("that upload has been replaced - re-upload into the current one");

    const existing = await prisma.timesheet.findMany({
      where: { batchId: intoBatchId },
      select: { id: true, sourceName: true, signedAt: true },
    });
    const byName = new Map(existing.map((r) => [restKey(r.sourceName || ""), r]));
    // ONLY PEOPLE ALREADY ON IT. Someone in the file who is not on the batch is
    // an ADDITION, not a correction, and the two want different confirmations -
    // so it is refused by name rather than quietly appended.
    const strangers = sheetRows
      .filter((r) => !byName.has(restKey(r.sourceName || "")))
      .map((r) => r.sourceName);
    if (strangers.length) back(`not on that batch: ${strangers.join(", ")}`);

    // THE REST ROWS MERGE BY NAME, THEY DO NOT REPLACE.
    //
    // `restsByDate` is one array for the whole batch and `rebuildSheetFor`
    // filters it per sheet, so writing this upload's rows over it would change
    // what all fifty-six untouched people rebuild from. Rows are dropped only
    // where the incoming file covers that name, and both spellings come from
    // the same report so they line up without any matching.
    const incoming = batchData.restsByDate || [];
    const covered = new Set(incoming.map((r) => restKey(r?.name || "")));
    const mergedRests = [
      ...(target.restsByDate || []).filter((r) => !covered.has(restKey(r?.name || ""))),
      ...incoming,
    ];

    const ids = sheetRows.map((r) => byName.get(restKey(r.sourceName || "")).id);
    try {
      await prisma.$transaction(async (tx) => {
        await tx.timesheetBatch.update({
          where: { id: intoBatchId },
          // ONLY the rest rows. The batch's file pointers are the provenance of
          // the upload the other people came from and stay pointing at it.
          data: { restsByDate: mergedRests.length ? mergedRests : null },
        });
        // THEIR ANSWERS GO WITH THEIR FIGURES. An answer explains a finding on
        // the document that raised it, and that document has just been
        // replaced. Break reasons are keyed on (program, period, person,
        // finding) rather than on the sheet, so those carry across untouched -
        // which is the half that cannot be reconstructed.
        await tx.timesheetCorrection.deleteMany({
          where: {
            timesheetId: { in: ids },
            OR: [{ kind: { startsWith: "q_" } }, { kind: { startsWith: "fix_" } }],
          },
        });
        for (const row of sheetRows) {
          const hit = byName.get(restKey(row.sourceName || ""));
          await tx.timesheet.update({
            where: { id: hit.id },
            // UPDATED IN PLACE, NEVER REPLACED. The signing link is derived from
            // the row id, so keeping the row keeps the link they already have in
            // their inbox working - which is the whole point of correcting four
            // sheets instead of reissuing sixty.
            data: {
              ...row,
              overrides: {},
              // the corrected sheet is a different document, so the signature
              // and the sign-off cannot carry over to it
              signedAt: null, signedPdfUrl: null, signedName: null, signedIp: null,
              approvedAt: null, approvedById: null, approvedPdfUrl: null,
              disputedAt: null, pdfUrl: null,
              // back onto the chase list: it has to go out again
              sentAt: null,
              recomputedAt: new Date(),
            },
          });
        }
      }, { timeout: 120_000, maxWait: 20_000 });
    } catch (e) {
      console.error("partial re-upload failed:", e);
      back((e?.message || String(e)).slice(0, 200));
    }

    for (const id of ids) await bumpSheetVersion(id);
    await bumpBatchVersion(intoBatchId);
    revalidatePath(`/portal/admin/timesheets/${intoBatchId}`);
    revalidatePath("/portal/admin/timesheets");
    console.log(
      `partial re-upload by ${user.id} into ${intoBatchId}: `
      + `${sheetRows.map((r) => r.sourceName).join(", ")}`,
    );
    return {
      ok: true,
      href: `/portal/admin/timesheets/${intoBatchId}?replaced=${ids.length}`,
      summary: { ...sum, partialInto: intoBatchId, replaced: sheetRows.map((r) => r.sourceName) },
    };
  }

  // ONE TRANSACTION, so a failure leaves nothing rather than a part-built
  // upload that then outranks the batch it failed to replace. The sheets go in
  // as a single statement: 60 of them is 1.18MB, which is one round trip, and
  // an interactive transaction held open for sixty of them would be a new way
  // for a slow connection to cost an upload.
  let batch;
  try {
    batch = await prisma.$transaction(async (tx) => {
      const b = await tx.timesheetBatch.create({ data: batchData });
      await tx.timesheet.createMany({
        data: sheetRows.map((row) => ({ ...row, batchId: b.id })),
      });
      // the period's service notes, in a row of their own: a fortnight of them
      // is about a megabyte and Repeat patterns loads every batch there has
      // ever been. Inside the transaction with everything else, so a period
      // never lands holding notes from an export that did not arrive.
      if (mergedNotes.length) {
        await tx.batchServiceNotes.create({
          data: {
            batchId: b.id,
            notes: mergedNotes,
            noteCount: mergedNotes.length,
            pdfCount: pdfNoteCount,
            serviceCount: xlsNoteCount,
          },
        });
      }
      return b;
    // Prisma gives an interactive transaction five seconds by default, which is
    // a sensible figure for a request and the wrong one for a megabyte going to
    // Neon over somebody's home connection. The upload it guards has already
    // taken minutes by this point.
    }, { timeout: 120_000, maxWait: 20_000 });
  } catch (e) {
    console.error("timesheet batch write failed:", e);
    redirect(
      `${NEW}error=save&why=${encodeURIComponent(
        (e?.message || String(e)).slice(0, 200),
      )}`,
    );
  }

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
      program: true,
      _count: { select: { timesheets: true } },
    },
  });
  if (!batch) return { ok: false, error: "gone" };

  const signed = await prisma.timesheet.count({
    where: { batchId, OR: [{ signedAt: { not: null } }, { approvedAt: { not: null } }] },
  });

  // THE CHECK FLAGS DO NOT CASCADE, because they carry no relation to the batch
  // - see the note on the model, which records who flagged a row at the time and
  // is deliberately not tied to a user or a batch row that can be deleted out
  // from under it. Nothing else would ever remove them, so this used to clear
  // every mark on the batch, on the reasoning that a later upload could
  // otherwise INHERIT them on matching row keys.
  //
  // THAT REASONING HAS INVERTED, and this is now the dangerous half of it.
  // Marks are keyed on (period, person, finding) and inheriting across uploads
  // of one fortnight is the whole point: 70 of them are rendering on the live
  // 08/12 batch right now and every one was made on the 08/09 one. Clearing by
  // batch would delete work that is currently on screen somewhere else.
  //
  // So they only go when this is the LAST batch of its period - at which point
  // nothing can display them and leaving them would be the old bug again.
  const alsoInPeriod = await prisma.timesheetBatch.count({
    // SAME PROGRAM ONLY: the day program's batch of this fortnight must not
    // keep the agency's marks alive after the last agency upload goes, nor
    // the other way round.
    where: { periodFrom: batch.periodFrom, periodTo: batch.periodTo, program: batch.program, id: { not: batchId } },
  });
  // Left ENTIRELY ALONE when the period survives, rather than moved onto the
  // remaining batch. Moving them looks tidier and can collide: the name-keyed
  // rest rows carry no timesheet id, so `rest-offshift-garcia, stephanie-...`
  // is the same string on both batches and `@@unique([batchId, rowKey])` would
  // refuse it halfway through. A dangling `batchId` costs nothing - no relation,
  // no cascade, and nothing reads it now that reads go by period. It is also
  // true: that is the upload the mark was raised on, and it is gone.
  if (alsoInPeriod === 0) {
    await prisma.timesheetCheckFlag.deleteMany({ where: { batchId } });
  }

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
  // A REPLACED UPLOAD IS READ ONLY, and this is the worst one to allow: an
  // old export emails figures the current one has already moved. Redirected
  // rather than returned, because this action redirects on every path.
  {
    const newer = await supersededBy(batchId);
    if (newer) redirect(`/portal/admin/timesheets/${newer.id}?superseded=1`);
  }

  const onlyId = formData.get("timesheetId");
  const message = (formData.get("message") || "").toString().trim().slice(0, 2000) || null;
  const dueRaw = (formData.get("dueAt") || "").toString();
  const dueAt = dueRaw ? new Date(dueRaw) : null;
  const resend = formData.get("resend") === "on";

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id: batchId },
    // restsByDate carries the 30-minute entries filed as rest breaks, which the
    // email has to ask about. They live on the batch, not the sheet.
    //
    // `testOnly`/`testEmail` decide WHERE every one of these may go. Left out
    // they arrive undefined, `batchForceTo` reads false, and a rehearsal batch
    // sends sixty real timesheets to sixty real people. This is the one select
    // in the file where getting it wrong is not a rendering bug.
    select: {
      id: true, periodFrom: true, periodTo: true, restsByDate: true,
      testOnly: true, testEmail: true,
    },
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
      // A REHEARSAL BATCH SENDS TO ONE ADDRESS AND NOWHERE ELSE, whatever the
      // environment says - see `batchForceTo`. Null on an ordinary batch, which
      // leaves the two ordinary locks deciding exactly as before.
      forceTo: batchForceTo(batch),
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

  // stamp the signature onto the employee-signed copy
  let pdfBase64;
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return { ok: false, error: "nofile" };
    const doc = await PDFDocument.load(await res.arrayBuffer());
    // the block's real position, read off the signed bytes. The stored rect
    // comes from the rebuild render, which is not the render the employee
    // signed - on 08/16-08/31 the gap put every approval 22.5pt above the
    // label. The stored rect stays as the fallback for a copy so old its
    // label can't be found; a sheet with neither has nowhere to put a
    // signature, so say that plainly instead of approving without one.
    const rect = findApprovalAnchor(doc) || ts.data?.approvalRect;
    if (!rect) return { ok: false, error: "norect" };
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
  // the same gap signing had, and the same fix. Two people working a batch
  // through approvals is the normal case, and the second one should not have to
  // reload to see the first one's work land.
  await bumpBatchVersion(ts.batchId);
  await bumpSheetVersion(ts.id);
  return { ok: true };
}

// THE OFFICE HOLD ON SIGNING, 2026-09-02. Mánu: an issue is noticed on a
// sheet and the person must not sign it until the office is done - Allan's
// mileage was the first. The employee's page states the hold and drops the
// signer; submitSignedTimesheet refuses behind it, because hiding a control
// is a suggestion and this has to be a rule. The reason is the office's own
// note on the card menu and never reaches the employee.
export async function holdTimesheetSigning({ timesheetId, reason }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) return { ok: false, error: "auth" };
  const ts = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    select: { id: true, batchId: true, heldAt: true, signedAt: true },
  });
  if (!ts) return { ok: false, error: "auth" };
  if (ts.heldAt) return { ok: false, error: "already" };
  await prisma.timesheet.update({
    where: { id: ts.id },
    data: {
      heldAt: new Date(),
      heldById: user.id,
      heldByName: preferredName(user) || user.name || null,
      heldReason: String(reason ?? "").trim().slice(0, 300) || null,
    },
  });
  await bumpSheetVersion(ts.id);
  await bumpBatchVersion(ts.batchId);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/people`);
  return { ok: true };
}

export async function releaseTimesheetSigning({ timesheetId }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) return { ok: false, error: "auth" };
  const ts = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    select: { id: true, batchId: true, heldAt: true },
  });
  if (!ts) return { ok: false, error: "auth" };
  if (!ts.heldAt) return { ok: false, error: "already" };
  await prisma.timesheet.update({
    where: { id: ts.id },
    data: { heldAt: null, heldById: null, heldByName: null, heldReason: null },
  });
  await bumpSheetVersion(ts.id);
  await bumpBatchVersion(ts.batchId);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/people`);
  return { ok: true };
}

// MILEAGE OFF THE SHEET, 2026-09-02. Allan's case: the reported miles are not
// standing, so the record must carry none. `data.qspMiles` is what every
// surface reads - the sheet's miles line and its attestation sentence, the
// payout report page, its CSV and its PDF - so nulling the stored figure is
// the whole removal, with the original stashed for the audit trail and for
// putting back. The rebuild is the same one the Recompute button runs: the
// sheet regenerates without the figure, and a signature already taken comes
// off, because the miles are ON the signed document and a copy stripped of
// them is a different document nobody has signed.
//
// A RE-UPLOAD RESTORES THE FIGURE - a new batch reads the payroll export
// afresh and knows nothing of this row. The removal is per-sheet, per-batch.
export async function removeTimesheetMileage({ timesheetId }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) return { ok: false, error: "auth" };
  {
    const newer = await supersededByForTimesheet(timesheetId);
    if (newer) return refusal(newer);
  }
  const ts = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    select: {
      id: true, data: true,
      corrections: { where: { status: "open" }, select: { id: true } },
    },
  });
  if (!ts) return { ok: false, error: "auth" };
  const stored = ts.data || {};
  if (stored.qspMiles == null) return { ok: false, error: "nomiles" };
  // checked here as well as inside the recompute, so the refusal lands BEFORE
  // the figure is nulled rather than leaving the flag set and the rebuild
  // refused halfway
  if (ts.corrections.length) return { ok: false, error: "openitems" };
  await prisma.timesheet.update({
    where: { id: ts.id },
    data: {
      data: {
        ...stored,
        qspMiles: null,
        qspMilesRemoved: {
          was: stored.qspMiles,
          at: new Date().toISOString(),
          byName: preferredName(user) || user.name || null,
        },
      },
    },
  });
  return recomputeTimesheet(ts.id);
}

export async function restoreTimesheetMileage({ timesheetId }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) return { ok: false, error: "auth" };
  {
    const newer = await supersededByForTimesheet(timesheetId);
    if (newer) return refusal(newer);
  }
  const ts = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    select: {
      id: true, data: true,
      corrections: { where: { status: "open" }, select: { id: true } },
    },
  });
  if (!ts) return { ok: false, error: "auth" };
  const stored = ts.data || {};
  if (stored.qspMilesRemoved?.was == null) return { ok: false, error: "nomiles" };
  if (ts.corrections.length) return { ok: false, error: "openitems" };
  const { qspMilesRemoved, ...rest } = stored;
  await prisma.timesheet.update({
    where: { id: ts.id },
    data: { data: { ...rest, qspMiles: qspMilesRemoved.was } },
  });
  return recomputeTimesheet(ts.id);
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
      // `testOnly`/`testEmail` decide where this alert may go. Left out of the
      // select they arrive undefined, `batchForceTo` reads false, and a
      // rehearsal batch quietly emails real payroll - the `restsUrl` failure
      // with a send on the end of it.
      batch: {
        select: {
          id: true, periodFrom: true, periodTo: true, uploadedById: true,
          testOnly: true, testEmail: true,
        },
      },
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

    // AN UNPUNCHED BREAK CLAIM CARRIES ITS TIME, stored in the same
    // `statedBreaks` shape the question answers use - which is what puts the
    // times on the review emails and, once accepted, on the sheet. Checked
    // against the day the same way the question action checks: a rest inside
    // its own half of a shift, a lunch refused only where the punches show a
    // half-hour gap it ignores. A claim whose time cannot be read is refused
    // rather than stored timeless - the time is the record this exists for.
    let statedBreaks = null;
    if (spec.asksTimes) {
      const kindOf = spec.asksTimes;
      const minutes = kindOf === "meal" ? MEAL_MIN_MINUTES : FULL_REST_MIN;
      const day = (ts.data?.days || []).find((x) => x.date === date) || null;
      const list = [];
      const raws = (Array.isArray(raw?.times) ? raw.times : []).slice(0, 4);
      for (const [i, r] of raws.entries()) {
        // parseLooseTime hands back "HH:MM" or "" - the MINUTES come from
        // hhmmToMin, exactly the pair the question action runs on
        const start = hhmmToMin(parseLooseTime(String(r || ""), { assumeWorkday: true }));
        if (start == null) continue;
        // where and what: a refusal points at the day and quotes the typed
        // time, the same contract every question-card refusal honours
        const where = { date, slot: `${kindOf}${i + 1}` };
        if (start + minutes > 1439) {
          return { ok: false, error: "badtime", given: String(r || ""), at: where };
        }
        if (kindOf === "rest" && day
          && !restTimeFits(day, (day.restCount || 0) + i + 1, start, minutes).ok) {
          return { ok: false, error: "badtime", given: String(r || ""), at: where };
        }
        if (kindOf === "meal" && day && mealTimeFits(day, start, minutes).why === "window") {
          return { ok: false, error: "badtime", given: String(r || ""), at: where };
        }
        list.push({
          kindOf, minutes,
          from: shortClock(start), to: shortClock(start + minutes),
          source: "typed",
        });
      }
      if (!list.length) continue;
      statedBreaks = list;
    }

    // spread rather than a null field: Prisma's Json columns take JsonNull,
    // not a JS null, so an absent claim simply leaves the column alone
    clean.push({ date, kind, claimedHours, note, ...(statedBreaks ? { statedBreaks } : {}) });
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

  // who hears about it: the same five people the review corrections email
  // reaches, resolved by name (Mánu 2026-08-25; himself onto the TO line
  // 2026-09-01). TIMESHEET_ALERT_TO and the batch uploader are only the
  // fallback for the day none of them resolve.
  let to = [];
  let cc = [];
  const office = await resolveReviewRecipients();
  if (office.to.length) {
    to = office.to;
    cc = office.cc;
  } else {
    to = (process.env.TIMESHEET_ALERT_TO || "")
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
  }

  // best-effort, like every other notification here: a mail hiccup must not
  // lose the report itself, which is already safely written above.
  try {
    if (to.length) {
      await sendCorrectionAlert({
        to,
        cc,
        employeeName: who,
        periodLabel,
        items: clean,
        reviewUrl,
        // the alert comes to US and is redirected too: "everything on that july
        // one if sent" includes the mail we send ourselves
        forceTo: batchForceTo(ts.batch),
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
    // ACCEPTING THE REPORT IS THE REVIEWER'S DECISION, and the premium
    // markers read that: an hour a reviewer settles does not wait on a
    // signature the way the employee's own answer does. Without these stamps
    // the accepted patch read as the employee's and stayed pending.
    const stamped = { ...patch, _answeredBy: "admin" };
    if (patch.mealViolation != null) stamped._mealAnsweredBy = "admin";
    if (patch.restViolation != null) stamped._restAnsweredBy = "admin";
    // THE TIMES THE REPORT CLAIMED, accepted onto the day - so the sheet shows
    // the break where the person said it was, the same way an answered
    // question's stated times reach it. See claimedTimesPatch.
    Object.assign(stamped, claimedTimesPatch(overrides, c.date, c.statedBreaks) || {});
    if (c.date) overrides = mergeOverride(overrides, c.date, stamped);
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
  // A REPLACED UPLOAD IS READ ONLY - see superseded.js. Refused on the SERVER,
  // because hiding a control is a suggestion and this has to be a rule.
  {
    const newer = await supersededByForTimesheet(timesheetId);
    if (newer) return refusal(newer);
  }

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

// WHAT THE MISC TIME ON A DAY ACTUALLY WAS, answered by a reviewer.
//
// Mánu 2026-08-12: "that time is typically used for sick pay and pto. it can be
// used for work not with a client so we need to ask." The engine discounts Misc
// time over ten minutes from the hours that decide whether a rest or a meal is
// owed, so this is the only route by which it comes back.
//
// A REVIEWER ANSWERING FIRST MEANS THE EMPLOYEE IS NEVER ASKED. PTO is nothing
// they have to change in QSP, and asking somebody about their own sick day is
// not a question worth sending. `buildQuestions` skips the day once `miscKind`
// is set, and a test asserts that.
//
// The patch comes from `patchesFor`, the SAME function the employee's own answer
// goes through, so the two routes cannot drift. Only "worked" moves a figure: it
// re-earns the stretch's entitlement and is the one answer on either surface
// that can put a premium ON.
export async function classifyMiscTime(timesheetId, date, kind) {
  const user = await requireTimesheetAccess();
  // "cancelled" is CLIENT CANCELLATION, added 2026-08-17: paid, unworked time
  // whose block counts as unscheduled - see workGroupsFor.
  if (!["pto", "sick", "worked", "cancelled"].includes(kind)) return { ok: false, error: "badkind" };
  // A REPLACED UPLOAD IS READ ONLY - see superseded.js. Refused on the SERVER,
  // because hiding a control is a suggestion and this has to be a rule.
  {
    const newer = await supersededByForTimesheet(timesheetId);
    if (newer) return refusal(newer);
  }

  const ts = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    include: {
      batch: { select: { id: true, periodFrom: true, periodTo: true, restsByDate: true, restsUrl: true, program: true } },
    },
  });
  if (!ts) return { ok: false, error: "gone" };
  // same guard as every other admin correction: changing the figures under a
  // signature would leave them attesting to a document that no longer says what
  // they signed
  if (ts.signedAt) return { ok: false, error: "signed" };

  const day = (ts.data?.days || []).find((d) => d.date === date);
  if (!day) return { ok: false, error: "noday" };
  // NOT A VACUOUS CHECK. `miscBlocks` is absent from every day stored before
  // 2026-08-12, so a day that has never been recomputed genuinely has nothing to
  // classify and saying so is better than writing an override nothing reads.
  if (!(day.miscBlocks || []).length) return { ok: false, error: "nomisc" };

  const patch = patchesFor({ kind: "miscTime" }, kind, day);
  const overrides = mergeOverride(ts.overrides, date, {
    ...patch,
    _was: { restRequired: day.restRequired, mealRequired: day.mealRequired },
    _by: preferredName(user) || user.id,
    _at: new Date().toISOString(),
    _source: "misc-classify",
  });

  // rebuilt straight away rather than left for somebody to press Recompute.
  // "worked" changes what the day owes, and a card that says the time was
  // recorded while the figures still say otherwise is the disagreement between a
  // page and its own document that 11c3e3a exists to stop.
  const res = await rebuildSheetFor({ ...ts, overrides }, overrides);
  if (!res?.ok) return res;

  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/person/${ts.id}`);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/checks`);
  // and their own page, which is where the classification actually shows up as
  // a label on the calendar and as a question that stops being asked
  revalidatePath(`/t/${signTimesheetToken(ts.id)}`);
  await bumpSheetVersion(ts.id);
  // AND THE REVIEWER SCREENS, so a day view shows what is still outstanding
  // without anybody reloading it - see the note on `bumpBatchVersion`.
  await bumpBatchVersion(ts.batchId);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/person/${ts.id}`);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/people`);
  return { ok: true };
}

// undo a classification, so a wrong click is not permanent. Only the five fields
// the Misc patch writes come off; anything else on the day's override was put
// there by a different decision and is none of this one's business.
export async function clearMiscClassification(timesheetId, date) {
  await requireTimesheetAccess();
  // A REPLACED UPLOAD IS READ ONLY - see superseded.js. Refused on the SERVER,
  // because hiding a control is a suggestion and this has to be a rule.
  {
    const newer = await supersededByForTimesheet(timesheetId);
    if (newer) return refusal(newer);
  }
  const ts = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    include: {
      batch: { select: { id: true, periodFrom: true, periodTo: true, restsByDate: true, restsUrl: true, program: true } },
    },
  });
  if (!ts) return { ok: false, error: "gone" };
  if (ts.signedAt) return { ok: false, error: "signed" };

  // NOTHING TO CLEAR IS NOT A FAILURE.
  //
  // This refused with a code the card had no words for, so it came out as "that
  // did not save, try again" - advice that cannot work, because the refusal is a
  // judgement about the state and trying again sends the same thing.
  //
  // It is reachable: the panel shows a classification read off the DAY, and the
  // override it was written into is a separate thing that could go missing
  // underneath it. Pressing Change this then asked to clear something already
  // gone and reported a save failure over a sheet that was fine.
  //
  // So an absent override is only an error if the day still disagrees with it.
  // Where the day is clear too, the state is already what they asked for.
  const existing = ts.overrides?.[date];
  if (!existing) {
    const day = (ts.data?.days || []).find((d) => d.date === date);
    if (!day?.miscKind && !day?.miscWorked) return { ok: true, already: true };
    // the day says classified and nothing holds the classification, so rebuild
    // from what is actually on record and let the two agree again
    const res = await rebuildSheetFor({ ...ts, overrides: ts.overrides || {} }, ts.overrides || {});
    if (!res?.ok) return res;
    revalidatePath(`/portal/admin/timesheets/${ts.batchId}/person/${ts.id}`);
    revalidatePath(`/t/${signTimesheetToken(ts.id)}`);
  await bumpSheetVersion(ts.id);
  // AND THE REVIEWER SCREENS, so a day view shows what is still outstanding
  // without anybody reloading it - see the note on `bumpBatchVersion`.
  await bumpBatchVersion(ts.batchId);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/person/${ts.id}`);
    return { ok: true, reconciled: true };
  }
  const next = { ...ts.overrides };
  const rest = { ...existing };
  // the fields the patch writes come from the engine's own list, so a sixth one
  // added to `patchesFor` is removed here without anybody remembering to
  for (const k of [...MISC_PATCH_FIELDS, "_was", "_by", "_at", "_source"]) {
    delete rest[k];
  }
  if (Object.keys(rest).length) next[date] = rest;
  else delete next[date];

  const res = await rebuildSheetFor({ ...ts, overrides: next }, next);
  if (!res?.ok) return res;

  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/person/${ts.id}`);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/checks`);
  // and their own page, which is where the classification actually shows up as
  // a label on the calendar and as a question that stops being asked
  revalidatePath(`/t/${signTimesheetToken(ts.id)}`);
  await bumpSheetVersion(ts.id);
  // AND THE REVIEWER SCREENS, so a day view shows what is still outstanding
  // without anybody reloading it - see the note on `bumpBatchVersion`.
  await bumpBatchVersion(ts.batchId);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/person/${ts.id}`);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/people`);
  return { ok: true };
}

// WHAT UNDOING ONE DAY WOULD TAKE, read when the confirm opens.
//
// The fourth of these, and the one that needed it most: until 2026-08-16 the
// undo dropped the day's patch and nothing else, so there was nothing to count.
// It deletes that date's answers now, and a control that deletes an answer
// without saying how many is the thing the other three were just fixed for.
export async function dayUndoImpact(timesheetId, date) {
  await requireTimesheetAccess();
  const answers = await prisma.timesheetCorrection.count({
    where: {
      timesheetId,
      date,
      OR: [{ kind: { startsWith: "q_" } }, { kind: { startsWith: "fix_" } }],
    },
  });
  return { answers };
}

export async function clearDayOverride(timesheetId, date) {
  await requireTimesheetAccess();
  // A REPLACED UPLOAD IS READ ONLY - see superseded.js. Refused on the SERVER,
  // because hiding a control is a suggestion and this has to be a rule.
  {
    const newer = await supersededByForTimesheet(timesheetId);
    if (newer) return refusal(newer);
  }
  const ts = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    // `data` and the batch's rest rows are what `rebuildSheetFor` recomputes
    // from. Left out they arrive undefined and the rebuild quietly produces a
    // sheet with no days on it.
    include: { batch: { select: { id: true, periodFrom: true, periodTo: true, restsByDate: true, restsUrl: true, program: true } } },
  });
  if (!ts?.overrides) return { ok: false, error: "gone" };

  // THE ANSWER GOES WITH THE OVERRIDE, or nothing happens at all.
  //
  // This used to delete the day's override and stop there. Every rebuild
  // re-derives the overrides FROM the corrections, so the patch this removed
  // came straight back the next time anything recomputed - a control that
  // looked like it worked and did not. Mánu pressed it, then the reset, then
  // rebuild, and watched the answers survive all three.
  //
  // Scoped to ONE DATE: `resetTimesheetAnswers` is the same two steps for a
  // whole sheet, and this is that, for a day.
  const { count } = await prisma.timesheetCorrection.deleteMany({
    where: {
      timesheetId: ts.id,
      date,
      OR: [{ kind: { startsWith: "q_" } }, { kind: { startsWith: "fix_" } }],
    },
  });

  const next = { ...ts.overrides };
  delete next[date];
  await prisma.timesheet.update({ where: { id: ts.id }, data: { overrides: next } });

  // AND RECOMPUTE, so the figures on screen are the ones this just produced.
  // Without it the day keeps the patched hours until somebody else rebuilds,
  // which is the same disagreement between a page and its own document that
  // the answer path already refuses to leave behind.
  const res = await rebuildSheetFor({ ...ts, overrides: next }, next);
  if (!res?.ok) return res;

  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/checks`);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/person/${ts.id}`);
  // and the page the answers were given on, plus both live-refresh counters,
  // so an employee looking at this day sees it change rather than a stale copy
  revalidatePath(`/t/${signTimesheetToken(ts.id)}`);
  await bumpSheetVersion(ts.id);
  await bumpBatchVersion(ts.batchId);
  return { ok: true, removed: count };
}

// re-run one employee's figures from their stored days plus whatever overrides
// were accepted, regenerate the PDF, and clear the dispute so it can be sent
// again for signature.
//
// only this one sheet is touched. the batch, and everyone else in it, is left
// exactly as it was.
// PUTTING A BATCH BACK TO THE DAY IT WAS UPLOADED.
//
// Mánu 2026-08-12: "I need to reset all button." Testing the answer flow means
// answering as somebody, seeing what it does, and then needing the question
// back - and there was no way back short of editing rows by hand.
//
// It is exactly two steps, both of which already exist: delete the `q_` answers,
// then rebuild each sheet with NO overrides. `rebuildSheetFor` recomputes from
// `daysOriginal` - the pristine set stashed on the first rebuild - so this lands
// on the same figures the upload produced rather than on whatever the last
// correction left behind.
//
// WHAT IT DESTROYS, stated plainly because the button has to say it: every
// answer anybody has given on this batch, and with it every signature, because
// a rebuild un-signs deliberately - a signed PDF quotes figures that are about
// to change. On a live batch that is somebody's attestation gone. Hence SUPER
// only, and hence the count in the confirm.
//
// It does NOT touch the uploaded documents, the name matches, or the batch
// itself. Re-answering from scratch is the whole point; re-uploading is not.
//
// WHAT IT WOULD TAKE, READ WHEN THE CONFIRM OPENS. The count under the button
// came off the page render, so a confirm opened at 9pm on a page loaded at 4pm
// promised to delete the answers that existed at 4pm. Two reviewers on the same
// batch, or the employee answering in their own tab, and the number is simply
// wrong at the one moment somebody is deciding. Same shape as
// `batchDeletionImpact` - read at click time, never after.
//
// EVERY CLAUSE BELOW IS THE ACTION'S OWN. `q_` and the batch for the answers,
// `signedAt` for the signatures, because a rebuild un-signs. A second guess at
// what a reset removes is how a confirm starts lying.
export async function batchResetImpact(batchId) {
  await requireTimesheetAccess();
  const [answers, signed, sheets] = await Promise.all([
    prisma.timesheetCorrection.count({
      where: { timesheet: { batchId }, kind: { startsWith: "q_" } },
    }),
    prisma.timesheet.count({ where: { batchId, signedAt: { not: null } } }),
    prisma.timesheet.count({ where: { batchId } }),
  ]);
  return { answers, signed, sheets };
}

export async function resetBatchAnswers(batchId) {
  const user = await requireTimesheetAccess();
  if (!isSuper(user?.role)) return { ok: false, error: "auth" };
  // A REPLACED UPLOAD IS READ ONLY - see superseded.js. Refused on the SERVER,
  // because hiding a control is a suggestion and this has to be a rule.
  {
    const newer = await supersededBy(batchId);
    if (newer) return refusal(newer);
  }

  const sheets = await prisma.timesheet.findMany({
    where: { batchId },
    // `restsUrl` is here because the re-analysis reads it. A column left off a
    // select comes back undefined, which is indistinguishable from "this batch
    // has no rest report" - and that reads as restUnknown, which is the
    // difference between charging somebody and not.
    include: { batch: { select: { id: true, periodFrom: true, periodTo: true, restsByDate: true, restsUrl: true, program: true } } },
  });
  if (!sheets.length) return { ok: false, error: "notfound" };

  const { count } = await prisma.timesheetCorrection.deleteMany({
    where: { timesheetId: { in: sheets.map((t) => t.id) }, kind: { startsWith: "q_" } },
  });

  let rebuilt = 0;
  let failed = 0;
  for (const ts of sheets) {
    // `{}` and not `ts.overrides` - that is the whole difference between this
    // and Recompute, which keeps them
    const res = await rebuildSheetFor({ ...ts, overrides: {} }, {});
    if (res?.ok) rebuilt++;
    else failed++;
  }

  revalidatePath(`/portal/admin/timesheets/${batchId}`);
  revalidatePath(`/portal/admin/timesheets/${batchId}/corrections`);
  revalidatePath(`/portal/admin/timesheets/${batchId}/checks`);
  return { ok: true, answers: count, rebuilt, failed };
}

// THE SAME RESET, FOR ONE SHEET, FROM THE PAGE YOU ARE LOOKING AT.
//
// Mánu 2026-08-12: "I meant to reset page. When you open up someone's time sheet
// corrections." The batch-level one is for starting a period over; this is for
// the loop somebody is actually in while testing - open a person's page, work
// through their questions, put them back, do it again. Walking out to the batch
// screen to reset all fifty-nine to retry one of them is the wrong shape.
//
// Same two steps as the batch version, and the same honesty about what goes:
// every answer on THIS sheet, and its signature if it has one.
//
// AND THE COUNT IS READ WHEN THE CONFIRM OPENS, not when the page rendered -
// see the note on `batchResetImpact`. This one matters more, because the page
// it sits on is the page the employee is answering questions ON: a reviewer
// with the preview tab open while somebody works through their sheet had a
// number that went out of date as they watched.
//
// THE REASONS ARE COUNTED THROUGH `resetAction`, THE SAME CALL THE ACTION
// MAKES, not through a filter that means to say the same thing. A reason a
// reviewer took off a phone call is not deleted, it is un-confirmed, and both
// count as a row this control changes - so the two have to agree by
// construction rather than by anybody keeping them in step.
export async function timesheetResetImpact(timesheetId) {
  await requireTimesheetAccess();
  const ts = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    select: {
      id: true,
      userId: true,
      signedAt: true,
      // `program` is what the break-answer filter below reads. Left out, that
      // filter falls back to MLS and this dialog counts the OTHER payroll's
      // rows while the reset itself touches none of them.
      batch: { select: { periodFrom: true, periodTo: true, program: true } },
    },
  });
  if (!ts) return { answers: 0, reasons: 0, signed: false };

  const answers = await prisma.timesheetCorrection.count({
    where: {
      timesheetId: ts.id,
      OR: [{ kind: { startsWith: "q_" } }, { kind: { startsWith: "fix_" } }],
    },
  });

  let reasons = 0;
  if (ts.userId) {
    const rows = await prisma.timesheetBreakAnswer.findMany({
      where: {
        program: ts.batch.program || "MLS",
        periodFrom: ts.batch.periodFrom,
        periodTo: ts.batch.periodTo,
        personKey: ts.userId,
      },
      select: { id: true, byId: true, confirmedAt: true, confirmedText: true },
    });
    reasons = rows.filter((r) => resetAction(r, ts.userId)).length;
  }
  return { answers, reasons, signed: !!ts.signedAt };
}

export async function resetTimesheetAnswers(timesheetId) {
  const user = await requireTimesheetAccess();
  if (!isSuper(user?.role)) return { ok: false, error: "auth" };
  // A REPLACED UPLOAD IS READ ONLY - see superseded.js. Refused on the SERVER,
  // because hiding a control is a suggestion and this has to be a rule.
  {
    const newer = await supersededByForTimesheet(timesheetId);
    if (newer) return refusal(newer);
  }

  const ts = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    include: { batch: { select: { id: true, periodFrom: true, periodTo: true, restsByDate: true, restsUrl: true, program: true } } },
  });
  if (!ts) return { ok: false, error: "notfound" };

  const { count } = await prisma.timesheetCorrection.deleteMany({
    // `fix_` rows are acknowledgements of a backwards entry - the employee's own
    // answer like any other, so a reset takes them off with the rest
    where: { timesheetId: ts.id, OR: [{ kind: { startsWith: "q_" } }, { kind: { startsWith: "fix_" } }] },
  });

  // AND WHAT THEY SAID ABOUT A BREAK, which is not a correction and lives in
  // another table - see `resetAction`, which decides per row whether it is
  // theirs to delete or a reviewer's to keep. A reason recorded off a phone call
  // survives with its confirmation cleared, so it goes back to being a question.
  let reasons = 0;
  if (ts.userId) {
    const rows = await prisma.timesheetBreakAnswer.findMany({
      where: {
        program: ts.batch.program || "MLS",
        periodFrom: ts.batch.periodFrom,
        periodTo: ts.batch.periodTo,
        personKey: ts.userId,
      },
      select: { id: true, byId: true, confirmedAt: true, confirmedText: true },
    });
    const drop = rows.filter((r) => resetAction(r, ts.userId) === "delete").map((r) => r.id);
    const unconfirm = rows.filter((r) => resetAction(r, ts.userId) === "unconfirm").map((r) => r.id);
    if (drop.length) {
      await prisma.timesheetBreakAnswer.deleteMany({ where: { id: { in: drop } } });
    }
    if (unconfirm.length) {
      await prisma.timesheetBreakAnswer.updateMany({
        where: { id: { in: unconfirm } },
        data: { confirmedAt: null, confirmedText: null },
      });
    }
    reasons = drop.length + unconfirm.length;
  }
  const res = await rebuildSheetFor({ ...ts, overrides: {} }, {});
  if (!res?.ok) return res;

  revalidatePath(`/portal/admin/timesheets/${ts.batchId}`);
  // AND THE PAGE THE ANSWERS WERE GIVEN ON, which this did not do.
  //
  // Only `answerTimesheetQuestion` revalidated it, so a reset left every OTHER
  // tab serving the sheet from before the reset - the answer still listed, the
  // question still gone. The tab that pressed the control refreshed itself and
  // looked right, which is what made it read as the database not having changed.
  //
  // The token is derived rather than passed: this action is reached by id, and
  // signing is deterministic, so it is the same path the employee opens.
  revalidatePath(`/t/${signTimesheetToken(ts.id)}`);
  await bumpSheetVersion(ts.id);
  // AND THE REVIEWER SCREENS, so a day view shows what is still outstanding
  // without anybody reloading it - see the note on `bumpBatchVersion`.
  await bumpBatchVersion(ts.batchId);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/person/${ts.id}`);
  return { ok: true, answers: count, reasons };
}

// WHAT A RECALCULATION IS ABOUT TO DO, read when the confirm opens.
//
// Recalculate KEEPS every answer, so unlike the two resets above it is not
// counting a deletion. It carries three facts the confirm has to be right
// about:
//
// - `accepted` picks which of the two sentences is shown, and it was a PROP.
//   The day-by-day page passed `accepted={0}` unconditionally, so a sheet with
//   three accepted corrections was told nothing would come with them.
// - `open` is the reason the action REFUSES (`openitems`). Worth saying before
//   somebody presses it rather than as an error afterwards.
// - `signed` is the destructive half: a rebuild clears the signature. The
//   corrections screen shows this control on signed sheets, so the warning has
//   to be conditional on the sheet in front of them and not on a general note.
export async function timesheetRecomputeImpact(timesheetId) {
  await requireTimesheetAccess();
  const ts = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    select: { id: true, signedAt: true, approvedAt: true },
  });
  if (!ts) return { accepted: 0, open: 0, answers: 0, signed: false, approved: false };
  const [accepted, open, answers] = await Promise.all([
    prisma.timesheetCorrection.count({ where: { timesheetId: ts.id, status: "accepted" } }),
    prisma.timesheetCorrection.count({ where: { timesheetId: ts.id, status: "open" } }),
    prisma.timesheetCorrection.count({
      where: {
        timesheetId: ts.id,
        OR: [{ kind: { startsWith: "q_" } }, { kind: { startsWith: "fix_" } }],
      },
    }),
  ]);
  return { accepted, open, answers, signed: !!ts.signedAt, approved: !!ts.approvedAt };
}

export async function recomputeTimesheet(timesheetId) {
  await requireTimesheetAccess();
  // A REPLACED UPLOAD IS READ ONLY - see superseded.js. Refused on the SERVER,
  // because hiding a control is a suggestion and this has to be a rule.
  {
    const newer = await supersededByForTimesheet(timesheetId);
    if (newer) return refusal(newer);
  }

  const ts = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    include: {
      batch: { select: { id: true, periodFrom: true, periodTo: true, restsByDate: true, restsUrl: true, program: true } },
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
  const daysStored = stored.daysOriginal || stored.days || [];

  // RE-DERIVE HOW MANY RESTS THE REPORT RECORDS, from the rows kept on the batch.
  //
  // `restRecorded` is an INPUT to `analyzeDay`, worked out from the rest report
  // when the batch was uploaded and then frozen into `daysOriginal`. So a change
  // to what counts as a rest could never reach a batch already in the database -
  // a rebuild starts from those pristine days and faithfully reproduces the old
  // count. Mánu 2026-08-12, after the repair rule went in: "Why is it still
  // saying one of two missing?"
  //
  // Counted here with `countsAsTaken`, which is the same rule the parser now
  // applies at upload, over the same rows the parser produced. This is STILL NOT
  // a re-match: `restNameFor` returns the one spelling the upload already
  // resolved through this person's portal account, and rows are then compared
  // with the engine's own `restKey` - exact only. No name is scored here, which
  // is the difference between this and the recount that once invented three
  // premium hours for the wrong Delgado Pineda.
  //
  // Reading the stored spelling rather than the timesheet's own is what lets THE
  // right Delgado Pineda be rebuilt at all: the report files her under "Delgado
  // Pineda, Angel", so this filter came back empty and her rebuild quietly kept
  // whatever the upload had said, immune to every later change in the rule.
  //
  // A batch with no stored rows - or a person the report never covered - keeps
  // whatever the day already had, so nothing is lost by rebuilding.
  const restRowsForSheet = (ts.batch?.restsByDate || []).filter(
    (r) => restKey(r?.name || "") === restKey(restNameFor(ts.sourceName, stored)),
  );
  const takenByDate = new Map();
  for (const r of restRowsForSheet) {
    if (!countsAsTaken(r) || !r.date) continue;
    takenByDate.set(r.date, (takenByDate.get(r.date) || 0) + 1);
  }
  // `restTaken` follows `restRecorded` - it is derived from it in `analyzeDay`
  // and `recomputeSheet` never re-runs that, so moving one without the other
  // changes a count nothing reads and leaves the violation exactly as it was.
  // AND THE VIOLATION HAS TO FOLLOW THE COUNT. `recomputeSheet` re-derives only
  // the days an OVERRIDE touched - deliberately, so a day nobody answered about
  // keeps exactly what the engine said at upload - and a rebuild carries no
  // overrides at all. So the day whose count just moved is re-entitled here,
  // and only that day: same rule, different trigger.
  const days = restRowsForSheet.length
    ? daysStored.map((d) => {
        // NEVER FEWER THAN THE DAY ALREADY HAD.
        //
        // The upload resolves the rest report through the staff table, so it can
        // pair a sheet with rows filed under a different spelling of the name.
        // This matches on the sheet's own name and cannot, so a straight
        // recount would report zero for anyone matched that way and take their
        // rest credit off - which is exactly how a recount once invented three
        // premium hours for Delgado Pineda, Ruth, whose rows are all filed under
        // "Delgado Pineda, Angel".
        //
        // Taking the larger of the two makes this strictly additive: it can only
        // ever credit the mis-clicked rows the old rule refused, and can never
        // remove a credit somebody already has.
        const recorded = Math.max(d.restRecorded ?? 0, takenByDate.get(d.date) || 0);
        if (recorded === (d.restRecorded ?? 0)) return d;
        const next = {
          ...d,
          restRecorded: recorded,
          restTaken: restsTakenFrom(recorded, d.restsFromShortMeals),
        };
        return { ...next, ...reentitle(next, next.paidHours) };
      })
    : daysStored;
  // batches uploaded before corrections existed don't carry the punch detail the
  // renderer needs, so there's nothing to rebuild from. say so plainly rather
  // than emit a sheet with an empty punch column.
  if (!daysStored.length || !daysStored.some((d) => Array.isArray(d.punches))) {
    return { ok: false, error: "nodetail" };
  }

  const payPeriod =
    stored.payPeriod || { from: ts.batch.periodFrom, to: ts.batch.periodTo };

  // RE-RUN THE ENGINE, which until now never happened on a stored batch.
  //
  // `rebuildSheetFor` recomputed overtime and re-entitled the days an override
  // touched, but `analyzeDay` itself was last run at upload. So every rule that
  // landed afterwards reached nothing: the two entitlement rules of 2026-08-12
  // move August from 148 premium hours to 106 and July from 676 to 600, and
  // before this line not one of those hours could be seen on any screen.
  //
  // The six inputs `stored.js` drops are rebuilt in `reanalyze.js` - see the note
  // there, and note that rebuilding only `scheduleBlocks` is NOT enough.
  //
  // SIGNED AND APPROVED SHEETS ARE LEFT ALONE. Mánu's position on 2026-08-12 is
  // that nothing goes out officially before Tuesday 2026-08-18, so anything
  // signed before then is null and void anyway - which buys the room to build
  // this, not permission to skip the guard. Both live batches have 0 signed and
  // 0 approved, so today this changes nothing; from the 18th it is the whole
  // difference between a correction and rewriting somebody's signed document.
  // Whether it should instead re-analyse and surface the move is Mánu's call and
  // is still open.
  const frozen = !!(ts.signedAt || ts.approvedAt);
  let reanalysis = { moved: [], skipped: 0, paidDrift: 0, ran: false };
  let analysed = days;
  if (!frozen) {
    const windows = restWindowsByDate(restRowsForSheet, { restRowTimes, clockMin, serviceFit });
    const res = reanalyzeDays(days, {
      scheduleByDate: stored.scheduleCheck?.byDate || null,
      restTimesFor: (date) => windows.get(date) || null,
      // whether a rest report was collected for the BATCH at all, which is what
      // decides `restUnknown`. Not whether it covers this person: uncovered
      // means no break was recorded, which is a premium.
      restSourceAvailable: !!ts.batch?.restsUrl,
      overrides,
    });
    analysed = res.days;
    reanalysis = { ...res, days: undefined, ran: true };
  }
  // A RE-ANALYSIS MUST NOT MOVE WHAT SOMEBODY IS PAID. Paid hours come from the
  // punches and QSP's printed floor, neither of which a rule change touches, so
  // drift here means an input was rebuilt wrongly rather than a rule taking
  // effect. Falling back to the stored days is the safe answer: the sheet keeps
  // the figures it already had instead of publishing hours nobody can explain.
  if (reanalysis.paidDrift > 0) {
    console.error(
      `timesheet re-analysis moved paid hours for ${ts.sourceName} on ${reanalysis.paidDrift} day(s); keeping stored days`,
      reanalysis.moved.filter((m) => m.suspect),
    );
    analysed = days;
  }

  const next = recomputeSheet({ days: analysed, payPeriod, overrides }, applyOvertime, reentitle);

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
        // the rest report's own spelling for this person - see `restNameFor`
        restName: restNameFor(ts.sourceName, stored),
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
        // THE PRISTINE SET, not the one with `restRecorded` re-derived above.
        // That re-derivation is an input to this rebuild, not a new baseline -
        // stashing it would make "as uploaded" mean "as uploaded, plus whatever
        // the rest rule said the last time somebody pressed recompute".
        daysOriginal: daysStored,
        days: next.days,
      },
    },
  });

  revalidatePath(`/portal/admin/timesheets/${ts.batchId}`);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/corrections`);
  // what the re-analysis moved travels back with the result, so a caller that
  // rebuilds a whole batch can say which figures changed rather than leaving it
  // to somebody noticing. Nothing reads it yet; the alternative was throwing the
  // record away at the only point it exists.
  return { ok: true, reanalysis };
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

// THE DAY-PROGRAM REVIEW'S TIME-OFF QUESTION. Token-credentialed like every
// other answer on that page. One "time_off" correction row per sheet holds the
// whole answer - the choice and, on a yes, the day-by-day entries - and
// answering again replaces it, so changing your mind never leaves two claims.
//
// IT WRITES NO PtoEntry AND TOUCHES NO FIGURE. The entries are a claim for the
// office; the record only exists once someone with timesheet access accepts a
// day on the calendar. Status "noted" on purpose: not "open" (an open
// correction blocks signing, and this answer never may), and not
// "accepted"/"declined" (which the review emails read as question answers).
export async function answerTimeOff({ token, choice, entries }) {
  const { verifyTimesheetToken } = await import("@/lib/timesheet-token");
  const tsId = verifyTimesheetToken(token);
  if (!tsId) return { ok: false, error: "auth" };
  if (choice != null && !["yes", "no"].includes(choice)) return { ok: false, error: "badchoice" };

  const ts = await prisma.timesheet.findUnique({
    where: { id: tsId },
    include: {
      batch: { select: { id: true, program: true, periodFrom: true, periodTo: true } },
      corrections: { where: { status: "open" }, select: { id: true } },
    },
  });
  if (!ts) return { ok: false, error: "auth" };
  // the question only exists on day-program sheets, so only they may answer it
  if ((ts.batch.program || "MLS") !== "DP") return { ok: false, error: "unknown" };
  if (ts.signedAt) return { ok: false, error: "already" };
  if (ts.corrections.length) return { ok: false, error: "reported" };

  const clean = choice === "yes"
    ? cleanTimeOffEntries(entries, ts.batch.periodFrom, ts.batch.periodTo)
    : [];
  // a yes with nothing left after validation is not an answer worth storing -
  // it would read back as "you said yes" over an empty list
  if (choice === "yes" && !clean.length) return { ok: false, error: "empty" };

  const prior = await prisma.timesheetCorrection.findFirst({
    where: { timesheetId: ts.id, kind: TIME_OFF_KIND },
    select: { id: true },
  });
  if (choice == null) {
    // taking the answer back off the record, the same rule the question cards
    // follow: an unclicked box with a row still behind it would be a lie
    if (prior) await prisma.timesheetCorrection.delete({ where: { id: prior.id } });
  } else {
    const data = {
      kind: TIME_OFF_KIND,
      status: TIME_OFF_STATUS,
      choice,
      date: null,
      timeOff: clean.length ? clean : null,
    };
    if (prior) {
      await prisma.timesheetCorrection.update({ where: { id: prior.id }, data });
    } else {
      await prisma.timesheetCorrection.create({ data: { ...data, timesheetId: ts.id } });
    }
  }

  revalidatePath(`/t/${token}`);
  await bumpSheetVersion(ts.id);
  await bumpBatchVersion(ts.batch.id);
  return { ok: true };
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
export async function answerTimesheetQuestion({ token, id, choice, at, times, batch, reason, actor }) {
  const { verifyTimesheetToken } = await import("@/lib/timesheet-token");
  const tsId = verifyTimesheetToken(token);
  if (!tsId) return { ok: false, error: "auth" };

  const asked = Array.isArray(batch) && batch.length
    ? batch.map((b) => ({
      id: b?.id, choice: b?.choice, at: b?.at ?? null, times: b?.times || null,
      // WHY THEY MISSED IT. Only ever read on a "no" to a break question - see
      // `NEEDS_REASON` below.
      reason: b?.reason ?? null,
    }))
    // A SINGLE QUESTION CAN CARRY TIMES TOO. It could not until 2026-08-11, so a
    // grouped card covering three days had one box for the lot - which asked
    // somebody to pick which of their three days to be honest about.
    : [{ id, choice, at: at ?? null, times: times || null, reason: reason ?? null }];
  if (asked.length > 40) return { ok: false, error: "toomany" };
  // "partial" is a rest day where they got SOME of their tens. It settles as a
  // DECLINE - one hour per workday on which a rest period was not provided, so
  // one of two is the same premium as none of two - but it keeps the times for
  // the ones they did get, which a plain decline clears.
  // A NULL CHOICE TAKES AN ANSWER BACK OFF THE RECORD. Mánu 2026-08-11:
  // "clicking on a box clicked should also unclick the box." Unhighlighting it
  // while the row stayed in the database would have been a lie on screen.
  // "notaken" is the third outcome on `restOutsideScheduled`: the break never
  // happened at all, so the minutes are not added AND it stops counting as a
  // rest taken. Distinct from "no", which means the time was wrong.
  // "wrongone" is the third outcome on `restTooLongOffClock`, on a day carrying
  // two lunches: only one happened and the RECORDED one is it, so the lunch on
  // the schedule is the record to remove. Distinct from "no", which says the
  // recorded one is the mis-entry - opposite conclusions, same decline.
  // "worked" is the Misc card's third answer - the time WAS worked, it just was
  // not booked to a client. It was missing from this list, so the one answer on
  // that card that puts the hours back into the count deciding whether a break
  // was owed came back `badchoice` in a millisecond, and `badchoice` had no
  // words, so it read as "that didn't save, refresh and try again". The two
  // reachable answers both said the time was not worked. 54 of these on the
  // current upload over 29 people, 30 in July.
  //
  // The engine always knew it: `patchesFor` maps "worked" to `miscWorked`, and
  // the reviewer control passes the same string through `classifyMiscTime`
  // without trouble. Only this guard never learned it.
  // "cancelled" is the Misc card's fourth answer since 2026-08-17: a client
  // cancellation, paid but not worked, whose block counts as unscheduled.
  if (asked.some((a) => a.choice != null
      && !["yes", "no", "partial", "notaken", "wrongone", "worked", "cancelled"].includes(a.choice))) {
    return { ok: false, error: "badchoice" };
  }
  // SAYING YOU MISSED A BREAK NEEDS A REASON, and it is enforced here as well as
  // in the browser.
  //
  // Not because silence is suspicious - leaving the whole question alone is
  // still fine and still keeps the pay, which is what `signingGate` settled on
  // 2026-08-12. It is that a "no" IS the violation, and the why is the one half
  // no QSP export has a field for. Answering without it produces a record that
  // says a break was missed and cannot say why, which is the exact hole this
  // work exists to close. Mánu 2026-08-14 chose required over optional.
  //
  // ONE MAP, SHARED WITH THE BROWSER. It was a copy each and the two could
  // drift, which gives you a button that saves nothing or one that refuses what
  // the server would have taken. `REASON_ON` in break-answers.js is the rule
  // now, with the reasoning for every entry in it, including which answer owes
  // the sentence on each kind and why a partial owes one.

  const ts = await prisma.timesheet.findUnique({
    where: { id: tsId },
    include: {
      // `periodFrom`/`periodTo` are for the break answer this action can now
      // write. A break answer is keyed on the PERIOD and not on the batch, so
      // an answer given against one export is still the answer on the next -
      // and left out of this select they arrive as undefined, which Prisma
      // takes as a missing required field rather than as a bug worth naming.
      batch: {
        select: {
          id: true, restsByDate: true, restsUrl: true,
          periodFrom: true, periodTo: true, program: true,
        },
      },
      corrections: { where: { status: "open" }, select: { id: true } },
    },
  });
  if (!ts) return { ok: false, error: "auth" };
  if (ts.signedAt) return { ok: false, error: "already" };
  if (ts.corrections.length) return { ok: false, error: "reported" };

  // WHO IS ACTUALLY ANSWERING. The token is the only credential this action
  // requires, so the employee on their emailed link and a reviewer on the
  // preview link arrive looking identical - and until now every answer was
  // recorded as the employee's, whoever was driving. A signed-in session with
  // timesheet access is the tell. `realRole` because a SUPER viewing-as a
  // lower role on a call is still the one recording the answer.
  //
  // This is what lets the premium counters hold the line: an hour the employee
  // waves off stays in the locked projected figure until they sign, and only
  // an hour a reviewer recorded settles on its own.
  //
  // EXCEPT WHEN THE ANSWER IS THEIRS AND THE REVIEWER IS ONLY TYPING IT. Live
  // mode exists for the call where they cannot get the page up on their phone:
  // they are giving the answer, it is read back to them, and their signature is
  // still required before any of it counts. Filing that under the reviewer would
  // claim they said nothing.
  //
  // Only the server sets this. It is bound on the page in live mode and never
  // travels from the browser, so nothing a client sends can pick who an answer
  // belongs to. It also only ever moves attribution the CONSERVATIVE way: an
  // employee-owned answer leaves its hour on the projected figure until the
  // signature lands, where a reviewer-owned one would settle it immediately.
  // Getting it wrong reads high, never short.
  const viewer = await getCurrentUser();
  const answeredById = actor === "employee"
    ? (ts.userId || null)
    : answerActorId(
      viewer,
      canManageTimesheets(viewer?.realRole || viewer?.role),
      ts.userId,
    );

  // THE SAME QUESTION SET THE PAGE BUILT, or this refuses what it just showed.
  //
  // This action re-derives the questions and will not accept an answer to one
  // it cannot find - which is the right defence, and it broke the moment the
  // review page started keeping an answered Misc question on the page. The page
  // knew a reviewer had not settled that day; this did not, so it rebuilt
  // without the question and sent back "that question is not on this timesheet
  // any more" for an answer somebody was looking at.
  const questions = buildQuestions(ts.data, {
    restRows: ts.batch.restsByDate || [],
    sourceName: ts.sourceName,
    reviewerSettled: reviewerSettledDates(ts.overrides),
  });
  // AND THE ONES THE PAGE PUT BACK, which a rebuild here can never produce.
  //
  // An answer that resolves its finding deletes its own question, so the page
  // restores it from the snapshot frozen on the correction row to keep "Change
  // this" reachable. This action rebuilt from the sheet and found only the
  // questions still open, so every restored card it was sent came back
  // "unknown" - and because that refusal drops the WHOLE batch, one resolved
  // day sitting in a batched card meant no answer on any day in it could ever
  // save. A card holding a settled day and an open one was a dead end: the open
  // day could not be answered, and an unanswered question blocks signing.
  //
  // Read from the same snapshots the page reads, so the two sides agree on what
  // was asked. The defence is unchanged: a snapshot has to already exist on a
  // correction row belonging to THIS timesheet, so a client still cannot answer
  // something nobody put to them.
  const restoredQuestions = new Map();
  for (const row of await prisma.timesheetCorrection.findMany({
    where: { timesheetId: ts.id, kind: { startsWith: "q_" }, status: { not: "open" } },
    select: { question: true },
  })) {
    const q = row.question;
    if (q?.id && !questions.some((x) => x.id === q.id)) restoredQuestions.set(q.id, q);
  }
  // RESOLVE AND VALIDATE EVERYTHING BEFORE WRITING ANYTHING. A batch where the
  // ninth day carries a time we cannot read must not leave the first eight
  // written and the sheet half rebuilt.
  const resolved = [];
  for (const a of asked) {
    // the live question wins, so a day whose figures have since moved is
    // validated against what it asks NOW rather than what it asked then
    const q = questions.find((x) => x.id === a.id) || restoredQuestions.get(a.id);
    if (!q) return { ok: false, error: "unknown", at: { id: a.id } };

    // a typed time is only meaningful where the question asks for one
    let stated = null;
    if (a.choice === "yes" && q.canGiveTime && a.at != null && a.at !== "") {
      const start = hhmmToMin(a.at);
      // the single-box path, which has no `need` to name - the question's own
      // date is the location, and the typed value is quoted back either way
      const badAt = { id: q.id, date: q.date, label: "the time you gave" };
      if (start == null) return { ok: false, error: "badtime", given: a.at, at: badAt };
      if (start + FULL_REST_MIN > 1439) {
        return { ok: false, error: "badtime", given: a.at, at: badAt };
      }
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
    if ((a.choice === "yes" || a.choice === "partial" || a.choice === "no") && q.needs?.length
        && (q.needsOn || "yes") === (a.choice === "partial" ? "yes" : a.choice)) {
      const given = a.times || {};
      const list = [];
      for (const need of q.needs) {
        const raw = given[need.slot];
        const start = hhmmToMin(raw);
        // A PARTIAL LEAVES BLANKS ON PURPOSE - the empty slots ARE the breaks
        // they are telling us they did not get. What it may not be is empty
        // throughout, which is checked once the loop has run.
        if (start == null) {
          if (a.choice === "partial") continue;
          return {
            ok: false, error: "missingtime",
            at: { id: q.id, date: need.date || q.date, slot: need.slot, label: need.label },
          };
        }
        if (start + need.minutes > 1439) {
          return {
            ok: false, error: "badtime", given: raw,
            at: { id: q.id, date: need.date || q.date, slot: need.slot, label: need.label },
          };
        }
        // A REST HAS TO LAND INSIDE A SHIFT, and inside its own half of one.
        // Checked here as well as in the browser: the card above this exists
        // because a ten was logged outside a shift, and a client that skipped
        // the check could write exactly that through this route.
        if (need.kindOf === "rest") {
          const d = (ts.data?.days || []).find((x) => x.date === (need.date || q.date));
          // THE ORDINAL THE QUESTION BUILT ITS WINDOW FROM, not one parsed
          // back out of the slot name. `rest1` is the first slot OFFERED, which
          // on a day already holding one ten is the SECOND ten - so parsing it
          // checked the answer against a window the person was never shown.
          // Falls back to the old reading for a question built before this
          // carried it.
          const ordinal = need.ordinal
            || Number(String(need.slot).replace(/\D/g, ""))
            || 1;
          if (d && !restTimeFits(d, ordinal, start, need.minutes).ok) {
            return {
              ok: false, error: "outsideshift", given: raw,
              at: {
                id: q.id, date: need.date || q.date, slot: need.slot, label: need.label,
                // the hours it HAS to be inside, which the question already
                // worked out - the person needs the target, not the verdict
                shifts: need.shifts || null, window: need.window || null,
              },
            };
          }
        }
        // A LUNCH HAS TO LAND IN A GAP LONG ENOUGH TO HOLD ONE. Mánu
        // 2026-08-12: "let them choose their own as long as the time is 30
        // minutes of availability for lunch."
        //
        // ONLY "window" IS REFUSED, never "nogap". On 176 of the 263 meal slots
        // in this batch there is no half-hour gap anywhere in the day - because
        // a meal taken without clocking out leaves no gap to find, which is the
        // whole reason nothing documented it. Refusing those would mean the only
        // answer left is "I missed it", and the tool would be telling somebody
        // who took their lunch that they did not. So the rule constrains WHERE
        // when the punches show availability, and stays quiet when they show
        // nothing at all.
        if (need.kindOf === "meal") {
          const d = (ts.data?.days || []).find((x) => x.date === (need.date || q.date));
          if (d && mealTimeFits(d, start, need.minutes).why === "window") {
            return {
              ok: false, error: "nolunchgap", given: raw,
              at: {
                id: q.id, date: need.date || q.date, slot: need.slot, label: need.label,
                windows: need.windows || null,
              },
            };
          }
        }
        // A TIME ALREADY ON THE RECORD IS NOT AN ANSWER to a question about a
        // break with no record - see collidesWithRecorded for the case that
        // taught this. A slot carrying `replaces` is correcting a recorded row
        // and is the one shape allowed to name a recorded time.
        if (!need.replaces && collidesWithRecorded(need.known, start, need.minutes)) {
          return {
            ok: false, error: "alreadyrecorded", given: raw,
            at: { id: q.id, date: need.date || q.date, slot: need.slot, label: need.label },
          };
        }
        // AND ONE TEN PER SHIFT - QuickSolve holds one 10-minute rest per
        // shift, so a second ten stated into a shift that already has one
        // (recorded, or stated a slot earlier on this same card) is a record
        // the office could never enter. See shiftAlreadyHasTen.
        if (!need.replaces && need.kindOf === "rest") {
          const dayRow = (ts.data?.days || []).find((x) => x.date === (need.date || q.date));
          const occupied = [
            ...(need.known || []).map((k) =>
              hhmmToMin(parseLooseTime(String(k?.from || ""), { assumeWorkday: true }))),
            ...list
              .filter((b) => b.kindOf === "rest" && !b.replaces && (b.date ?? null) === (need.date ?? null))
              .map((b) => hhmmToMin(parseLooseTime(String(b.from || ""), { assumeWorkday: true }))),
          ];
          if (dayRow && shiftAlreadyHasTen(dayRow, occupied, start, need.minutes)) {
            return {
              ok: false, error: "shifthasten", given: raw,
              at: {
                id: q.id, date: need.date || q.date, slot: need.slot, label: need.label,
                shifts: need.shifts || null,
              },
            };
          }
        }
        // WHICH KIND OF TIME THIS IS, decided here rather than taken from the
        // client. It only drives the sheet's footnote, but "you typed this" is
        // a claim about where a figure on a signed document came from and a
        // browser does not get to assert it.
        const from = shortClock(start);
        const source =
          need.prefill && from === need.prefill ? "schedule"
            : (need.suggest && from === need.suggest) || (need.options || []).includes(from) ? "gap"
              : "typed";
        list.push({
          slot: need.slot, kindOf: need.kindOf, minutes: need.minutes,
          from, to: shortClock(start + need.minutes), source,
          // the date this one belongs to, and the recorded row it supersedes.
          // Both only exist on kinds whose slots are per-day; everything else
          // leaves them undefined and nothing downstream looks for them.
          date: need.date ?? null,
          replaces: need.replaces ?? null,
        });
      }
      // A PARTIAL WITH NOTHING FILLED IN. It is about the whole card rather than
      // one slot - they are telling us they got SOME of their tens and have not
      // said which - so the day is the location and there is no slot to name.
      if (a.choice === "partial" && !list.length) {
        return { ok: false, error: "missingtime", at: { id: q.id, date: q.date } };
      }
      statedBreaks = list;
    }

    // the why, checked against the question we re-derived rather than against
    // whatever the client said the question was
    // WHAT THE UNPUNCHED BLOCK BECOMES, on the one kind that asks for it.
    // Free text: it is an instruction for QuickSolve, not a figure this sheet
    // computes with. Refused where the question does not ask, so a client
    // sending one on any other kind cannot get it stored.
    const block = q.wantsBlock && a.choice === "yes"
      ? String(a.block ?? "").trim().slice(0, 120)
      : "";
    if (q.wantsBlock && a.choice === "yes" && !block) {
      return { ok: false, error: "needblock", at: { id: q.id, date: q.date } };
    }
    const why = String(a.reason ?? "").trim().slice(0, 1000);
    if (reasonOwedOn(q.kind, a.choice) && !why) {
      // WHICH DAY, not just that one of them is short. This card commits every
      // day it holds in a single write, so a bare code points at thirteen at
      // once and the person has to hunt for the one that stopped it.
      return { ok: false, error: "needreason", at: { id: q.id, date: q.date } };
    }
    resolved.push({ q, choice: a.choice ?? null, stated, statedBreaks, reason: why || null, block: block || null });
  }

  // WHY THEY MISSED IT, WRITTEN AS THE SAME ROW A REVIEWER WOULD HAVE WRITTEN.
  //
  // A break answer can now be created from two ends: a reviewer pressing
  // "Confirm not taken" after a call, and the employee saying they missed it
  // here. It is the same fact about the same day, so it has to be the same ROW -
  // `breakFindingKey` is the shared spelling, and two spellings would be two
  // records that can disagree with both printing on the sheet.
  //
  // WHOEVER GETS THERE FIRST. Until now the employee could only ever CONFIRM a
  // reason somebody had already recorded for them - `answerBreakReason` refuses
  // anything with no row, "they can only answer something they were actually
  // asked" - and `TimesheetBreakAnswer` sat at 0 rows, so no employee could
  // comment on anything at all. The defence that note describes is unchanged:
  // the question is re-derived from their own sheet above, so a client still
  // cannot answer something nobody put to them.
  //
  // OURS IS NEVER OVERWRITTEN. If a reviewer already recorded a reason from a
  // call, theirs lands in `confirmedText` beside it and both print - which is
  // what `formatBreakComments` already does with the two, and the reason it
  // tags provenance on every line.
  //
  // ONLY ON A "no". Answering "yes, I took them" does NOT delete an existing
  // row: a reviewer's record of a phone call is not the employee's to erase,
  // and the two genuinely disagreeing is a thing for a person to settle.
  // WHICH SLOT A KIND'S SENTENCE IS FILED UNDER lives in break-answers.js with
  // the rule that decides who owes one. A late meal keeps its own key, because a
  // late meal and a missing meal are different questions about the same day and
  // must not land on one row.
  const writeBreakAnswer = async (q, date, why) => {
    const kind = reasonSlotFor(q.kind);
    const findingKey = breakFindingKey(kind, date);
    // no account behind the sheet means no person to hang it off, which is the
    // same reason `answerBreakReason` refuses one
    if (!findingKey || !ts.userId || !why) return;
    const where = {
      program_periodFrom_periodTo_personKey_findingKey: {
        program: ts.batch.program || "MLS",
        periodFrom: ts.batch.periodFrom,
        periodTo: ts.batch.periodTo,
        personKey: ts.userId,
        findingKey,
      },
    };
    // NAMED `prior`, DELIBERATELY. question-coverage.test.mjs reads this file as
    // TEXT and slices the correction record out of it between two landmarks, the
    // second being the existence check before that write. A second check spelled
    // the same way, anywhere above it, silently empties the slice and the test
    // passes on nothing. Renamed here rather than loosening an assertion that
    // exists to catch a real bug - and this note is worded to avoid the landmark
    // too, because a comment quoting it breaks it exactly as the code would.
    const prior = await prisma.timesheetBreakAnswer.findUnique({ where });
    if (prior) {
      // THEIR OWN WORDS, REPLACEABLE BY THEM.
      //
      // Two different questions can be about the same day and the same break: a
      // rest entry we could not read and a day with nothing recorded are both
      // that day's rests, and they share this row on purpose, because the day is
      // the unit. 12 day/slot pairs across the two live batches are like this.
      //
      // This refused to touch an existing sentence at all, so a second question
      // could not discard the first one's. That protected the right thing the
      // wrong way: the person it made the sentence read only to was the one who
      // wrote it, and there was no way to correct a reason once given.
      //
      // The card seeds the box with whatever is on record now, so nothing can be
      // replaced without being on screen first - an untouched answer sends the
      // same words straight back and this update is a no-op. That is a better
      // guarantee than refusing, and it is the one that lets them fix a typo.
      await prisma.timesheetBreakAnswer.update({
        where: { id: prior.id },
        // ours stays in `reason`; theirs goes in `confirmedText` beside it. Where
        // nobody recorded one, theirs IS the only reason there is and fills both.
        data: prior.reason
          ? { confirmedAt: new Date(), confirmedText: why }
          : { reason: why, via: null, confirmedAt: new Date(), confirmedText: why },
      });
      return;
    }
    await prisma.timesheetBreakAnswer.create({
      data: {
        program: ts.batch.program || "MLS",
        periodFrom: ts.batch.periodFrom,
        periodTo: ts.batch.periodTo,
        personKey: ts.userId,
        findingKey,
        date,
        kind,
        answer: "not-taken",
        reason: why,
        // `via` is how WE heard it - phone, email, in person. None of those is
        // true of somebody typing it on their own page, so it stays null.
        via: null,
        confirmedAt: new Date(),
        confirmedText: why,
        // a meal is one thing; a rest violation carries the day's shortfall, and
        // the question knows it because the slots were built from it
        missingCount: kind === "rest" ? Math.max(1, (q.needs || []).length) : 1,
        takenCount: 0,
        // scalars, recording who said it AT THE TIME - the same rule the check
        // flags follow, so a later rename or a closed account cannot rewrite it
        byId: ts.userId,
        byName: ts.sourceName || null,
      },
    });
  };

  // record the answers first, so rebuilding the overrides below sees them
  for (const { q, choice: pick, stated, statedBreaks, reason, block } of resolved) {
    const kindKey = `q_${q.kind}`;
    const dates = q.dates || [q.date];
    // UNANSWERED AGAIN. Scoped to this sheet, this kind and these dates - never
    // a bare delete - and the override rebuild below then runs without it, so
    // the sheet goes back to what it said before they answered.
    if (pick === null) {
      await prisma.timesheetCorrection.deleteMany({
        where: { timesheetId: ts.id, kind: kindKey, date: { in: dates }, status: { not: "open" } },
      });
      continue;
    }
    for (const date of dates) {
      const existing = await prisma.timesheetCorrection.findFirst({
        where: { timesheetId: ts.id, date, kind: kindKey },
        select: { id: true },
      });
      const record = {
        // THE QUESTION AS IT WAS ASKED, so the card survives being answered.
        //
        // An answer that resolves its finding deletes its own question, and the
        // card is what carries "Change this" - so answering used to be the end
        // of any chance to correct a mis-click. Every premium-bearing issue has
        // to stay on their page and stay changeable until they sign, because
        // the correction happens on a phone call and they need to watch it land.
        //
        // Frozen HERE rather than rebuilt later: `data.daysOriginal` was
        // measured and cannot produce it - the answered miscTime question is
        // absent from the pristine days too. `q` is the object this action
        // already validated the answer against, so the snapshot is exactly what
        // was put to them and not a reconstruction of it.
        question: q,
        // a partial and a "never took it" both settle as declines: the premium
        // stands either way, and what differs is the record
        status: pick === "yes" ? "accepted" : "declined",
        // the answer itself, because `status` cannot hold a third outcome and
        // two of `restTooLongOffClock`'s three are declines that move nothing
        choice: pick,
        resolvedAt: new Date(),
        // the person who actually gave the answer - the employee on their own
        // link, or the reviewer recording it for them. Every row before
        // 2026-08-17 carries the employee's id whoever was driving.
        resolvedById: answeredById,
        note: `Asked about the ${date} ${questionNoun(q.kind)}.`,
        resolutionNote: resolutionFor(q, pick, stated, statedBreaks, block),
        // WHATEVER THE ANSWER ACTUALLY COLLECTED, and nothing else.
        //
        // This used to null the times on any "no", which was right while "no"
        // always meant "I never got it". It is not right for a card whose "no"
        // IS the one that asks for times: `restOutsideScheduled` collects them
        // on the decline, and clearing them lost the very thing that tells "I
        // took it during a shift" apart from "I did not take it at all". Mánu
        // 2026-08-11: "when i chose those time options it goes back to selecting
        // i did not take it at all."
        //
        // Storing the resolved value clears them just as well where it should:
        // `statedBreaks` is only ever built when the chosen answer is the one
        // this kind asks times on, so changing from "yes I took them" to "no I
        // missed them" still lands null and still wipes the old times.
        //
        // SCOPED TO THIS DATE where the slots carry one. A grouped question
        // writes a row per date, and the whole list was going onto every one of
        // them - so Uribe's 07/28 carried the times for 07/29 and 07/31 too, and
        // his sheet would have drawn three rests on a day with one.
        statedBreaks: statedBreaks
          ? statedBreaks.filter((b) => !b.date || b.date === date)
          : null,
      };
      if (existing) {
        await prisma.timesheetCorrection.update({ where: { id: existing.id }, data: record });
      } else {
        await prisma.timesheetCorrection.create({
          data: { timesheetId: ts.id, date, kind: kindKey, ...record },
        });
      }
      // and the why, as the row a reviewer would have written - see
      // `writeBreakAnswer`. Only on a "no", which is the answer that IS the
      // violation.
      // on whichever answer this kind hangs its sentence off - see `REASON_ON`
      // in break-answers.js, which both sides read
      if (reasonOwedOn(q.kind, pick)) await writeBreakAnswer(q, date, reason);
    }
  }

  // rebuild EVERY override from every answer on record, this one included
  const answers = await prisma.timesheetCorrection.findMany({
    where: { timesheetId: ts.id, kind: { startsWith: "q_" }, status: { not: "open" } },
    // `choice` IS NEEDED HERE. `status` holds accepted or declined and cannot
    // say which of three outcomes somebody picked, so a Misc answer of "I was
    // working" rebuilt as "sick pay" - both are declines. Left out of this
    // select it arrives undefined, which is the same failure shape as every
    // other column this file has been caught by.
    // `resolvedById` is the provenance: whose answer each patch carries, which
    // the reband markers in recomputeSheet turn into "settles on its own"
    // versus "waits for the signature".
    select: { date: true, kind: true, status: true, choice: true, resolutionNote: true, statedBreaks: true, resolvedById: true },
  });
  // WHICH RESOLVERS ACTUALLY REVIEW TIMESHEETS, looked up fresh. Judging
  // "admin" off nothing but "differs from the sheet's userId" flips every old
  // answer to a reviewer's the day a sheet is re-matched - see actorKindFor.
  const otherResolverIds = [...new Set(
    answers.map((a) => a.resolvedById).filter((x) => x && x !== ts.userId),
  )];
  const reviewerIds = new Set(
    otherResolverIds.length
      ? (await prisma.user.findMany({
          where: { id: { in: otherResolverIds } },
          select: { id: true, role: true },
        })).filter((u) => canManageTimesheets(u.role)).map((u) => u.id)
      : [],
  );
  // AND KEEP WHAT A REVIEWER SAID, WHICH IS NOT AN ANSWER ON THIS LIST.
  //
  // This started from {} and refilled itself from the corrections alone, so
  // every override written by anything OTHER than an employee answer was thrown
  // away the next time that employee answered anything at all.
  //
  // `classifyMiscTime` is the one that writes them: a reviewer saying a day's
  // Misc was PTO, sick pay or hours worked stores it here rather than as a
  // correction, because it is not a reply to a question. So Gabe classifying a
  // day at noon and the employee answering any question that evening silently
  // undid the classification, on a sheet whose admin screen went on showing it
  // as recorded, by name and to the minute.
  //
  // Only the misc fields and their provenance are carried over. Everything else
  // in here IS derived from the answers and has to be rebuilt, or a stale patch
  // from an answer somebody has since changed would survive as well.
  // the same list `clearMiscClassification` removes, so a sixth field added to
  // `patchesFor` is carried here without anybody remembering to
  const KEEP = new Set([...MISC_PATCH_FIELDS, "_was", "_by", "_at", "_source"]);
  const overrides = {};
  for (const [date, ov] of Object.entries(ts.overrides || {})) {
    if (ov?._source !== "misc-classify") continue;
    const kept = Object.fromEntries(Object.entries(ov).filter(([k]) => KEEP.has(k)));
    if (Object.keys(kept).length) overrides[date] = kept;
  }
  // PATCH THE PRISTINE DAY, NEVER THE ALREADY-PATCHED ONE.
  //
  // `rebuildSheetFor` has recomputed from `daysOriginal` since 2f0b194 for
  // exactly this reason, and this loop was left reading `data.days` - which the
  // PREVIOUS answer has already rewritten. It did not matter while every patch
  // was a boolean or was derived from a stored minute count; it matters the
  // moment one sets an absolute figure.
  //
  // Mánu 2026-08-11, on his own sheet: he answered "I took it during a shift"
  // (6.17 -> 6.00), then changed to "yes, that is when I took it". The second
  // patch computed its target from the 6.00 the first one had written, so it
  // landed back on 6.00 and his hours stayed down. It reads as "I cannot change
  // my answer once I confirm it", which is what he reported.
  const pristine = ts.data?.daysOriginal || ts.data?.days || [];
  // EVERY ANSWER ON RECORD, NOT EVERY QUESTION STILL BEING ASKED.
  //
  // This walked the live question set, and several kinds DELETE their own
  // question by being answered - a classified Misc day raises nothing, so does a
  // late lunch declined, so does a documented break. The next answer given on
  // the sheet then rebuilt the overrides without them and silently undid them.
  //
  // Beall 07/20 is the case: "paid time off" wrote its correction, the override
  // computed correctly, and answering a second day wiped it. The correction sat
  // on record with `miscKind` never moving.
  //
  // So the answers drive the loop now. Where the question still exists it is
  // used, because `patchesFor` reads `row` on a few kinds; where it has gone, a
  // stub carries what those kinds actually need, which is the kind and the date.
  // The kinds that vanish are exactly the ones whose patch depends on neither.
  const stubFor = (a) => {
    const kind = String(a.kind || "").replace(/^q_/, "");
    const part = kind === "nothingDocumentedMeal" ? "meal"
      : kind === "nothingDocumentedRest" ? "rest" : null;
    return {
      kind,
      date: a.date,
      row: part ? { part, meal: part === "meal", rest: part === "rest" } : {},
    };
  };
  const seen = new Set();
  for (const a of answers) {
    const q2 = questions.find(
      (x) => `q_${x.kind}` === a.kind && (x.dates || [x.date]).includes(a.date),
    ) || stubFor(a);
    for (const date of [a.date]) {
      if (!date || seen.has(`${a.kind}|${date}`)) continue;
      seen.add(`${a.kind}|${date}`);
      const day = pristine.find((d) => d.date === date);
      // WHICH OF THE THREE, rebuilt from what the row carries. A declined
      // `restOutsideScheduled` with times on it is "I took it earlier"; one
      // without is "I never took it", and only the second drops the rest count.
      // Same shape as the partial - no third status, no migration.
      const hasTimes = Array.isArray(a.statedBreaks) && a.statedBreaks.length > 0;
      // WHAT THEY ACTUALLY PICKED, where the row remembers it. `choice` is the
      // only thing that can tell three outcomes apart; the status fallback is
      // for rows written before that column existed.
      const back = a.choice
        || (a.status === "accepted"
          ? "yes"
          : q2.kind === "restOutsideScheduled" && !hasTimes ? "notaken" : "no");
      const patch = patchesFor(q2, back, day);
      const clean = Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v != null),
      );
      if (Object.keys(clean).length) {
        overrides[date] = { ...(overrides[date] || {}), ...clean };
        // WHOSE ANSWER is behind each violation flag this patch touches.
        // recomputeSheet's reband reads these when an answer takes a premium
        // off a day that owed one: "admin" settles the hour on its own,
        // "employee" keeps it in the original figure until the signature
        // lands. Stamped per flag because a day can carry a meal answer from
        // a reviewer's call and a rest answer the employee gave themselves,
        // and the two must not share a fate.
        const by = actorKindFor(a.resolvedById, ts.userId, reviewerIds);
        if ("mealViolation" in clean) overrides[date]._mealAnsweredBy = by;
        if ("restViolation" in clean) overrides[date]._restAnsweredBy = by;
        // AND THE DATE-LEVEL FALLBACK, for the drops no flag ever names. An
        // answer that moves paid hours - "that ten was inside my shift",
        // 6.17 to 6.00 - lets the re-derivation waive the meal and drop the
        // second rest without any violation key in the patch, and the reband
        // still has to know whose answer did it. Employee wins a mixed date
        // on purpose: the conservative reading keeps the hour visible.
        overrides[date]._answeredBy =
          overrides[date]._answeredBy === "employee" || by === "employee"
            ? "employee"
            : "admin";
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
  await bumpSheetVersion(ts.id);
  // AND THE REVIEWER SCREENS. An employee answering is the one direction that
  // never reached them: the five flag actions bumped this counter and nothing in
  // here did, so a day view sat on the old state until somebody reloaded it -
  // which is the screen you watch to see what is still outstanding.
  await bumpBatchVersion(ts.batchId);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/person/${ts.id}`);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/checks`);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/people`);
  return { ok: true, answered: resolved.length };
}


function resolutionFor(q, choice, stated, statedBreaks, block) {
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
    case "restOutsideScheduled":
      // CONFIRMING KEEPS THE TIME HERE, unlike every other kind. The question is
      // whether the recorded time is right, not whether the break happened.
      //
      // NO PAY LANGUAGE AND NO SHOUTING. "The minutes stand as paid" and
      // "FLAG FOR PAYROLL: the ten is being entered against the wrong time in
      // QSClock" both came out 2026-08-12 at Mánu's instruction. The note is a
      // record of what the employee said; what it does to pay is worked out
      // from the answer, not asserted in prose beside it.
      return yes
        ? "Employee confirmed they took the break at the time recorded, off the clock."
        : "Employee said the recorded time was wrong" +
          ((statedBreaks || []).length
            ? `, and gave ${statedBreaks.map((b) => `${b.from}-${b.to}`).join(", ")} instead`
            : "") +
          ". The break has been moved to the time they gave.";
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
      // A PARTIAL IS A DECLINE THAT CARRIES TIMES. Same hour either way - the
      // law pays one per workday a rest period was not provided - so the note
      // has to be the thing that records which of them they actually got.
      if (choice === "partial") {
        const got = (statedBreaks || []).map((b) => `${b.from}-${b.to}`).join(", ");
        return `Employee says they got SOME of their rest periods that day${got ? `, at ${got}` : ""}, and not the rest. `
          + "Premium stands - one hour per workday a rest period was not provided, per UPS v. Superior Court.";
      }
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
      // NO ANSWER MOVES A FIGURE. The row was already not counted and the day
      // already stands as it stands; this exists so the record says what
      // happened rather than the entry being binned unexamined.
      //
      // THREE OUTCOMES on a day carrying two lunches, and the last two reach
      // OPPOSITE conclusions about which record is wrong - so payroll is told
      // which one to go and remove, not just that something is wrong.
      if (choice === "wrongone") {
        return "Employee says only one lunch happened and the RECORDED one is it. "
          + "The lunch on their schedule is the wrong record - remove that one in QSP. "
          + "No change to hours or premium.";
      }
      if (q.row?.twoLunches) {
        return yes
          ? "Employee confirmed both lunches are real. Both stand; no change to hours or premium."
          : "Employee says the second lunch was entered by accident. Flagged for payroll to remove "
            + "that entry in QSP; no change to hours or premium.";
      }
      return yes
        ? "Employee confirmed this was a real break they took. Recorded as taken; no change to hours or premium."
        : "Employee says the entry was a mistake. Flagged for payroll as a mis-entry; no change to hours or premium.";
    // THE ROSTER PUT THE MEAL INSIDE A BLOCK THEY WERE WORKING.
    //
    // The clocked one has a single answer, so the note records the fact rather
    // than a choice: the schedule is what is wrong and the premium stands.
    // The movable one CAN move a figure, so it says which way it went and what
    // has to change at source either way.
    case "mealInShift":
      return "The meal break is rostered inside a shift they clock in and out of, so it could not "
        + "have been taken. Premium stands. The schedule needs the meal moved outside the shift.";
    case "mealMovable":
      return yes
        ? "Employee says the unpunched block can be rearranged and the meal break was taken"
          + (statedBreaks?.[0]?.from ? ` at ${statedBreaks[0].from}` : "")
          + ". Meal premium removed for this day. "
          + `Change the ${q.row?.service || "block"} on this day to ${block || "the time they gave"} in QSP.`
        : "Employee says the block cannot be rearranged, so the meal break could not have been "
          + "taken. Premium stands.";
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
// SOMEBODY HAS SEEN A BACKWARDS ENTRY AND TAKEN IT ON.
//
// `attention` is set on exactly one thing - a rest row the report holds the
// wrong way round, `!row.repair && !!row.reversed`. There is nothing to answer:
// the engine already reads it the right way round and already counts the break.
// What was missing was any way to say "seen", so the row sat there permanently
// and the panel at the top could never tick it off. The QSP entry itself is the
// office's to swap now - the review corrections email carries that instruction.
//
// KEYED TO THE SHEET, NOT THE PERIOD, and that is the point. A break answer is
// keyed to the period so it survives a re-upload; this must NOT. Mánu 2026-08-15:
// if the next export still has the times backwards, it should still ask. A new
// upload is a new sheet with no acknowledgement on it, so the row comes back on
// its own - and if they really did fix it, the reversed row is not in the export
// at all and there is nothing to come back.
//
// The row is identified by its date and the minute it draws at, because the rest
// report gives it no id of its own - it is derived on every render.
export async function acknowledgeSpan({ token, date, min, undo = false }) {
  const { verifyTimesheetToken } = await import("@/lib/timesheet-token");
  const id = verifyTimesheetToken(token);
  if (!id) return { ok: false, error: "auth" };
  if (!date || !Number.isFinite(Number(min))) return { ok: false, error: "missing" };

  const ts = await prisma.timesheet.findUnique({
    where: { id },
    select: { id: true, batchId: true, signedAt: true },
  });
  if (!ts) return { ok: false, error: "notfound" };
  if (ts.signedAt) return { ok: false, error: "signed" };
  {
    const newer = await supersededByForTimesheet(id);
    if (newer) return refusal(newer);
  }

  const kind = `fix_reversed_${Math.round(Number(min))}`;
  if (undo) {
    await prisma.timesheetCorrection.deleteMany({ where: { timesheetId: ts.id, kind, date } });
  } else {
    const prior = await prisma.timesheetCorrection.findFirst({
      where: { timesheetId: ts.id, kind, date },
      select: { id: true },
    });
    if (!prior) {
      await prisma.timesheetCorrection.create({
        data: {
          timesheetId: ts.id, date, kind,
          status: "accepted",
          resolvedAt: new Date(),
          note: `Acknowledged the reversed rest entry on ${date}.`,
          resolutionNote: "Employee has seen the backwards entry. Its out and in times still need "
            + "swapping in QSP. Nothing moves: the engine already reads it the right way round and already counts the break.",
        },
      });
    }
  }
  // NOTHING IS REBUILT. No figure moves either way - this is a record that
  // somebody has taken it on, not a correction to the sheet.
  revalidatePath(`/t/${token}`);
  await bumpSheetVersion(ts.id);
  await bumpBatchVersion(ts.batchId);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/person/${ts.id}`);
  return { ok: true };
}

export async function submitSignedTimesheet({ token, pdfBase64, signedName }) {
  const { verifyTimesheetToken } = await import("@/lib/timesheet-token");
  const id = verifyTimesheetToken(token);
  if (!id) return { ok: false, error: "auth" };

  const ts = await prisma.timesheet.findUnique({
    where: { id },
    // `user` and `sourceName` are here for the name on the signature, which was
    // never being stored - see the fallback below. Left out they arrive
    // undefined and the column keeps taking null, which is exactly the failure
    // this is fixing.
    //
    // The rest is for the signed copy going back out: the address the sheet
    // was sent to, the batch's period and rehearsal flags, and the answer
    // rows the QuickSolve changes list derives from.
    select: {
      id: true, batchId: true, signedAt: true, disputedAt: true, heldAt: true, sourceName: true,
      intendedEmail: true,
      user: { select: { name: true, preferredFirstName: true, preferredLastName: true, email: true } },
      batch: { select: { periodFrom: true, periodTo: true, testOnly: true, testEmail: true } },
      corrections: {
        where: { status: { not: "open" } },
        // `question` is the frozen card, which employeeResolution reads for
        // the two-lunches wording - left out it arrives undefined and the
        // sentence quietly loses its shape. `timeOff` is the day-program
        // answer's entries, same trap: left out, the emails lose those lines.
        select: { kind: true, date: true, status: true, choice: true, statedBreaks: true, question: true, timeOff: true },
      },
    },
  });
  if (!ts) return { ok: false, error: "auth" };
  if (ts.signedAt) return { ok: false, error: "already" };
  // you shouldn't attest to a document you've told us is wrong. the page hides
  // the signer while a report is open; this is the server-side half of that.
  if (ts.disputedAt) return { ok: false, error: "disputed" };
  // the office hold - same shape: the page states it and drops the signer,
  // and this is the rule behind the suggestion. See holdTimesheetSigning.
  if (ts.heldAt) return { ok: false, error: "held" };
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
      // WHO SIGNED, WHICH WAS NEVER BEING RECORDED.
      //
      // `signedName` had been null on every signature ever taken. The signer
      // passes `payload.employeeName` through from `FormFiller`, and FormFiller
      // only sets that field in PUBLIC mode - the share-link flow where a
      // stranger types their name because nothing else knows it. A timesheet is
      // a token flow with a known person, so it is never public mode, so the
      // field never arrived and the column took null 100% of the time. Found
      // 2026-08-17 on the first signature this system has ever taken.
      //
      // WHAT IT NOW HOLDS, AND THE WORDING MATTERS. Nothing in this flow asks
      // anybody to TYPE a name - they draw a signature, and that image is in
      // the stored PDF. So this is not "what they typed": it is the person the
      // token was issued to, resolved at the moment of signing. Their preferred
      // name if the account carries one, then the account name, then the
      // spelling QSP printed. A typed value still wins if one is ever
      // collected, so adding that field later needs no change here.
      signedName:
        (signedName || "").toString().slice(0, 120)
        || (ts.user ? preferredName(ts.user) : null)
        || ts.sourceName
        || null,
      signedIp: ip,
    },
  });

  revalidatePath(`/portal/admin/timesheets/${ts.batchId}`);
  // A SIGNATURE IS THE ONE EVENT THE REVIEWER SCREENS CARE MOST ABOUT AND THE
  // ONLY ONE THAT WAS NOT ANNOUNCED.
  //
  // Every other action that moves a figure bumps this - answering, resetting,
  // classifying, flagging, undoing a day, fourteen call sites - and signing did
  // not. `BatchPresence` polls the version and only re-renders when it MOVES,
  // so a reviewer watching the batch saw the signed count sit still while
  // people signed, and would have had to reload to find out. Which is the
  // opposite of what the live badge above it promises.
  //
  // Found 2026-08-17 while wiring that badge: it would have blinked over a
  // frozen number.
  await bumpBatchVersion(ts.batchId);
  await bumpSheetVersion(ts.id);

  // THE SIGNED COPY GOES STRAIGHT BACK TO THEM, with whatever their answers
  // mean for the QuickSolve record. The attachment is the very bytes this
  // action just stored, so inbox and portal can never hold two documents.
  //
  // AFTER THE SIGNATURE IS SAFE, AND NEVER FATAL. The signature is recorded
  // above whatever happens here - a mail outage must not read as "signing is
  // broken" to the person holding the pen. Failure is logged and the action
  // still succeeds; their copy stays one click away on the page.
  let emailed = false;
  // the time-off days join the review record: the employee's copy states each
  // as a fact, the office copy carries the add-to-schedule action. Sorted back
  // together so the office reads one list in day order.
  const reviewItems = [...reviewChoices(ts.corrections), ...timeOffReviewItems(ts.corrections)]
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const employeeName = (ts.user ? preferredName(ts.user) : null) || ts.sourceName;
  const periodLabel = `${ts.batch.periodFrom} to ${ts.batch.periodTo}`;
  // one reading of the rehearsal flag drives both sends, so they can never
  // disagree about where a test batch's mail may go
  const forceTo = batchForceTo(ts.batch);
  try {
    const r = await sendSignedTimesheetCopy({
      intendedEmail: ts.intendedEmail || ts.user?.email || null,
      employeeName,
      periodLabel,
      // the choices they made on their review, each with the record facts it
      // produced - so every statement carries the answer behind it
      items: reviewItems,
      pdfBytes: Buffer.from(pdfBase64, "base64"),
      forceTo,
    });
    emailed = !!r?.ok;
    if (!r?.ok && r?.error !== "norecipient") {
      console.error(`signed copy email failed for ${ts.sourceName}:`, r?.error);
    }
  } catch (e) {
    console.error(`signed copy email threw for ${ts.sourceName}:`, e);
  }

  // THE SAME REVIEW RECORD GOES TO THE OFFICE, WITH THE EDITS TO MAKE. The
  // office corrects QuickSolve now, not the employee - see
  // timesheet-review-email.js for who receives it and why nothing on the
  // employee's surfaces mentions it. Only when the review actually said
  // something: a clean signature has no corrections and raises no mail.
  //
  // Best-effort like the copy above, and after it on purpose: their receipt
  // must not hinge on our internal routing working.
  if (reviewItems.length) {
    try {
      const base = process.env.AUTH_URL || "https://www.mylifeservicesinc.com";
      const r = await sendReviewCorrections({
        employeeName,
        periodLabel,
        items: reviewItems,
        batchUrl: `${base}/portal/admin/timesheets/${ts.batchId}`,
        // the same bytes their own copy carries, so the office is looking at
        // the document they signed rather than a re-render of it
        pdfBytes: Buffer.from(pdfBase64, "base64"),
        forceTo,
      });
      if (!r?.ok) {
        console.error(`review corrections email failed for ${ts.sourceName}:`, r?.error);
      }
    } catch (e) {
      console.error(`review corrections email threw for ${ts.sourceName}:`, e);
    }
  }
  return { ok: true, emailed };
}

// SOMEBODY SAYS THE SCHEDULE IS LOCKED AND THIS UPLOAD IS FINAL.
//
// The portal works out the precondition on its own - the export reaching the
// last day of the period - and stops there, because the schedule locks around
// 8pm on the final day and NOT ONE of the four exports records that it
// happened. An upload at 7:45pm and one at 8:15pm are identical from here.
//
// This is the gate on Send all. Until it is set, a period cannot be emailed.
export async function setBatchLocked(batchId, locked) {
  const user = await requireTimesheetAccess();
  // A REPLACED UPLOAD IS READ ONLY - see superseded.js. Refused on the SERVER,
  // because hiding a control is a suggestion and this has to be a rule.
  {
    const newer = await supersededBy(batchId);
    if (newer) return refusal(newer);
  }

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id: batchId },
    select: { id: true, periodFrom: true, periodTo: true, lockedAt: true },
  });
  if (!batch) return { ok: false, error: "gone" };

  await prisma.timesheetBatch.update({
    where: { id: batchId },
    data: locked
      ? {
        lockedAt: new Date(),
        lockedById: user.id,
        // copied rather than joined, like the check flags: this records who
        // said it AT THE TIME and should not follow a later rename
        lockedByName: preferredName(user) || user.name || user.email || null,
      }
      : { lockedAt: null, lockedById: null, lockedByName: null },
  });

  console.log(
    `timesheet batch ${locked ? "marked final" : "reopened"} by ${user.id}: ` +
    `${batch.periodFrom}-${batch.periodTo}`,
  );

  revalidatePath("/portal/admin/timesheets");
  revalidatePath(`/portal/admin/timesheets/${batchId}`);
  return { ok: true, locked: !!locked };
}

// THE EMPLOYEE'S HALF OF A MISSED-BREAK REASON.
//
// Two shapes, and which one they get depends on whether anybody gathered a
// reason on the phone:
//
//   confirm   we wrote one down, so it is quoted back and they say whether we
//             wrote it right. We took it off a call - it is somebody's memory
//             of what was said, and it is about to be printed on their sheet.
//   write     nobody gathered one, so they write it themselves.
//
// SAYING NO DOES NOT OVERWRITE OURS. Both go on the bottom of the timesheet,
// ours first and theirs after it as a correction. Deleting ours would hide that
// the record moved, and the whole reason for asking is that our version might
// be wrong.
//
// A correction also raises a notice, because it means a reason we wrote down
// was not what they said - which is worth knowing about the call, not just
// about the row.
export async function answerBreakReason({ token, findingKey, agree, text }) {
  const { verifyTimesheetToken } = await import("@/lib/timesheet-token");
  const tsId = verifyTimesheetToken(token);
  if (!tsId) return { ok: false, error: "auth" };
  if (!findingKey) return { ok: false, error: "missing" };

  const ts = await prisma.timesheet.findUnique({
    where: { id: tsId },
    select: {
      id: true, userId: true, sourceName: true, signedAt: true,
      batch: { select: { id: true, periodFrom: true, periodTo: true, program: true } },
    },
  });
  if (!ts) return { ok: false, error: "notfound" };
  // a sheet with no account behind it has no person key, so there is nothing to
  // hang the answer off - and nobody could have been asked in the first place
  if (!ts.userId) return { ok: false, error: "unmatched" };
  // NOT AFTER THEY HAVE SIGNED. The signed copy quotes the comments block, so a
  // reason arriving afterwards would put a sentence on a document somebody has
  // already attested to.
  if (ts.signedAt) return { ok: false, error: "signed" };

  const row = await prisma.timesheetBreakAnswer.findUnique({
    where: {
      program_periodFrom_periodTo_personKey_findingKey: {
        program: ts.batch.program || "MLS",
        periodFrom: ts.batch.periodFrom,
        periodTo: ts.batch.periodTo,
        personKey: ts.userId,
        findingKey,
      },
    },
  });
  // they can only answer something they were actually asked - see the note on
  // `answerTimesheetQuestion` about a client answering a question nobody put
  if (!row || row.answer !== "not-taken") return { ok: false, error: "notasked" };

  const said = String(text ?? "").trim().slice(0, 1000) || null;

  // NOTHING WE WROTE: they are supplying the only reason there is, so it goes in
  // as theirs and is confirmed by definition.
  if (!row.reason) {
    if (!said) return { ok: false, error: "empty" };
    await prisma.timesheetBreakAnswer.update({
      where: { id: row.id },
      data: { reason: said, confirmedAt: new Date(), confirmedText: said, via: null },
    });
  } else if (agree) {
    // our wording, agreed. `confirmedText` records WHAT they agreed to, so a
    // later edit to `reason` can tell that the tick is stale.
    await prisma.timesheetBreakAnswer.update({
      where: { id: row.id },
      data: { confirmedAt: new Date(), confirmedText: row.reason },
    });
  } else {
    if (!said) return { ok: false, error: "empty" };
    // OURS STAYS. Theirs is added beside it and both print.
    await prisma.timesheetBreakAnswer.update({
      where: { id: row.id },
      data: { confirmedAt: new Date(), confirmedText: said },
    });
    // and it raises a notice, because a corrected reason means somebody
    // mis-heard something on a phone call
    await prisma.timesheetContactLog.create({
      data: {
        batchId: ts.batch.id,
        rowKey: `person-${ts.id}`,
        program: ts.batch.program || "MLS",
        periodFrom: ts.batch.periodFrom,
        periodTo: ts.batch.periodTo,
        personKey: ts.userId,
        findingKey,
        status: "reason-corrected",
        byId: ts.userId,
        byName: ts.sourceName,
      },
    });
  }

  revalidatePath(`/portal/admin/timesheets/${ts.batch.id}/people`);
  revalidatePath(`/portal/admin/timesheets/${ts.batch.id}/checks`);
  // the same gap, and worse here: this action is CALLED FROM the employee page,
  // so writing a reason revalidated two admin screens and not the one the person
  // was looking at while they typed it.
  revalidatePath(`/t/${signTimesheetToken(ts.id)}`);
  await bumpSheetVersion(ts.id);
  // AND THE REVIEWER SCREENS, so a day view shows what is still outstanding
  // without anybody reloading it - see the note on `bumpBatchVersion`.
  await bumpBatchVersion(ts.batchId);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/person/${ts.id}`);
  return { ok: true };
}

// ---------------------------------------------------------------- offline sign-off

// A SIGNATURE THAT ARRIVED OUTSIDE THE PORTAL.
//
// People sign the PDF and email it back. Until now there was nowhere to put
// that fact, and it is not cosmetic: `premiumStanding` holds an employee's
// waived hours in `pendingSignoff` until a signature covers them, so a sheet
// signed on paper reads on the payroll report as if they had never answered.
// One person's returned PDF was worth four premium hours.
//
// IT DOES NOT INVENT A SIGNATURE. `signedName` is theirs because they signed;
// what this records alongside it is that a reviewer entered it, when, and how
// it arrived, in `data.signedOffline`. Anybody reading the row later can tell
// the difference between this and somebody signing on their own link, which a
// bare `signedAt` could not.
//
// AND IT REFUSES A SHEET THAT DOES NOT GENERATE. The portal will not let an
// employee sign until every question is answered; accepting a returned PDF for
// a sheet with open questions would walk straight around that rule. The one
// exception is deliberate: a sheet whose answers were RESET after it was signed
// is exactly the case this has to handle, and the caller says so explicitly.
export async function recordOfflineSignature(timesheetId, formData) {
  const user = await requireTimesheetAccess();
  if (!isSuper(user?.role)) return { ok: false, error: "auth" };
  {
    const newer = await supersededByForTimesheet(timesheetId);
    if (newer) return refusal(newer);
  }

  const ts = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    select: {
      id: true, batchId: true, sourceName: true, userId: true, data: true,
      signedAt: true, disputedAt: true, renderOk: true,
    },
  });
  if (!ts) return { ok: false, error: "gone" };
  if (ts.signedAt) return { ok: false, error: "already" };
  if (ts.disputedAt) return { ok: false, error: "disputed" };
  if (!ts.renderOk) return { ok: false, error: "norender" };

  const name = (formData.get("signedName") || "").toString().trim().slice(0, 120);
  if (!name) return { ok: false, error: "noname" };
  const how = (formData.get("how") || "").toString().trim().slice(0, 200) || "returned by email";
  const whenRaw = (formData.get("signedOn") || "").toString().trim();
  // THE DATE THEY SIGNED, NOT THE DATE IT WAS TYPED IN. A sheet signed on the
  // 18th and entered on the 19th is a document dated the 18th, and the pay
  // period it falls in can depend on which.
  const when = whenRaw ? new Date(whenRaw) : new Date();
  if (Number.isNaN(when.getTime())) return { ok: false, error: "baddate" };

  // the returned file, when there is one. Optional, because a signature can
  // arrive as a photo in a text message - but a record with nothing behind it
  // is worth less, and the UI says so.
  let signedPdfUrl = null;
  const file = formData.get("file");
  if (file && typeof file === "object" && "size" in file && file.size > 0) {
    if (file.size > 8_000_000) return { ok: false, error: "toobig" };
    if (!hasBlobStorage()) return { ok: false, error: "noblob" };
    try {
      const key = `timesheets/signed/${randomBytes(12).toString("hex")}.pdf`;
      const blob = await putBlob(key, Buffer.from(await file.arrayBuffer()), {
        access: "public",
        contentType: file.type || "application/pdf",
      });
      signedPdfUrl = blob.url;
    } catch (e) {
      console.error("offline signature upload failed:", e);
      return { ok: false, error: "store" };
    }
  }

  await prisma.timesheet.update({
    where: { id: ts.id },
    data: {
      signedAt: when,
      signedName: name,
      signedPdfUrl,
      // NOT an ip. Nothing about this came from a browser of theirs, and
      // putting the reviewer's address in a field that means "where they signed
      // from" would be a small lie in a record built to be checkable.
      signedIp: null,
      data: {
        ...(ts.data || {}),
        signedOffline: {
          how,
          recordedById: user.id,
          recordedByName: preferredName(user) || user.email || user.id,
          recordedAt: new Date().toISOString(),
          hasFile: !!signedPdfUrl,
        },
      },
    },
  });

  console.log(
    `offline signature recorded by ${user.id} for ${ts.sourceName}: `
    + `signed ${when.toISOString().slice(0, 10)}, ${how}, file=${!!signedPdfUrl}`,
  );
  await bumpSheetVersion(ts.id);
  await bumpBatchVersion(ts.batchId);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}`);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/person/${ts.id}`);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/signed`);
  return { ok: true, signedAt: when.toISOString(), file: !!signedPdfUrl };
}

// ---------------------------------------------------------------- QSP desk

// the entries one signed review owes QuickSolve, derived the same way both
// review emails derive theirs - one derivation, three surfaces
function qspItemsOf(corrections) {
  return [...reviewChoices(corrections), ...timeOffReviewItems(corrections)];
}

// MARK ONE QUICKSOLVE ENTRY AS ADDED, or take the mark back off. The fact
// sentence is the entry's identity - it is what the desk shows and what the
// office email printed - and it has to be one this row actually derives, so a
// browser cannot mark an entry nobody owes.
export async function markQspEntry({ correctionId, fact, done }) {
  const user = await requireTimesheetAccess();

  const c = await prisma.timesheetCorrection.findUnique({
    where: { id: String(correctionId || "") },
    include: {
      timesheet: { select: { id: true, batchId: true, signedAt: true } },
    },
  });
  if (!c || !c.timesheet.signedAt) return { ok: false, error: "notsigned" };

  const wanted = String(fact || "");
  const owed = qspItemsOf([c]).flatMap((it) => it.changes.map((ch) => ch.fact));
  if (!owed.includes(wanted)) return { ok: false, error: "unknown" };

  if (done === false) {
    await prisma.qspEntryMark.deleteMany({ where: { correctionId: c.id, fact: wanted } });
  } else {
    await prisma.qspEntryMark.upsert({
      where: { correctionId_fact: { correctionId: c.id, fact: wanted } },
      update: { byId: user.id, byName: preferredName(user) },
      create: { correctionId: c.id, fact: wanted, byId: user.id, byName: preferredName(user) },
    });
  }

  revalidatePath(`/portal/admin/timesheets/${c.timesheet.batchId}/qsp`);
  await bumpBatchVersion(c.timesheet.batchId);
  return { ok: true };
}

