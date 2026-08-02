"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { putBlob, hasBlobStorage } from "@/lib/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { parseTimesheetPdf, analyzeTimesheet } from "@/lib/timesheet/parse";
import { renderCorrected } from "@/lib/timesheet/render";
import { matchEmployee } from "@/lib/timesheet/match";
import { signTimesheetToken } from "@/lib/timesheet-token";
import { sendTimesheet, isLiveSend } from "@/lib/timesheet-send";

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

  const bytes = new Uint8Array(await file.arrayBuffer());

  let sheets;
  try {
    sheets = await parseTimesheetPdf(bytes);
  } catch (e) {
    console.error("timesheet parse failed:", e);
    redirect("/portal/admin/timesheets/new?error=parse");
  }
  const withHours = sheets.filter((s) => !s.empty);
  if (!withHours.length) {
    redirect("/portal/admin/timesheets/new?error=empty");
  }

  const period = withHours[0].payPeriod || { from: "", to: "" };

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

  const staff = await prisma.user.findMany({
    where: { deactivatedAt: null },
    select: { id: true, name: true, preferredFirstName: true, preferredLastName: true },
  });

  const batch = await prisma.timesheetBatch.create({
    data: {
      periodFrom: period.from || "",
      periodTo: period.to || "",
      sourceUrl,
      sourceName: file.name || null,
      testMode: !isLiveSend(),
      uploadedById: user.id,
    },
  });

  for (const raw of withHours) {
    const t = analyzeTimesheet(raw);
    const m = matchEmployee(t.employee, staff);

    // render the corrected PDF now so the review screen can preview it
    let pdfUrl = null;
    try {
      const pdf = await renderCorrected(t, {
        printedBy: t.employee,
        generatedOn: new Date().toLocaleDateString("en-US"),
      });
      if (hasBlobStorage()) {
        const key = `timesheets/${batch.id}/${randomBytes(8).toString("hex")}.pdf`;
        const blob = await putBlob(key, Buffer.from(pdf), {
          access: "public",
          contentType: "application/pdf",
        });
        pdfUrl = blob.url;
      }
    } catch (e) {
      console.error(`timesheet render failed for ${t.employee}:`, e);
    }

    await prisma.timesheet.create({
      data: {
        batchId: batch.id,
        sourceName: t.employee || "(unknown)",
        userId: m.userId,
        matchMethod: m.method,
        rawHours: r2(t.totals.rawHours),
        paidHours: r2(t.totals.paidHours),
        regularHours: r2(t.totals.regularHours),
        otHours: r2(t.totals.otHours),
        doubleHours: r2(t.totals.doubleHours),
        premiumHours: r2(t.premiums.totalHours),
        partialWeek: t.partialWeekDates.length > 0,
        pdfUrl,
        data: {
          suggestions: m.suggestions,
          confidence: m.confidence,
          premiums: t.premiums,
          partialWeekDates: t.partialWeekDates,
          days: t.days.map((d) => ({
            date: d.date,
            paidHours: r2(d.paidHours),
            rawHours: r2(d.rawHours),
            regularHours: r2(d.regularHours),
            otHours: r2(d.otHours),
            doubleHours: r2(d.doubleHours),
            mealViolation: d.mealViolation,
            restViolation: d.restViolation,
            restCount: d.restCount,
            restRequired: d.restRequired,
          })),
        },
      },
    });
  }

  revalidatePath("/portal/admin/timesheets");
  redirect(`/portal/admin/timesheets/${batch.id}`);
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
    select: { id: true, periodFrom: true, periodTo: true },
  });
  if (!batch) redirect("/portal/admin/timesheets");

  // a row with no generated PDF would email someone a link to a 404, so it is
  // never sendable - the review screen flags those separately.
  const where = { batchId, userId: { not: null }, pdfUrl: { not: null } };
  if (onlyId) where.id = onlyId.toString();
  else if (!resend) where.sentAt = null;

  const rows = await prisma.timesheet.findMany({
    where,
    include: {
      user: { select: { id: true, email: true, name: true, preferredFirstName: true, preferredLastName: true } },
    },
  });

  const base = process.env.AUTH_URL || "https://www.mylifeservicesinc.com";
  const periodLabel = `${batch.periodFrom} to ${batch.periodTo}`;
  const dueLabel = dueAt && !Number.isNaN(dueAt.getTime())
    ? dueAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  let sent = 0;
  let failed = 0;
  for (const ts of rows) {
    if (!ts.user?.email) { failed++; continue; }
    const url = `${base}/t/${signTimesheetToken(ts.id)}`;
    const res = await sendTimesheet({
      intendedEmail: ts.user.email,
      employeeName: preferredName(ts.user) || ts.sourceName,
      periodLabel,
      message,
      dueAt: dueLabel,
      signUrl: url,
      summary: {
        paidHours: ts.paidHours,
        otHours: ts.otHours,
        doubleHours: ts.doubleHours,
        premiumHours: ts.premiumHours,
      },
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

// employee-side: store the signed PDF against their timesheet. called from the
// token page, so it takes the token rather than a session.
export async function submitSignedTimesheet({ token, pdfBase64, signedName }) {
  const { verifyTimesheetToken } = await import("@/lib/timesheet-token");
  const id = verifyTimesheetToken(token);
  if (!id) return { ok: false, error: "auth" };

  const ts = await prisma.timesheet.findUnique({
    where: { id },
    select: { id: true, batchId: true, signedAt: true },
  });
  if (!ts) return { ok: false, error: "auth" };
  if (ts.signedAt) return { ok: false, error: "already" };
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
