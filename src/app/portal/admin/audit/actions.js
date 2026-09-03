"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { readBudgetCapture } from "@/lib/timesheet/budget-capture";

// THE STANDALONE SERVICE NOTES UPLOAD IS GONE, 2026-08-27.
//
// Mánu: "i want to be able to upload all of this info just to the timesheets
// page. and the audit card and more to come can just get it from that info ...
// i also want to do it by timesheet pay period."
//
// `uploadServiceNotes`, `deleteServiceNotes` and `coverageOf` lived here. The
// notes arrive with every other export on the pay period now, so a period's
// notes are replaced by re-uploading it and deleted with it. What is left in
// this file is the reviewing, which was never about the upload.

// A REVIEWER'S DECISION ABOUT ONE SHIFT.
//
// Mánu 2026-08-26: approve means "it looks good as far as billing", and anyone
// who can reach the page may record one - which is admin and up, so field staff
// cannot sign off their own work by reaching this screen.
//
// WHO decided is recorded on every row regardless. An approval is only worth
// what the reviewer's independence makes it worth, and the one person in this
// data who could approve their own shifts is the person reading this.
export async function reviewShift(formData) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");

  const decision = formData.get("decision");
  if (decision !== "approved" && decision !== "flagged") return { ok: false, error: "unknown" };

  const shiftKey = String(formData.get("shiftKey") || "");
  if (!shiftKey) return { ok: false, error: "noshift" };

  const reason = String(formData.get("reason") || "").trim();
  // A FLAG NEEDS NO WORDS - Mánu 2026-09-03: "i should be able to flag
  // without leaving comments." The flagged pile routes attention on its own;
  // words help whoever picks it up and stay optional.

  const num = (k) => {
    const v = formData.get(k);
    return v === null || v === "" || v === "null" ? null : Number(v);
  };

  // THE REVIEWER'S CORRECTED BILLABLE TIME. Mánu 2026-08-31: "when i go
  // through every shift i can adjust how much of the time is actually
  // billable." Optional on either decision; null means the billed figure
  // stands. Clamped to a sane day rather than trusted: this drives a report.
  const rawBillable = num("billableMin");
  const billableMin =
    rawBillable != null && Number.isFinite(rawBillable) && rawBillable >= 0
      ? Math.min(Math.round(rawBillable), 24 * 60)
      : null;

  const row = {
    shiftKey,
    employeeKey: String(formData.get("employeeKey") || ""),
    date: String(formData.get("date") || ""),
    startMin: num("startMin"),
    client: String(formData.get("client") || "") || null,
    service: String(formData.get("service") || "") || null,
    decision,
    reason: decision === "flagged" ? reason || null : null,
    // THE READING AS IT STOOD. A later upload can move these figures; what was
    // signed off should not move with them.
    billedMin: num("billedMin"),
    clockedMin: num("clockedMin"),
    documentedMin: num("documentedMin"),
    billableMin,
    decidedById: user.id,
  };

  await prisma.shiftReview.upsert({
    where: { shiftKey },
    create: row,
    // changing your mind is allowed and overwrites the decision, the reason and
    // who made it - the row is the current decision, not a history of them
    update: {
      decision: row.decision, reason: row.reason, decidedById: user.id,
      billedMin: row.billedMin, clockedMin: row.clockedMin, documentedMin: row.documentedMin,
      billableMin: row.billableMin,
      service: row.service, client: row.client,
    },
  });

  revalidatePath("/portal/admin/audit");
  return { ok: true };
}

// THE MONTH'S AUTHORIZED HOURS, off QSP's Budget Capture Report. The month is
// read from the document's own title line; uploading a month again replaces
// it wholesale, the same shape as every other point-in-time import here.
export async function uploadBudgetCapture(formData) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");

  const file = formData.get("file");
  if (!file || typeof file !== "object" || !("size" in file) || file.size === 0) {
    redirect("/portal/admin/audit?budgeterr=nofile");
  }

  let parsed;
  try {
    parsed = readBudgetCapture(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    redirect(`/portal/admin/audit?budgeterr=${e?.code || "unreadable"}`);
  }

  await prisma.$transaction([
    prisma.clientAuthorization.deleteMany({ where: { monthKey: parsed.monthKey } }),
    prisma.clientAuthorization.createMany({
      data: parsed.rows.map((r) => ({
        monthKey: parsed.monthKey,
        clientKey: r.clientKey,
        clientName: r.clientName,
        office: r.office,
        caseManagerName: r.caseManagerName,
        serviceType: r.serviceType,
        authorizedHours: r.authorizedHours,
        scheduledHours: r.scheduledHours,
        sourceName: typeof file.name === "string" ? file.name.slice(0, 200) : null,
        uploadedById: user.id,
      })),
    }),
  ]);

  revalidatePath("/portal/admin/audit");
  redirect(
    `/portal/admin/audit?budget=${parsed.monthKey}&clients=${parsed.rows.length}` +
      (parsed.skipped.length ? `&skipped=${parsed.skipped.length}` : ""),
  );
}

export async function deleteBudgetMonth(formData) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");
  const monthKey = String(formData.get("monthKey") || "");
  if (!/^\d{4}-\d{2}$/.test(monthKey)) redirect("/portal/admin/audit");
  await prisma.clientAuthorization.deleteMany({ where: { monthKey } });
  revalidatePath("/portal/admin/audit");
  redirect("/portal/admin/audit");
}

export async function undoReview(formData) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");
  const shiftKey = String(formData.get("shiftKey") || "");
  if (!shiftKey) return { ok: false };
  await prisma.shiftReview.deleteMany({ where: { shiftKey } });
  revalidatePath("/portal/admin/audit");
  return { ok: true };
}

// EVERYTHING DECIDED ON ONE PAY PERIOD, WIPED - Mánu 2026-09-03: "there
// should be a reset all button with are you sure buttons". The impact is
// read at click time so the dialog names the real count, the same contract
// the recompute dialog keeps.
export async function auditResetImpact(batchId) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) return { ok: false, error: "auth" };
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id: batchId },
    select: { periodFrom: true, periodTo: true },
  });
  if (!batch) return { ok: false, error: "nobatch" };
  const { periodDates } = await import("@/lib/timesheet/period-of");
  const count = await prisma.shiftReview.count({
    where: { date: { in: periodDates(batch.periodFrom, batch.periodTo) } },
  });
  return { ok: true, count };
}

export async function resetAllReviews(batchId) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) return { ok: false, error: "auth" };
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id: batchId },
    select: { periodFrom: true, periodTo: true },
  });
  if (!batch) return { ok: false, error: "nobatch" };
  const { periodDates } = await import("@/lib/timesheet/period-of");
  // scoped by the period's own dates: ShiftReview keys on the shift, not the
  // batch, so this is every decision the fortnight holds - which is what
  // "reset all" means - and nothing from any other fortnight.
  const gone = await prisma.shiftReview.deleteMany({
    where: { date: { in: periodDates(batch.periodFrom, batch.periodTo) } },
  });
  revalidatePath("/portal/admin/audit");
  return { ok: true, deleted: gone.count };
}
