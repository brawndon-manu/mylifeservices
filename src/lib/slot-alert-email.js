// "SOMEBODY PICKED A SLOT" - the email behind Announcement.meetingSlotAlerts.
//
// Sent to the announcement's author, and to whoever posted it on their behalf,
// the moment a new slot pick lands. Signing weeks are the case this exists for:
// the author otherwise finds out who is coming by re-opening the roster all day.
//
// EVERY ADDRESS GOES THROUGH resolveAnnouncementRecipients, the same
// off-production guard as every other announcement email: off the real
// deployment these arrive in Mánu's inbox with the intended address in the
// subject, and nothing reaches an author from a laptop.
//
// BEST EFFORT BY DESIGN. A pick that saved is a pick; a notification that
// failed to send must never undo or block it, so callers wrap this in
// try/catch and nothing here throws on a send failure.
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { preferredName } from "@/lib/contacts";
import { resolveAnnouncementRecipients } from "@/lib/timesheet-mode";

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// what a slot is called in the email: its label, the same text the picker shows
function optionLabel(opt) {
  return opt?.label || opt?.at || "a slot";
}

export async function sendSlotAlert(postId, picker, newOptionIds) {
  const ids = (newOptionIds || []).filter(Boolean);
  if (!ids.length) return;

  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: {
      id: true,
      title: true,
      meetingOptions: true,
      meetingSlotAlerts: true,
      author: { select: { id: true, email: true, name: true, preferredFirstName: true, preferredLastName: true } },
      postedBy: { select: { id: true, email: true, name: true, preferredFirstName: true, preferredLastName: true } },
    },
  });
  if (!post?.meetingSlotAlerts) return;

  const from = process.env.ANNOUNCEMENTS_FROM || process.env.AUTH_RESEND_FROM;
  const base = (process.env.AUTH_URL || "").replace(/\/$/, "");
  if (!from || !base || !process.env.RESEND_API_KEY) {
    console.error("slot alert misconfigured - missing from/base/key");
    return;
  }

  const opts = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  const picked = ids.map((id) => opts.find((o) => o && o.id === id)).filter(Boolean);
  if (!picked.length) return;

  // how full each picked slot is NOW, counted rather than guessed
  const counts = await prisma.announcementMeetingChoice.groupBy({
    by: ["optionId"],
    where: { announcementId: post.id, optionId: { in: picked.map((o) => o.id) } },
    _count: true,
  });
  const takenOf = new Map(counts.map((c) => [c.optionId, c._count]));

  // the author and whoever posted on their behalf - minus the picker, who does
  // not need an email about what they just did with their own hands
  const recipients = [];
  const seen = new Set([String(picker?.email || "").toLowerCase()]);
  for (const person of [post.author, post.postedBy]) {
    const email = String(person?.email || "").toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    recipients.push({ email: person.email, name: preferredName(person) });
  }
  if (!recipients.length) return;

  const who = preferredName(picker) || "Somebody";
  const lines = picked
    .map((o) => {
      const taken = takenOf.get(o.id) || 0;
      const cap = o.capacity ? ` &middot; ${taken} of ${o.capacity} taken` : ` &middot; ${taken} taken`;
      return `<li style="margin:0 0 6px">${esc(optionLabel(o))}${cap}</li>`;
    })
    .join("");
  const url = `${base}/portal/announcements/${post.id}`;

  const resend = new Resend(process.env.RESEND_API_KEY);
  for (const r of recipients) {
    const { to, redirected } = resolveAnnouncementRecipients(r.email);
    if (!to.length) continue;
    const subject = redirected
      ? `[TEST -> ${r.email}] ${who} picked a slot - ${post.title || "meeting"}`
      : `${who} picked a slot - ${post.title || "meeting"}`;
    try {
      await resend.emails.send({
        from,
        to,
        subject,
        html: `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16202a">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#ffffff;border:1px solid #e3e8ee;border-radius:12px;padding:22px">
    <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#165587">Slot picked</p>
    <h1 style="margin:0 0 14px;font-size:18px;line-height:1.3">${esc(post.title || "Meeting")}</h1>
    <p style="margin:0 0 10px;font-size:15px;line-height:1.6"><b>${esc(who)}</b> picked:</p>
    <ul style="margin:0 0 16px;padding-left:18px;font-size:14px;line-height:1.5">${lines}</ul>
    <p style="margin:0">
      <a href="${esc(url)}" style="display:inline-block;background:#2b7cb8;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">Open the roster</a>
    </p>
  </div>
</div>
</body></html>`,
      });
      // the one line that says it happened - a send with no record either way
      // is indistinguishable from a hook that never fired
      console.log(
        `slot alert sent: ${post.id} pick by ${picker?.id || "?"} -> ${to.join(", ")}${redirected ? ` (meant for ${r.email})` : ""}`,
      );
    } catch (e) {
      console.error("slot alert send failed:", e?.message || e);
    }
  }
}
