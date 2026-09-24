// SENDING A CLIENT'S ATTESTATION OUT TO BE SIGNED.
//
// ONE MESSAGE AT A TIME, THROUGH resend.emails.send, AND NEVER THE BATCH
// ENDPOINT. Every message here carries the form as an attachment, and Resend's
// batch endpoint accepts attachments, reports success and silently drops them -
// which has already cost this repo a week of announcements going out with no
// documents. There is a structural test guarding the announcement sender
// against exactly this; the same rule applies here.
//
// The recipient is resolved through the shared off-production guard, so nothing
// leaves a laptop and nothing reaches staff until the phrase is deliberately set
// on the real deployment. See src/lib/timesheet-mode.js.
import { Resend } from "resend";
import { resolveAttestationRecipients } from "@/lib/timesheet-mode";
import { clientInitials } from "@/lib/initials";

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

export function attestationEmailHtml({
  recipientName,
  kind,
  clientName,
  monthLabel,
  signUrl,
  message,
  dueAt,
  redirectedFrom,
}) {
  const hello = recipientName ? `Hi ${esc(recipientName)},` : "Hi,";
  // initials only - the email never carries the full name (it is on the
  // document, behind the link)
  const who = clientInitials(clientName) || "the client";
  // WHO THE LETTER IS TO changes what it says. A supervisor or staff member is
  // being asked to review the schedule WITH the client; the client is being
  // asked about their own schedule and their own staff.
  const ask =
    kind === "client"
      ? `Your schedule for ${esc(monthLabel)} is ready, with a sign-off section
         under it. Please open it and confirm that you received your schedule,
         that you want to continue with your current staff, and that staff have
         been providing services as scheduled.`
      : `${esc(who)}&rsquo;s schedule for ${esc(monthLabel)} is ready, with a
         sign-off section under it. Please open it, go over it with them and confirm
         that they were given their schedule, that they want to continue with their
         current staff, and that staff have been providing services as scheduled.`;
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16202a">
<div style="max-width:600px;margin:0 auto;padding:24px">
  ${
    redirectedFrom
      ? `<div style="border:1px solid #f0c36d;background:#fdf6e3;border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px;color:#6b5411">
           <b>Test copy.</b> This was meant for ${esc(redirectedFrom)} and came here instead. Nothing was sent to them.
         </div>`
      : ""
  }
  <div style="background:#ffffff;border:1px solid #e3e8ee;border-radius:12px;padding:24px">
    <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#165587">
      Client attestation
    </p>
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">
      ${esc(who)} &middot; ${esc(monthLabel)}
    </h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">${hello}</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">${ask}</p>
    ${
      message
        ? `<div style="margin:0 0 14px;padding:12px 14px;background:#f4f7fa;border-left:3px solid #165587;border-radius:4px;font-size:14px;line-height:1.6">${esc(message)}</div>`
        : ""
    }
    ${
      dueAt
        ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.6"><b>Needed by ${esc(dueAt)}.</b></p>`
        : ""
    }
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6">
      You can sign it in your browser, or open it and print it to sign on
      paper if that&rsquo;s easier with the client.
    </p>
    <p style="margin:0 0 8px">
      <a href="${esc(signUrl)}" style="display:inline-block;background:#2b7cb8;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px">
        Open and sign
      </a>
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#6b7885;line-height:1.5">
      This link opens ${esc(who)}&rsquo;s form only.
    </p>
  </div>
</div>
</body></html>`;
}

// ONE FORM, TO ONE ADDRESS. no attachment: the form carries the client's
// schedule, so it stays behind the signing link, which opens it to print too.
export async function sendAttestation({
  intendedEmail,
  recipientName,
  kind,
  clientName,
  monthLabel,
  signUrl,
  message,
  dueAt,
}) {
  if (!intendedEmail) return { ok: false, error: "norecipient" };
  const from =
    process.env.ATTESTATIONS_FROM ||
    process.env.ANNOUNCEMENTS_FROM ||
    process.env.AUTH_RESEND_FROM;
  if (!from || !process.env.RESEND_API_KEY) return { ok: false, error: "config" };

  const { to, redirected } = resolveAttestationRecipients(intendedEmail, process.env);
  if (!to.length) return { ok: false, error: "norecipient" };

  const who = clientInitials(clientName) || "Client";
  const subject = redirected
    ? `[TEST -> ${intendedEmail}] ${who} - ${monthLabel} schedule attestation`
    : `${who} - ${monthLabel} schedule attestation`;

  const html = attestationEmailHtml({
    recipientName,
    kind,
    clientName,
    monthLabel,
    signUrl,
    message,
    dueAt,
    redirectedFrom: redirected ? intendedEmail : null,
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    // ONE AT A TIME. See the note at the top of this file - the batch endpoint
    // would drop the attachment without saying so.
    const res = await resend.emails.send({
      from,
      to,
      subject,
      html,
    });
    if (res?.error) return { ok: false, error: res.error.message || "send" };
    return { ok: true, to, redirected, intendedEmail };
  } catch (e) {
    return { ok: false, error: e?.message || "send" };
  }
}
