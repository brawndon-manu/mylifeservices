"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { hasBlobStorage, putBlob } from "@/lib/blob";
import { progressKey, setProgress } from "@/lib/timesheet-progress";
import { pushRecent } from "@/lib/timesheet-stages";
import { unstorableRows } from "@/lib/timesheet/storable";
import { analyzeDayProgram } from "@/lib/day-program/analyze";
import { buildDayProgramSheetRows } from "@/lib/day-program/upload-rows";
import { liveSendConfigured } from "@/lib/timesheet-send";
import { isoDate } from "@/lib/timesheet/partial";
// the partial re-upload's own pieces, the same three the MLS twin leans on
import { supersededBy } from "@/lib/timesheet/superseded";
import { restKey } from "@/lib/timesheet/rests";
import { bumpSheetVersion, bumpBatchVersion } from "@/lib/timesheet-presence";

// same tier as the timesheets card. this whole area is that feature's sibling,
// so it answers to the same gate.
async function requireAccess() {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");
  return user;
}

const r2 = (n) => Math.round((n || 0) * 100) / 100;

const present = (f) => f && typeof f === "object" && "size" in f && f.size > 0;

// upload the day program's period INTO THE REAL TIMESHEET TABLES.
//
// One for one, Mánu 2026-08-17: "why cant it be one for one?" After the
// QSP-first pivot the analysis produces exactly the day shape uploadBatch
// stores, so the day program IS a TimesheetBatch now - program "DP" - and
// every screen, send, signature and approval is the same code the MLS
// timesheets run. The group key and supersededBy both include `program`, so a
// DP batch can never fold under or supersede the live MLS card of the same
// fortnight.
//
// What stays different is what the day program's documents genuinely lack: no
// schedule PDF, no payroll report, no clock export - all stored as their
// honest absences - and every day carries `onDutyMeal`, which is the one rule
// change (see parse.js).
//
// THE REST BREAK AUDIT IS GONE, Mánu 2026-08-22: "we will never be using it."
// David built that spreadsheet once, in August, to carry the 2nd breaks that
// only existed inside DSN summaries. `noteBreak` in analyze.js now reads those
// same breaks off the schedule notes the staff already type - 70 of them across
// 08/01-08/15, with no row it should have caught left behind - so the sheet it
// existed to supply is supplied by the export itself. Nothing writes `dpAudit`
// any more. The two screens that DISPLAY it still do, because the August batch
// holds real audit data and its premiums were settled against it.
export async function uploadDayProgramBatch(formData) {
  const user = await requireAccess();

  // a correction INTO the batch already out, not a new upload - the MLS
  // partial's twin. Read first so every refusal below can send the person
  // back to the correcting form rather than dropping them on a fresh upload
  // page one wrong click from replacing the whole period.
  const intoBatchId = (formData.get("into") || "").toString() || null;
  const fail = (code, why) =>
    redirect(
      `/portal/admin/day-program/new?${intoBatchId ? `into=${intoBatchId}&` : ""}error=${code}${
        why ? `&why=${encodeURIComponent(String(why).slice(0, 160))}` : ""
      }`,
    );

  // the same live panel the MLS upload has. The id was minted in the browser
  // and is only ever a lookup suffix - progressKey namespaces it under the
  // uploader, and a null key makes every write a no-op.
  const prog = progressKey(user.id, formData.get("uploadId"));
  const P = { stage: "reading", done: 0, total: null, recent: [] };
  await setProgress(prog, P);

  const pdfFile = formData.get("timesheet");
  if (!present(pdfFile)) fail("notimesheet");
  if (pdfFile.type && pdfFile.type !== "application/pdf") fail("notpdf");

  const restsFile = formData.get("rests");
  if (!present(restsFile)) fail("norests");

  // the Employee Schedules PDF, optional: the second opinion on shift shape,
  // same cross-check the MLS upload runs.
  const schedFile = formData.get("schedule");
  const hasSched = present(schedFile);

  // the Employee Mileage Tracking Report, optional: the day program's only
  // source of miles, because it has no payroll report to carry the column.
  const mileageFile = formData.get("mileage");
  const hasMileage = present(mileageFile);

  // MID-PERIOD UPLOADS, same option the MLS upload has. The day program runs
  // these several times a day right through the period, so the refusal of
  // future days needs the same way past it: keep the window, drop the rest.
  // THE RANGE IS TYPED BECAUSE THE EXPORT DOES NOT CARRY IT - QSP returns the
  // whole pay period whatever range it was asked for.
  const wantPartial = formData.get("partial") === "on";
  const partialFromInput = isoDate((formData.get("partialFrom") || "").toString());
  const partialToInput = isoDate((formData.get("partialTo") || "").toString());
  if (wantPartial && partialFromInput && partialToInput && partialFromInput > partialToInput) {
    fail("range", "the start of the range is after its end");
  }

  const timesheetBytes = new Uint8Array(await pdfFile.arrayBuffer());
  const restsBytes = Buffer.from(await restsFile.arrayBuffer());
  const scheduleBytes = hasSched ? new Uint8Array(await schedFile.arrayBuffer()) : null;
  const mileageBytes = hasMileage ? Buffer.from(await mileageFile.arrayBuffer()) : null;

  let result;
  try {
    result = await analyzeDayProgram({
      timesheetBytes,
      restsBytes,
      scheduleBytes,
      mileageBytes,
      partial: wantPartial ? { from: partialFromInput, to: partialToInput } : null,
    });
  } catch (e) {
    // a mid-period export refused whole is its own message, not a parse failure
    if (e?.code === "future") fail("future", e.message);
    console.error("day program analyze failed:", e);
    fail("parse", e?.message || e);
  }
  if (result.partial) {
    console.log(
      `day program partial period: kept ${result.partial.from} to ${result.partial.through}, ` +
        `dropped ${result.partial.dropped.length}${result.partial.clamped ? " (end clamped to today)" : ""}`,
    );
  }
  if (!result.people.length) fail("empty", "the timesheet read fine but held no employee hours");

  // A MILEAGE FILE THAT MATCHES NOBODY, OR SAYS NOBODY DROVE.
  //
  // Refused rather than warned, on the same principle as the schedule coverage
  // check on the MLS side: these miles print under the totals of a document
  // somebody signs and attests to, so a wrong export must not become thirty
  // sheets quietly swearing to 0.00. Both readings are far likelier to be the
  // wrong file than the truth.
  if (hasMileage) {
    if (!result.mileage?.anyMiles) {
      fail("mileage", "every row of that mileage report reads 0.00 miles - is it the right period?");
    }
    const unmatched = result.mileage.unmatched || [];
    if (unmatched.length >= result.mileage.people) {
      fail(
        "mileage",
        `none of the ${result.mileage.people} people in that mileage report match anyone on the timesheet`,
      );
    }
    if (unmatched.length) {
      console.warn(`day program mileage: ${unmatched.length} unmatched - ${unmatched.join(", ")}`);
    }
  }

  // suggest a portal account per person, same matcher and same bar as the
  // timesheets: only a unique full-coverage match auto-assigns.
  const users = await prisma.user.findMany({
    where: { deactivatedAt: null },
    select: { id: true, name: true, preferredFirstName: true, preferredLastName: true },
  });

  // frozen at upload, same as uploadBatch - rendering on demand with today's
  // date would put a different "generated on" on the same sheet every open.
  const generatedOn = new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });

  P.stage = "generating";
  P.total = result.people.length;
  await setProgress(prog, P);
  const sheetRows = await buildDayProgramSheetRows(result, users, generatedOn, async (row) => {
    P.done += 1;
    P.recent = pushRecent(P.recent, {
      name: row.name,
      hours: r2(row.hours),
      premium: r2(row.premium),
      failed: row.failed,
    });
    // throttled: the screen polls once a second, so writing faster than that
    // buys nothing and costs a round-trip inside the slow loop
    await setProgress(prog, P, { minGapMs: 300 });
  });

  const refused = unstorableRows(sheetRows.map((s) => ({ sourceName: s.sourceName, data: s.data })));
  if (refused.length) fail("save", `${refused[0].name}'s rows contain ${refused[0].what}`);

  // ---- A RE-UPLOAD OF SOME PEOPLE, INTO THE DAY PROGRAM BATCH ALREADY OUT --
  //
  // The MLS partial's twin - see uploadBatch, whose rules this holds exactly:
  // the files decide who, the same fortnight or nothing, strangers refused,
  // replaced people updated IN PLACE so the link already in their inbox keeps
  // working, their answers and signature cleared because their figures are
  // changing, and everyone else untouched. Built for one person's QSP fix
  // landing after the batch went out (Bustamante's 08/28 entered post-upload,
  // Matias's 08/25 semicolon day) without costing the re-signs the rest of
  // the batch has already given back.
  //
  // No blobs are stored on this path: the batch's file pointers are the
  // provenance of the upload the other people came from and stay pointing at
  // it, the same rule the MLS twin holds. Everything a sheet renders from
  // rides in its own data.
  if (intoBatchId) {
    const target = await prisma.timesheetBatch.findUnique({
      where: { id: intoBatchId },
      select: { id: true, program: true, periodFrom: true, periodTo: true, restsByDate: true },
    });
    const back = (why) => redirect(
      `/portal/admin/day-program/new?into=${intoBatchId}&error=partial&why=${encodeURIComponent(why)}`,
    );
    if (!target) back("that batch is gone");
    // this form corrects day program uploads only. The agency form holds the
    // same guard the other way round, because both batches can share a
    // fortnight AND a name - Colon, Lori is on both live batches today, and a
    // period-matched write at the wrong program would replace her sheet.
    if (target.program !== "DP") back("that batch is not a day program upload");
    const from = result.payPeriod?.from || "";
    const to = result.payPeriod?.to || "";
    if (target.periodFrom !== from || target.periodTo !== to) {
      back(`this export is ${from} to ${to}, that batch is ${target.periodFrom} to ${target.periodTo}`);
    }
    // A REPLACED UPLOAD IS READ ONLY, the same rule every other write holds.
    const newer = await supersededBy(intoBatchId);
    if (newer) back("that upload has been replaced - re-upload into the current one");

    const existing = await prisma.timesheet.findMany({
      where: { batchId: intoBatchId },
      select: { id: true, sourceName: true },
    });
    const byName = new Map(existing.map((r) => [restKey(r.sourceName || ""), r]));
    // ONLY PEOPLE ALREADY ON IT. Someone in the file who is not on the batch
    // is an ADDITION, not a correction - refused by name, never appended.
    const strangers = sheetRows
      .filter((r) => !byName.has(restKey(r.sourceName || "")))
      .map((r) => r.sourceName);
    if (strangers.length) back(`not on that batch: ${strangers.join(", ")}`);

    // THE REST ROWS MERGE BY NAME, THEY DO NOT REPLACE - restsByDate is one
    // array for the whole batch, and writing this upload's rows over it would
    // change what every untouched person rebuilds from.
    const incoming = result.restRows || [];
    const covered = new Set(incoming.map((r) => restKey(r?.name || "")));
    const mergedRests = [
      ...(target.restsByDate || []).filter((r) => !covered.has(restKey(r?.name || ""))),
      ...incoming,
    ];

    const ids = sheetRows.map((r) => byName.get(restKey(r.sourceName || "")).id);
    P.stage = "saving";
    await setProgress(prog, P);
    try {
      await prisma.$transaction(async (tx) => {
        await tx.timesheetBatch.update({
          where: { id: intoBatchId },
          data: { restsByDate: mergedRests.length ? mergedRests : null },
        });
        // their answers go with their figures - an answer explains a finding
        // on the document that raised it, and that document is being replaced.
        // Break reasons and PtoEntry rows are keyed on the period, not the
        // sheet, so those carry across untouched.
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
            // UPDATED IN PLACE, NEVER REPLACED - keeping the row keeps the
            // signing link in their inbox working.
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
      console.error("day program partial re-upload failed:", e);
      back((e?.message || String(e)).slice(0, 200));
    }
    for (const id of ids) await bumpSheetVersion(id);
    await bumpBatchVersion(intoBatchId);
    P.stage = "done";
    await setProgress(prog, P);
    revalidatePath(`/portal/admin/timesheets/${intoBatchId}`);
    revalidatePath("/portal/admin/timesheets");
    console.log(
      `day program partial re-upload by ${user.id} into ${intoBatchId}: `
      + sheetRows.map((r) => r.sourceName).join(", "),
    );
    redirect(`/portal/admin/timesheets/${intoBatchId}?replaced=${ids.length}`);
  }

  if (!hasBlobStorage()) fail("noblob");
  P.stage = "storing";
  await setProgress(prog, P);
  const store = async (key, body, contentType) => {
    const blob = await putBlob(key, body, { access: "public", contentType });
    return blob.url;
  };
  let sourceUrl, restsUrl, scheduleUrl = null, mileageUrl = null;
  try {
    const tag = () => randomBytes(10).toString("hex");
    sourceUrl = await store(`timesheets/source/${tag()}.pdf`, Buffer.from(timesheetBytes), "application/pdf");
    restsUrl = await store(`timesheets/rests/${tag()}.xls`, restsBytes, "application/vnd.ms-excel");
    if (scheduleBytes) {
      scheduleUrl = await store(`timesheets/schedule/${tag()}.pdf`, Buffer.from(scheduleBytes), "application/pdf");
    }
    if (mileageBytes) {
      mileageUrl = await store(
        `day-program/mileage/${tag()}.xls`,
        mileageBytes,
        "application/vnd.ms-excel",
      );
    }
  } catch (e) {
    console.error("day program source upload failed:", e);
    fail("blob");
  }

  P.stage = "saving";
  await setProgress(prog, P);
  let batch;
  try {
    batch = await prisma.$transaction(async (tx) => {
      const b = await tx.timesheetBatch.create({
        data: {
          program: "DP",
          periodFrom: result.payPeriod?.from || "",
          periodTo: result.payPeriod?.to || "",
          sourceUrl,
          sourceName: String(pdfFile.name || "timesheet.pdf"),
          restsUrl,
          restsName: String(restsFile.name || "rest-periods.xls"),
          scheduleUrl,
          scheduleName: hasSched ? String(schedFile.name || "schedule.pdf") : null,
          dpMileageUrl: mileageUrl,
          dpMileageName: hasMileage ? String(mileageFile.name || "mileage.xls") : null,
          restsByDate: result.restRows,
          // a partial record says so on the batch, exactly as the MLS side
          // does - nothing else afterwards would say the last workweek is cut
          partialPeriod: !!result.partial && result.partial.dropped.length > 0,
          partialFrom: result.partial?.from || null,
          partialThrough: result.partial?.through || null,
          // dpAudit is deliberately not written. See the note on this function:
          // the audit sheet is retired, and a null here is the honest record
          // that no such document backed this batch.
          testMode: !liveSendConfigured(),
          uploadedById: user.id,
        },
      });
      await tx.timesheet.createMany({
        data: sheetRows.map((row) => ({ ...row, batchId: b.id })),
      });
      return b;
    }, { timeout: 120_000, maxWait: 20_000 });
  } catch (e) {
    console.error("day program batch write failed:", e);
    fail("save", e?.message || e);
  }

  P.stage = "done";
  await setProgress(prog, P);
  revalidatePath("/portal/admin/timesheets");
  revalidatePath("/portal/admin/day-program");
  redirect(`/portal/admin/timesheets/${batch.id}`);
}

// ---------------------------------------------------------------- PTO

// PAID TIME OFF, RECORDED AGAINST THE PERSON AND THE PERIOD, not the upload.
//
// The day program has no Misc classification to park a non-working day under,
// so time off had nowhere to live and simply read as a gap in the schedule.
// These rows fill that gap explicitly.
//
// KEYED (program, period, person, date) like the break answers, so a re-upload
// does not wipe them. That is the whole point: PTO is agreed before any export
// is pulled, and re-entering nine people's time off after every upload is how
// it gets lost.
//
// HOURS RECORDED HERE ARE NOT WORKED HOURS. Nothing in this file adds them to a
// paid total or an overtime test - a PTO day is not a shift, owes no rest
// break, and must never push somebody over forty on time they did not work.
export async function setPto(formData) {
  const user = await requireAccess();

  const program = (formData.get("program") || "DP").toString();
  const periodFrom = (formData.get("periodFrom") || "").toString();
  const periodTo = (formData.get("periodTo") || "").toString();
  const personKey = (formData.get("personKey") || "").toString();
  const date = (formData.get("date") || "").toString();
  // which of the two a day was. Anything but "sick" is PTO, which also keeps
  // every existing caller - none of them send the field - meaning what it did.
  const kind = (formData.get("kind") || "").toString() === "sick" ? "sick" : "pto";
  const raw = (formData.get("hours") || "").toString().trim();
  const note = (formData.get("note") || "").toString().trim().slice(0, 200) || null;
  const back = (formData.get("back") || "").toString();

  if (!periodFrom || !periodTo || !personKey || !date) return;

  const hours = Number(raw);
  // ZERO REMOVES IT. A cleared box is how somebody takes a day back off the
  // record, and storing a 0-hour PTO day would print as time off that is not.
  if (!raw || !Number.isFinite(hours) || hours <= 0) {
    await prisma.ptoEntry.deleteMany({
      where: { program, periodFrom, periodTo, personKey, date },
    });
  } else {
    // a day cannot hold more hours than it has, and a typo of 80 for 8 would
    // otherwise print on a payroll document
    const capped = Math.min(Math.round(hours * 100) / 100, 24);
    await prisma.ptoEntry.upsert({
      where: {
        program_periodFrom_periodTo_personKey_date: { program, periodFrom, periodTo, personKey, date },
      },
      update: { hours: capped, kind, note, byId: user.id, byName: preferredNameOf(user) },
      create: {
        program, periodFrom, periodTo, personKey, date,
        hours: capped, kind, note, byId: user.id, byName: preferredNameOf(user),
      },
    });
  }

  if (back) revalidatePath(back);
  return { ok: true };
}

// the reviewer's own name, stored flat beside the row - see the note on the
// model about why this is not a relation
function preferredNameOf(u) {
  const first = u?.preferredFirstName || (u?.name || "").split(" ")[0] || "";
  const last = u?.preferredLastName || (u?.name || "").split(" ").slice(1).join(" ") || "";
  return `${first} ${last}`.trim() || u?.email || null;
}
