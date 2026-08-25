// THE CORRECTIONS A SIGNED REVIEW PRODUCED, GOING TO THE OFFICE. Mánu
// 2026-08-25: the office makes the QuickSolve edits now, not the employee -
// "i want the corrections / reasons to be emailed to Gabriel Miranda and CC
// to kristy, april, david."
//
// AND THE EMPLOYEE IS NOT TOLD THIS EMAIL EXISTS. Their signed copy shows
// their own review record and nothing about where else it went; nothing on
// their page mentions it either. That is on instruction, not an oversight.
//
// WHO RECEIVES IT IS RESOLVED FROM THE USER TABLE BY NAME, at send time, so
// an address change in the portal follows through here without a deploy and
// no staff email is committed to the repository (which is public). A person
// who cannot be resolved is skipped and logged; if the TO cannot be resolved
// the first resolvable CC takes the TO line rather than the mail silently
// not going.
//
// It goes through the same send guard as everything else in this feature: in
// test mode the whole thing is redirected to the tester and the CC list is
// dropped, so a dry run never emails real management.
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { buildTimesheetShell } from "@/lib/announcement-email";
import { resolveRecipients } from "@/lib/timesheet-mode";
import { reviewCorrectionsSubject } from "@/lib/timesheet-subjects";

// the four people, TO first. Names, not addresses - see above.
const TO_NAME = "Gabriel Miranda";
const CC_NAMES = ["Kristy Hatt", "April Martinez", "David Zermeno"];

async function emailByName(name) {
  const u = await prisma.user.findFirst({
    where: { deactivatedAt: null, name: { equals: name, mode: "insensitive" } },
    select: { email: true },
  });
  return u?.email || null;
}

// -> { to, cc } as addresses, with the fallback promotion described above.
export async function resolveReviewRecipients() {
  const to = await emailByName(TO_NAME);
  const cc = [];
  for (const name of CC_NAMES) {
    const email = await emailByName(name);
    if (email) cc.push(email);
    else console.error(`review corrections cc unresolved: ${name}`);
  }
  if (to) return { to, cc };
  console.error(`review corrections recipient unresolved: ${TO_NAME}`);
  return cc.length ? { to: cc[0], cc: cc.slice(1) } : { to: null, cc: [] };
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BTN =
  "display:inline-block;background:#2f6feb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;";

export function buildReviewCorrectionsEmailHtml({
  employeeName,
  periodLabel,
  // [{ date, said, changes: [{ fact, action }] }] from reviewChoices
  items = [],
  batchUrl,
  redirectedFrom = null,
}) {
  const testBanner = redirectedFrom
    ? `<div style="margin:0 0 18px;padding:12px 14px;background:#fff4e5;border:1px solid #f0b37e;border-radius:8px;color:#7a4a12;font-size:13px;">
         <strong>TEST SEND.</strong> This was addressed to
         <strong>${esc(redirectedFrom)}</strong> and redirected here.
       </div>`
    : "";

  const fixCount = items.reduce((n, it) => n + (it.changes?.length || 0), 0);

  // EVERY EDIT SITS UNDER THE ANSWER THAT PRODUCED IT, the same rule as the
  // employee's copy. The receipts are quoted exactly as their review page
  // worded them - "You said..." is the page speaking to them, not this email
  // speaking to its reader - and the intro line below says so once.
  const itemHtml = (it) => {
    const saidLine = it.said
      ? `<p style="margin:0 0 4px;color:#5f4a17;">${esc(it.said)}</p>`
      : "";
    const changeLines = (it.changes || []).map((ch) =>
      `<p style="margin:0 0 4px;color:#7a4a12;"><strong>Change in QuickSolve:</strong> ${esc(ch.fact)} ${esc(ch.action)}</p>`,
    ).join("");
    return `<li style="margin:0 0 12px;">
        <p style="margin:0 0 4px;font-weight:600;color:#5f4a17;">${esc(it.date)}</p>
        ${saidLine}${changeLines}
      </li>`;
  };

  const body = `
    ${testBanner}
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1b2430;">
      <strong>${esc(employeeName)}</strong> signed their timesheet for
      <strong>${esc(periodLabel)}</strong>.
      ${fixCount === 0
        ? "Their review changes nothing in QuickSolve; their answers are below."
        : fixCount === 1
          ? "Their review leaves one entry to change in QuickSolve."
          : `Their review leaves ${fixCount} entries to change in QuickSolve.`}
    </p>
    <p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#5b6b7c;">
      Their answers are quoted the way their review page worded them.
    </p>
    <div style="margin:0 0 22px;padding:14px 16px;background:#fffbeb;border:1px solid #f0d48a;border-radius:10px;">
      <ul style="margin:0;padding:0 0 0 18px;list-style:none;">
        ${items.map(itemHtml).join("")}
      </ul>
    </div>
    ${batchUrl
      ? `<p style="margin:0 0 8px;"><a href="${esc(batchUrl)}" style="${BTN}">Open the timesheet</a></p>`
      : ""}`;

  return buildTimesheetShell({
    title: "Corrections from a signed review",
    bodyHtml: body,
    eyebrow: "Payroll",
  });
}

export async function sendReviewCorrections({
  employeeName,
  periodLabel,
  items = [],
  batchUrl,
  // see `batchForceTo` - a rehearsal batch redirects this one as well
  forceTo = null,
}) {
  if (!items.length) return { ok: false, error: "noitems" };
  const from =
    process.env.TIMESHEET_FROM ||
    process.env.ANNOUNCEMENTS_FROM ||
    process.env.AUTH_RESEND_FROM;
  if (!from || !process.env.RESEND_API_KEY) return { ok: false, error: "config" };

  const intended = await resolveReviewRecipients();
  if (!intended.to) return { ok: false, error: "norecipient" };

  // the TO drives the guard; the CC rides on the same decision and is dropped
  // on a redirect, so a test run cannot half-reach real management.
  const { to, redirected } = resolveRecipients(intended.to, process.env, { forceTo });
  if (!to.length) return { ok: false, error: "norecipient" };
  const cc = redirected ? [] : intended.cc;

  const subject = reviewCorrectionsSubject({
    employeeName,
    periodLabel,
    redirectedFrom: redirected ? intended.to : null,
  });
  const html = buildReviewCorrectionsEmailHtml({
    employeeName,
    periodLabel,
    items,
    batchUrl,
    redirectedFrom: redirected ? intended.to : null,
  });

  const fixCount = items.reduce((n, it) => n + (it.changes?.length || 0), 0);
  const itemText = (it) => [
    `  ${it.date}`,
    it.said ? `    ${it.said}` : "",
    ...(it.changes || []).map((ch) => `    Change in QuickSolve: ${ch.fact} ${ch.action}`),
  ].filter(Boolean).join("\n");
  const text = [
    redirected ? `*** TEST SEND - this was meant for ${intended.to} ***\n` : "",
    `${employeeName} signed their timesheet for ${periodLabel}.`,
    fixCount === 0
      ? "Their review changes nothing in QuickSolve; their answers are below."
      : `Their review leaves ${fixCount === 1 ? "one entry" : `${fixCount} entries`} to change in QuickSolve.`,
    ``,
    `Their answers are quoted the way their review page worded them.`,
    ``,
    items.map(itemText).join("\n"),
    batchUrl ? `\n${batchUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const { error } = await resend.emails.send({
      from,
      to,
      ...(cc.length ? { cc } : {}),
      subject,
      html,
      text,
    });
    if (error) {
      console.error("review corrections send error:", error);
      return { ok: false, error: "send" };
    }
  } catch (e) {
    console.error("review corrections send threw:", e);
    return { ok: false, error: "send" };
  }
  return { ok: true, redirected, sentTo: to.join(", ") };
}
