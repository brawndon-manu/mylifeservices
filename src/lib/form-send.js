// build + send one filled-form email. shared by the portal submit action and the
// public share-link submit so both send identically (same from, subject, body,
// attachment). the filled PDF is built in the browser and handed here as base64 -
// nothing is stored, it's emailed and gone.
import { Resend } from "resend";
import { buildFormEmailHtml, EMAIL_TZ } from "@/lib/announcement-email";
// the guard lives in timesheet-mode.js because that module is deliberately
// dependency-free and therefore testable; this one imports resend and cannot be.
import { resolveFormRecipients } from "@/lib/timesheet-mode";

// the cc list for a form send: the route's fixed cc + the submitter (so they keep
// a copy), deduped + minus whoever's already on the TO line. case-insensitive.
export function buildCc(routeCc = [], submitterEmail, recipientEmail) {
  const seen = new Set();
  const skip = (recipientEmail || "").toLowerCase();
  const out = [];
  for (const e of [...routeCc.map((c) => c.email), submitterEmail]) {
    const k = (e || "").toLowerCase();
    if (!k || k === skip || seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

export async function sendFilledForm({
  route,
  formTitle,
  recipientEmail,
  ccEmails = [],
  submitterName,
  submitterEmail,
  replyTo,
  message,
  pdfBase64,
  pdfName,
}) {
  if (typeof pdfBase64 !== "string" || pdfBase64.length < 100) return { ok: false, error: "nofile" };
  // ~2MB cap on the decoded PDF (base64 is ~4/3 the bytes).
  if (pdfBase64.length > 2_800_000) return { ok: false, error: "toobig" };

  const from = route.from || process.env.ANNOUNCEMENTS_FROM || process.env.AUTH_RESEND_FROM;
  if (!from || !process.env.RESEND_API_KEY) return { ok: false, error: "config" };
  if (!recipientEmail) return { ok: false, error: "norecipient" };

  const note = (message || "").toString().trim().slice(0, 2000);
  // pinned to Pacific + " PT" so it reads the same for every reviewer, matching
  // the announcement emails (e.g. "July 9, 2026 at 11:01 AM PT").
  const dateStr =
    new Date().toLocaleString("en-US", {
      timeZone: EMAIL_TZ,
      dateStyle: "long",
      timeStyle: "short",
    }) + " PT";
  const subject = `${formTitle} - submitted by ${submitterName}`;

  const base = process.env.AUTH_URL || "https://www.mylifeservicesinc.com";
  const logoUrl = process.env.EMAIL_LOGO_URL || `${base}/logo/treelogo_gradient.png`;
  const html = buildFormEmailHtml({
    logoUrl,
    formTitle,
    submitterName,
    submitterEmail,
    dateStr,
    note,
  });
  const text = `${formTitle}\n\nSubmitted by ${submitterName} (${submitterEmail})\n${dateStr}\n${note ? `\nAdditional info: ${note}\n` : ""}\nThe signed copy is attached as a PDF. Keep it for your records.\nThis submission has been recorded and the signed document is on file.`;

  const route_ = resolveFormRecipients(recipientEmail, ccEmails);
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const { error } = await resend.emails.send({
      from,
      to: route_.to,
      cc: route_.cc,
      replyTo,
      // say so in the subject, so a redirected copy can never be mistaken for
      // the real thing sitting in a reviewer's inbox
      subject: route_.redirected ? `[TEST - would have gone to ${route_.intendedTo}] ${subject}` : subject,
      html,
      text,
      attachments: [{ filename: pdfName || "form.pdf", content: pdfBase64 }],
    });
    if (error) {
      console.error("form submit email error:", error);
      return { ok: false, error: "send" };
    }
  } catch (e) {
    console.error("form submit email threw:", e);
    return { ok: false, error: "send" };
  }
  return { ok: true };
}
