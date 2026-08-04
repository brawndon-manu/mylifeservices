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
import { parseTimesheetPdf, analyzeTimesheet, applyOvertime, analyzeDay } from "@/lib/timesheet/parse";
import { reviewSheet } from "@/lib/timesheet/anomalies";
import { parseSchedulePdf, scheduleKey, compareToSchedule } from "@/lib/timesheet/schedule";
import { renderCorrected } from "@/lib/timesheet/render";
import { matchEmployee } from "@/lib/timesheet/match";
import { signTimesheetToken } from "@/lib/timesheet-token";
import { sendTimesheet, isLiveSend } from "@/lib/timesheet-send";
import { sendCorrectionAlert } from "@/lib/timesheet-correction-email";
import { notifyOversight } from "@/lib/notify";
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

  // the schedule export, if one was given. it's the second record of the same
  // time, and the only way to catch a punch that was typed into the wrong box -
  // those are invisible in the timesheet alone, especially when two of them
  // cancel out and leave a total that looks perfectly ordinary.
  let schedules = null;
  let scheduleError = null;
  const schedFile = formData.get("schedule");
  if (schedFile && typeof schedFile === "object" && "size" in schedFile && schedFile.size > 0) {
    try {
      const sbytes = new Uint8Array(await schedFile.arrayBuffer());
      const people = await parseSchedulePdf(sbytes);
      schedules = new Map(people.map((p) => [scheduleKey(p.employee), p]));
    } catch (e) {
      console.error("schedule parse failed:", e);
      // never lose the whole upload over the optional second file
      scheduleError = (e?.message || String(e)).slice(0, 160);
    }
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

    // two independent quality checks, both recorded rather than acted on. the
    // figures are never altered here - somebody looks at these and decides.
    const punchIssues = reviewSheet(t.days, analyzeDay);
    const sched = schedules ? schedules.get(scheduleKey(t.employee)) || null : null;
    const scheduleCheck = sched
      ? compareToSchedule(t.days, sched.days, { toleranceHours: 1 })
      : null;

    // render the corrected PDF now so the review screen can preview it
    let pdfUrl = null;
    let approvalRect = null;
    try {
      const rendered = await renderCorrected(t, {
        printedBy: t.employee,
        generatedOn: new Date().toLocaleDateString("en-US"),
      });
      approvalRect = rendered.approvalRect;
      if (hasBlobStorage()) {
        const key = `timesheets/${batch.id}/${randomBytes(8).toString("hex")}.pdf`;
        const blob = await putBlob(key, Buffer.from(rendered.bytes), {
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
          approvalRect,
          suggestions: m.suggestions,
          confidence: m.confidence,
          premiums: t.premiums,
          partialWeekDates: t.partialWeekDates,
          payPeriod: t.payPeriod || null,
          comments: t.comments || null,
          // data-quality findings. stored, surfaced, never auto-applied.
          punchIssues,
          scheduleCheck: scheduleCheck
            ? {
                matched: true,
                timesheetTotal: scheduleCheck.timesheetTotal,
                scheduleTotal: scheduleCheck.scheduleTotal,
                flagged: scheduleCheck.flagged,
              }
            : { matched: false },
          // punches + breaks are kept so a sheet can be recomputed and
          // re-rendered after a correction without going back to the source
          // export. mealMin is what a worked-through meal would add back.
          days: t.days.map((d) => ({
            date: d.date,
            paidHours: r2(d.paidHours),
            rawHours: r2(d.rawHours),
            regularHours: r2(d.regularHours),
            otHours: r2(d.otHours),
            doubleHours: r2(d.doubleHours),
            mealViolation: d.mealViolation,
            restViolation: d.restViolation,
            mealMissing: d.mealMissing,
            mealLate: d.mealLate,
            mealStartedAfterMin: d.mealStartedAfterMin,
            mealCount: d.mealCount,
            restCount: d.restCount,
            restRequired: d.restRequired,
            mealRequired: d.mealRequired,
            seventhDay: d.seventhDay || false,
            weekPartial: d.weekPartial || false,
            mealMin: d.breaks
              .filter((b) => b.kind === "meal")
              .reduce((n, b) => n + b.min, 0),
            restMin: d.restMin,
            workedMin: d.workedMin,
            punches: d.punches,
            breaks: d.breaks,
          })),
        },
      },
    });
  }

  revalidatePath("/portal/admin/timesheets");
  redirect(
    `/portal/admin/timesheets/${batch.id}${
      scheduleError ? `?schedfail=${encodeURIComponent(scheduleError)}` : ""
    }`,
  );
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
  // never sendable - the review screen flags those separately. a sheet with an
  // open dispute isn't sendable either: asking someone to sign again while
  // their report sits unanswered is exactly the chasing this replaces.
  const where = {
    batchId,
    userId: { not: null },
    pdfUrl: { not: null },
    disputedAt: null,
  };
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
      batch: { select: { id: true, periodFrom: true, periodTo: true } },
      corrections: { where: { status: "open" }, select: { id: true } },
    },
  });
  if (!ts) return { ok: false, error: "auth" };
  // recomputing with items still open would produce a sheet that's about to
  // change again - deal with all of them first.
  if (ts.corrections.length) return { ok: false, error: "openitems" };

  const stored = ts.data || {};
  const days = stored.days || [];
  // batches uploaded before corrections existed don't carry the punch detail the
  // renderer needs, so there's nothing to rebuild from. say so plainly rather
  // than emit a sheet with an empty punch column.
  if (!days.length || !days.some((d) => Array.isArray(d.punches))) {
    return { ok: false, error: "nodetail" };
  }

  const payPeriod =
    stored.payPeriod || { from: ts.batch.periodFrom, to: ts.batch.periodTo };

  const next = recomputeSheet(
    { days, payPeriod, overrides: ts.overrides },
    applyOvertime,
  );

  let pdfUrl = ts.pdfUrl;
  let approvalRect = stored.approvalRect || null;
  try {
    const rendered = await renderCorrected(
      {
        employee: ts.sourceName,
        payPeriod,
        days: next.days,
        totals: next.totals,
        premiums: next.premiums,
        comments: stored.comments || null,
      },
      {
        printedBy: ts.sourceName,
        generatedOn: new Date().toLocaleDateString("en-US", {
          timeZone: "America/Los_Angeles",
        }),
      },
    );
    approvalRect = rendered.approvalRect;
    const key = `timesheets/${ts.batchId}/${randomBytes(8).toString("hex")}.pdf`;
    const blob = await putBlob(key, Buffer.from(rendered.bytes), {
      access: "public",
      contentType: "application/pdf",
    });
    pdfUrl = blob.url;
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
      pdfUrl,
      // the corrected sheet is a different document, so the old signature and
      // sign-off can't carry over to it. it goes back out unsigned.
      signedAt: null,
      signedPdfUrl: null,
      signedName: null,
      signedIp: null,
      approvedAt: null,
      approvedById: null,
      approvedPdfUrl: null,
      sentAt: null,
      disputedAt: null,
      recomputedAt: new Date(),
      data: {
        ...stored,
        approvalRect,
        premiums: next.premiums,
        partialWeekDates: next.partialWeekDates,
        days: next.days,
      },
    },
  });

  revalidatePath(`/portal/admin/timesheets/${ts.batchId}`);
  revalidatePath(`/portal/admin/timesheets/${ts.batchId}/corrections`);
  return { ok: true };
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
