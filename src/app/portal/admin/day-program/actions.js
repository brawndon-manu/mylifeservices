"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { hasBlobStorage, putBlob } from "@/lib/blob";
import { unstorableRows } from "@/lib/timesheet/storable";
import { analyzeDayProgram } from "@/lib/day-program/analyze";
import { buildDayProgramSheetRows } from "@/lib/day-program/upload-rows";
import { liveSendConfigured } from "@/lib/timesheet-send";

// same tier as the timesheets card. this whole area is that feature's sibling,
// so it answers to the same gate.
async function requireAccess() {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");
  return user;
}

const r2 = (n) => Math.round((n || 0) * 100) / 100;

const err = (code, why) =>
  redirect(
    `/portal/admin/day-program/new?error=${code}${why ? `&why=${encodeURIComponent(String(why).slice(0, 160))}` : ""}`,
  );

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
// change (see parse.js). David's audit spreadsheet lands in `dpAudit` on the
// batch: its confirmed 2nd breaks are already folded into the days as rest
// evidence, and everything its reader flagged is kept for a person to read.
export async function uploadDayProgramBatch(formData) {
  const user = await requireAccess();

  const pdfFile = formData.get("timesheet");
  if (!present(pdfFile)) err("notimesheet");
  if (pdfFile.type && pdfFile.type !== "application/pdf") err("notpdf");

  const restsFile = formData.get("rests");
  if (!present(restsFile)) err("norests");

  // David's sheet is OPTIONAL on purpose: the 2nd-break confirmations make
  // the numbers better, but a period can run without one and every
  // unconfirmed break simply stays what the rest report says it is.
  const auditFile = formData.get("audit");
  const hasAudit = present(auditFile);
  if (hasAudit && !/\.xlsx$/i.test(String(auditFile.name || ""))) err("notxlsx");

  // the Employee Schedules PDF, optional: the second opinion on shift shape,
  // same cross-check the MLS upload runs.
  const schedFile = formData.get("schedule");
  const hasSched = present(schedFile);

  const timesheetBytes = new Uint8Array(await pdfFile.arrayBuffer());
  const restsBytes = Buffer.from(await restsFile.arrayBuffer());
  const auditBytes = hasAudit ? Buffer.from(await auditFile.arrayBuffer()) : null;
  const scheduleBytes = hasSched ? new Uint8Array(await schedFile.arrayBuffer()) : null;

  let result;
  try {
    result = await analyzeDayProgram({ timesheetBytes, restsBytes, auditBytes, scheduleBytes });
  } catch (e) {
    console.error("day program analyze failed:", e);
    err("parse", e?.message || e);
  }
  if (!result.people.length) err("empty", "the timesheet read fine but held no employee hours");

  // suggest a portal account per person, same matcher and same bar as the
  // timesheets: only a unique full-coverage match auto-assigns.
  const users = await prisma.user.findMany({
    where: { deactivatedAt: null },
    select: { id: true, name: true, preferredFirstName: true, preferredLastName: true },
  });

  // frozen at upload, same as uploadBatch - rendering on demand with today's
  // date would put a different "generated on" on the same sheet every open.
  const generatedOn = new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });

  const sheetRows = await buildDayProgramSheetRows(result, users, generatedOn);

  const refused = unstorableRows(sheetRows.map((s) => ({ sourceName: s.sourceName, data: s.data })));
  if (refused.length) err("save", `${refused[0].name}'s rows contain ${refused[0].what}`);

  if (!hasBlobStorage()) err("noblob");
  const store = async (key, body, contentType) => {
    const blob = await putBlob(key, body, { access: "public", contentType });
    return blob.url;
  };
  let sourceUrl, restsUrl, auditUrl = null, scheduleUrl = null;
  try {
    const tag = () => randomBytes(10).toString("hex");
    sourceUrl = await store(`timesheets/source/${tag()}.pdf`, Buffer.from(timesheetBytes), "application/pdf");
    restsUrl = await store(`timesheets/rests/${tag()}.xls`, restsBytes, "application/vnd.ms-excel");
    if (scheduleBytes) {
      scheduleUrl = await store(`timesheets/schedule/${tag()}.pdf`, Buffer.from(scheduleBytes), "application/pdf");
    }
    if (auditBytes) {
      auditUrl = await store(
        `day-program/audit/${tag()}.xlsx`,
        auditBytes,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
    }
  } catch (e) {
    console.error("day program source upload failed:", e);
    err("blob");
  }

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
          restsByDate: result.restRows,
          dpAudit: hasAudit
            ? {
                url: auditUrl,
                name: String(auditFile.name || "audit.xlsx"),
                faults: result.faults,
                unmatchedAudit: result.unmatchedAudit,
                span: result.auditSpan,
              }
            : null,
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
    err("save", e?.message || e);
  }

  revalidatePath("/portal/admin/timesheets");
  revalidatePath("/portal/admin/day-program");
  redirect(`/portal/admin/timesheets/${batch.id}`);
}
