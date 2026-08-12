// the "your timesheet is ready to sign" email. reuses the shared portal email
// shell so it matches every other message we send.
import { buildTimesheetShell } from "@/lib/announcement-email";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BTN =
  "display:inline-block;background:#2f6feb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;";

export function buildTimesheetEmailHtml({
  employeeName,
  periodLabel,
  message,
  dueAt,
  signUrl,
  // how many questions this person has waiting. The only number in the email.
  questionCount = 0,
  redirectedFrom = null,
}) {
  // loud banner so a test send can never be mistaken for the real thing
  const testBanner = redirectedFrom
    ? `<div style="margin:0 0 18px;padding:12px 14px;background:#fff4e5;border:1px solid #f0b37e;border-radius:8px;color:#7a4a12;font-size:13px;">
         <strong>TEST SEND.</strong> This was addressed to
         <strong>${esc(redirectedFrom)}</strong> and redirected here. Nobody else received it.
       </div>`
    : "";

  // THE EMAIL CARRIES NO FIGURES AT ALL. Mánu 2026-08-11, rewriting it down to
  // the bare minimum: no hours, no premium total, no policy paragraph, no
  // sender. Everything it used to state is on the page the button opens, where
  // it sits beside the document those figures describe - and a payroll figure
  // quoted in an email is a figure that goes stale the moment somebody answers
  // a question. This email exists to get them to the page.
  //
  // IT COUNTS NOTHING EITHER. It used to name a question count - "There are
  // several questions about your breaks on the page. Answering them is
  // optional." - and Mánu cut that on 2026-08-12: "just make it the same email
  // for all." So no two people's copies differ, and nothing in it can go stale
  // the moment somebody answers something.
  //
  // HE CUT THE CONSEQUENCE LINE - "we will take your breaks as fine" - and it
  // stays cut. Under the flip it would be false anyway: ignoring the email
  // changes nothing about their pay.
  //
  // `questionCount` is still accepted and deliberately ignored: the callers pass
  // it and keeping the signature stable costs nothing.

  const note = message
    ? `<div style="margin:0 0 18px;padding:14px 16px;background:#f6f8fb;border:1px solid #e3e8ef;border-radius:10px;color:#33414f;">${esc(message).replace(/\n/g, "<br>")}</div>`
    : "";

  const due = dueAt
    ? `<p style="margin:0 0 18px;color:#b45309;font-size:14px;font-weight:600;">Please sign it by ${esc(dueAt)}.</p>`
    : "";

  const body = `
    ${testBanner}
    <p style="margin:0 0 14px;">Hi ${esc(employeeName)},</p>
    <p style="margin:0 0 18px;">Your timesheet for <strong>${esc(periodLabel)}</strong> is ready. Please review it and sign.</p>
    ${note}
    ${due}
    <a href="${signUrl}" style="${BTN}">Review &amp; sign my timesheet</a>
    <p style="margin:18px 0 0;font-size:13px;color:#6b7280;">This link is just for you - no login needed. If anything looks wrong, reply to this email instead of signing.</p>`;

  return buildTimesheetShell({ title: `Timesheet - ${periodLabel}`, bodyHtml: body });
}

// ---------------------------------------------------------------------------
// "Things to check on this timesheet" - REMOVED 2026-08-12.
//
// ~270 lines of employee-facing copy lived here: one HTML card per finding,
// `renderCheck` and `renderChecksHtml`. Nothing imported either of them. The
// 2026-08-11 rewrite had already cut the email back to a greeting and a button,
// and the block was kept on the grounds that it was the only written
// explanation of each finding anywhere and the page might want it.
//
// It went because of what it SAID. Every card quoted penalty pay - "an hour of
// penalty pay goes on for each one", "no penalty pay has been added", "your
// premium hours would go down by one hour for each day" - and Mánu ruled on
// 2026-08-12 that no employee-facing surface mentions penalty or added time at
// all. Dead copy stating a rule we have abandoned is worse than no copy: it
// cannot be seen on a page, so nobody notices it is wrong, and the day somebody
// wires it back up it ships that wording to staff.
//
// It is in git if the wording is ever wanted as a starting point. Anything that
// replaces it says what happened to the RECORD, not what it did to pay.
