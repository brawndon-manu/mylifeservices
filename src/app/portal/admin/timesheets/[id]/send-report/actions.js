"use server";

// THE PAYROLL BUNDLE, IN ONE EMAIL - Mánu 2026-09-14: "lets add an option to
// send out the break penalty hours, payout report pdf excel and csv, and the
// most updated signed timesheets with a click of a button that gets emailed to
// david and CC by me and gabriel miranda".
//
// ITS OWN FILE, not timesheets/actions.js, because GPT is working in that one.
//
// THE SIGNED TIMESHEETS GO AS A LINK. Measured on 08/16-08/31: 61 of them are
// 24.30 MB, and email base64-encodes attachments, so they would arrive as about
// 32 MB against Gmail's 25 MB ceiling and bounce. Everyone on this email can
// open the zip - David is ADMIN and Gabriel is SUPER, and canManageTimesheets
// is true for both.
//
// NOTHING LEAVES A LAPTOP. resolveFormRecipients redirects every send that is
// not from the real deployment to Mánu's own inboxes, with the intended address
// in the subject, which is the same lock the forms and attestations use.
import { redirect } from "next/navigation";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { resolveFormRecipients } from "@/lib/timesheet-mode";
import { buildPayrollBundle, onTheWire, BUNDLE_TO, BUNDLE_CC } from "@/lib/timesheet/payroll-bundle";
import { buildPayrollEmailHtml } from "@/lib/announcement-email";

async function requireAccess() {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");
  return user;
}

export async function payrollBundlePreview(batchId) {
  await requireAccess();
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id: String(batchId) },
    select: {
      id: true, periodFrom: true, periodTo: true, program: true, lockedAt: true,
      timesheets: { select: { signedAt: true, signedPdfUrl: true } },
    },
  });
  if (!batch) return { ok: false, error: "gone" };
  const signed = batch.timesheets.filter((t) => t.signedAt).length;
  return {
    ok: true,
    periodFrom: batch.periodFrom,
    periodTo: batch.periodTo,
    program: batch.program || "MLS",
    locked: !!batch.lockedAt,
    signed,
    sheets: batch.timesheets.length,
    to: BUNDLE_TO,
    cc: BUNDLE_CC,
  };
}

export async function sendPayrollBundle(batchId, { anyway = false } = {}) {
  const me = await requireAccess();
  if (!process.env.RESEND_API_KEY) return { ok: false, error: "nomail" };

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id: String(batchId) },
    select: {
      id: true, periodFrom: true, periodTo: true, program: true, lockedAt: true,
      timesheets: { select: { signedAt: true } },
    },
  });
  if (!batch) return { ok: false, error: "gone" };

  // THE SAME DOOR THE STAFF SEND HAS, and for the same reason its comment
  // gives: a wall with no door means somebody needs one at 6pm on payroll day.
  // His call 2026-09-14: warn, do not refuse.
  if (!batch.lockedAt && !anyway) return { ok: false, error: "notfinal" };

  const { files, missing, bytes } = await buildPayrollBundle(batch.id, batch);
  // A FILE THAT DID NOT BUILD STOPS THE SEND. An email that silently arrives
  // with three of the four is worse than one that did not arrive: payroll would
  // key in what is there.
  if (missing.length) {
    return { ok: false, error: "part", missing: missing.map((m) => `${m.label} ${m.why}`) };
  }
  if (onTheWire(bytes) > 20 * 1024 * 1024) {
    return { ok: false, error: "toobig", bytes };
  }

  const base = process.env.AUTH_URL || "https://www.mylifeservicesinc.com";
  const zipUrl = `${base}/portal/admin/timesheets/${batch.id}/download-zip`;
  const signed = batch.timesheets.filter((t) => t.signedAt).length;
  const span = `${batch.periodFrom} to ${batch.periodTo}`;
  const program = batch.program === "DP" ? "Day Program" : "Agency";

  const route = resolveFormRecipients(BUNDLE_TO.email, BUNDLE_CC.map((c) => c.email));
  const subject = `${program} payroll ${span}${batch.lockedAt ? "" : " (period not closed)"}`;

  const logoUrl = process.env.EMAIL_LOGO_URL || `${base}/logo/treelogo_gradient.png`;
  const html = buildPayrollEmailHtml({
    logoUrl,
    program,
    span,
    sentBy: me.name || "the portal",
    files: files.map((f) => ({ label: f.label, ext: f.ext })),
    signed,
    sheets: batch.timesheets.length,
    zipUrl,
    locked: !!batch.lockedAt,
  });

  // the plain-text half, for a client that will not render the HTML
  const lines = [
    `${program} payroll for ${span}.`,
    "",
    "Attached:",
    ...files.map((f) => `  ${f.label} - ${f.filename}`),
    "",
    `Signed timesheets: ${signed} of ${batch.timesheets.length}. They are too large to attach, so they are here:`,
    zipUrl,
    "",
    batch.lockedAt
      ? "This period is closed."
      : "This period is NOT closed yet, so these figures can still change.",
    "",
    `Sent by ${me.name || "the portal"} from the My Life Services portal.`,
  ];

  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const { error } = await resend.emails.send({
      from: process.env.ANNOUNCEMENTS_FROM || process.env.AUTH_RESEND_FROM,
      to: route.to,
      cc: route.cc,
      replyTo: me.email || undefined,
      subject: route.redirected ? `[TEST - would have gone to ${route.intendedEmail}] ${subject}` : subject,
      html,
      text: lines.join("\n"),
      attachments: files.map((f) => ({ filename: f.filename, content: f.content })),
    });
    if (error) {
      console.error("payroll bundle email error:", error);
      return { ok: false, error: "send" };
    }
  } catch (e) {
    console.error("payroll bundle email threw:", e);
    return { ok: false, error: "send" };
  }

  console.log(
    `payroll bundle sent by ${me.id}: ${program} ${span}, ${files.length} files, ` +
    `${Math.round(bytes / 1024)}KB, redirected=${route.redirected}, locked=${!!batch.lockedAt}`,
  );
  return {
    ok: true,
    redirected: route.redirected,
    to: route.to,
    cc: route.cc,
    files: files.map((f) => ({ label: f.label, filename: f.filename, bytes: f.bytes })),
    bytes,
    signed,
  };
}
