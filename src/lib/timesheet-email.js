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
  summary,
  checks = [],
  redirectedFrom = null,
}) {
  // loud banner so a test send can never be mistaken for the real thing
  const testBanner = redirectedFrom
    ? `<div style="margin:0 0 18px;padding:12px 14px;background:#fff4e5;border:1px solid #f0b37e;border-radius:8px;color:#7a4a12;font-size:13px;">
         <strong>TEST SEND.</strong> This was addressed to
         <strong>${esc(redirectedFrom)}</strong> and redirected here. Nobody else received it.
       </div>`
    : "";

  const rows = summary
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 18px;border-collapse:collapse;font-size:14px;">
         ${summaryRow("Hours worked (corrected)", `${summary.paidHours} hrs`)}
         ${summary.otHours > 0 ? summaryRow("Overtime", `${summary.otHours} hrs`) : ""}
         ${summary.doubleHours > 0 ? summaryRow("Double time", `${summary.doubleHours} hrs`) : ""}
         ${summary.premiumHours > 0 ? summaryRow("Break premium hours owed", `${summary.premiumHours} hrs`) : ""}
       </table>`
    : "";

  const note = message
    ? `<div style="margin:0 0 18px;padding:14px 16px;background:#f6f8fb;border:1px solid #e3e8ef;border-radius:10px;color:#33414f;">${esc(message).replace(/\n/g, "<br>")}</div>`
    : "";

  const due = dueAt
    ? `<p style="margin:0 0 18px;color:#b45309;font-size:14px;font-weight:600;">Please sign it by ${esc(dueAt)}.</p>`
    : "";

  const body = `
    ${testBanner}
    <p style="margin:0 0 14px;">Hi ${esc(employeeName)},</p>
    <p style="margin:0 0 18px;">Your timesheet for <strong>${esc(periodLabel)}</strong> is ready. Please review the hours and breaks, then sign it.</p>
    ${rows}
    ${renderChecksHtml(checks)}
    ${note}
    ${due}
    <a href="${signUrl}" style="${BTN}">Review &amp; sign my timesheet</a>
    <p style="margin:18px 0 0;font-size:13px;color:#6b7280;">This link is just for you - no login needed. If anything looks wrong, reply to this email instead of signing.</p>`;

  return buildTimesheetShell({ title: `Timesheet - ${periodLabel}`, bodyHtml: body });
}

// ---------------------------------------------------------------------------
// "Things to check on this timesheet"
//
// The email used to state a premium total and nothing else, which is a number
// nobody can check or learn from. Each block below says which days, why, and
// what to do about it - and only the blocks that apply to that person render.
//
// Tone is split on purpose. Where the COMPANY failed to roster a break, it says
// so and tells them the hour is theirs. Where the failure is not RECORDING a
// break they took, that is the bit that gets the firm line. Telling people they
// are in trouble for missing a break is how you stop them reporting missed
// breaks, which is the opposite of what any of this is for.
const CARD = (bg, border) =>
  `margin:0 0 14px;padding:15px 17px;background:${bg};border:1px solid ${border};border-radius:10px;`;
const H = "margin:0 0 9px;font-size:15px;font-weight:700;";
const P = "margin:0 0 10px;font-size:14px;line-height:1.55;";
const TH = "padding:6px 8px;font-size:12px;text-align:left;";
const TD = "padding:6px 8px;border-top:1px solid rgba(0,0,0,.06);font-size:13px;";

function table(headers, rows) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:8px;margin:0 0 10px;">
    <tr>${headers.map((h) => `<th style="${TH}">${esc(h)}</th>`).join("")}</tr>
    ${rows.map((r) => `<tr>${r.map((c) => `<td style="${TD}">${c}</td>`).join("")}</tr>`).join("")}
  </table>`;
}

const hhmm = (min) => {
  const h = Math.floor((min || 0) / 60);
  const m = Math.round((min || 0) % 60);
  return h ? `${h} hr ${m} min` : `${m} min`;
};

function renderCheck(c) {
  const dates = c.rows.map((r) => esc(r.date));
  switch (c.kind) {
    case "missingDay":
      return `<div style="${CARD("#fdf2f2", "#f0c4c4")}">
        <p style="${H}color:#8a2020;">${esc(c.title)} - please look at this one</p>
        <p style="${P}color:#6b2a2a;">Your schedule has ${dates.length === 1 ? "this day" : "these days"},
          but no hours came through for ${dates.length === 1 ? "it" : "them"}, so
          ${dates.length === 1 ? "it pays" : "they pay"} nothing at all.</p>
        ${table(["Day", "Hours you were scheduled"],
          c.rows.map((r) => [esc(r.date), `${esc(r.hours)} hrs`]))}
        <p style="margin:0;font-size:13px;color:#6b2a2a;"><strong>If you worked
          ${dates.length === 1 ? "that day" : "those days"}, reply to this email before you sign.</strong>
          Signing as it stands means signing for hours you were not paid for.</p>
      </div>`;

    case "mealMissing":
      return `<div style="${CARD("#fff8ec", "#f3d9a8")}">
        <p style="${H}color:#7a4a12;">Meal periods</p>
        <p style="${P}color:#5c4a24;">In California you are owed an unpaid 30-minute meal period once
          you pass <strong>5 hours</strong> in a day, and it has to start before the end of your fifth
          hour. On the days below you worked over 5 hours and <strong>no meal period was scheduled for
          you</strong>. That is on us, not on you, and you are owed an extra hour of pay for each one.</p>
        ${table(["Day", "Hours worked"], c.rows.map((r) => [esc(r.date), `${esc(r.hours)} hrs`]))}
        <p style="margin:0;font-size:13px;color:#7a4a12;">Those hours are already included in this
          timesheet. If you did take a lunch on any of these days, reply and tell us.</p>
      </div>`;

    case "mealLate":
      return `<div style="${CARD("#fff8ec", "#f3d9a8")}">
        <p style="${H}color:#7a4a12;">Meal periods that started late</p>
        <p style="${P}color:#5c4a24;">A meal period has to <strong>begin</strong> before the end of your
          fifth hour of work. Taking it later still counts as a missed meal period under California law,
          even though you took it - so an extra hour is owed for each of these.</p>
        ${table(["Day", "Your meal started"], c.rows.map((r) =>
          [esc(r.date), `${esc(hhmm(r.startedAfter))} into your shift`]))}
        <p style="margin:0;font-size:13px;color:#7a4a12;"><strong>Going forward, start your lunch before
          you have worked five hours.</strong> If your schedule does not leave room for that, tell your
          supervisor - that is a scheduling problem, not yours to absorb.</p>
      </div>`;

    case "restGap":
      return `<div style="${CARD("#fff8ec", "#f3d9a8")}">
        <p style="${H}color:#7a4a12;">Rest breaks</p>
        <p style="${P}color:#5c4a24;">You get a paid <strong>10-minute rest break for every 4 hours</strong>
          you work, or major fraction of one. On the days below your schedule has a short gap, but no rest
          break was recorded, so we have no record that you took one.</p>
        ${table(["Day", "Worked", "Gap in your schedule", "Breaks recorded"], c.rows.map((r) =>
          [esc(r.date), `${esc(r.hours)} hrs`, esc(r.gaps.join(", ")),
           `<strong>${esc(r.taken)} of ${esc(r.owed)}</strong>`]))}
        ${restAdvice()}
      </div>`;

    case "restNoGap":
      return `<div style="${CARD("#fff8ec", "#f3d9a8")}">
        <p style="${H}color:#7a4a12;">Rest breaks</p>
        <p style="${P}color:#5c4a24;">You get a paid <strong>10-minute rest break for every 4 hours</strong>
          you work, or major fraction of one. No rest break was recorded on the days below, so an extra
          hour of pay is owed for each.</p>
        ${table(["Day", "Worked", "Breaks recorded"], c.rows.map((r) =>
          [esc(r.date), `${esc(r.hours)} hrs`, `<strong>${esc(r.taken)} of ${esc(r.owed)}</strong>`]))}
        ${restAdvice()}
      </div>`;

    case "corrected":
      return `<div style="${CARD("#f2f7fd", "#c8dcf3")}">
        <p style="${H}color:#1c4d80;">Punch times we corrected</p>
        <p style="${P}color:#2c4a66;">On the days below a break's two times were entered the wrong way
          round, which counted the same minutes twice. We have read them in the correct order. The
          schedule for each day agrees with the corrected figure, and your break premiums are unchanged.</p>
        ${table(["Day", "Was", "Now"], c.rows.map((r) =>
          [esc(r.date), `${esc(r.before)} hrs`, `<strong>${esc(r.after)} hrs</strong>`]))}
        <p style="margin:0;font-size:13px;color:#2c4a66;">When you clock a break, enter the time you stop
          first, then the time you start again.</p>
      </div>`;

    // Mánu 2026-08-09: raise these in the email as an issue, with options to
    // correct it. Deliberately NOT decided anywhere - saying "meal" would take a
    // premium hour off the person, and the only one who knows is them.
    case "restIsMealLength":
      return `<div style="${CARD("#fff8ec", "#f0dcb8")}">
        <p style="${H}color:#7a4a12;">A 30-minute break nobody can classify</p>
        <p style="${P}color:#5c4a24;">The break record has the entries below filed as
          <strong>rest breaks</strong>, but each one runs 30 minutes. A rest break is 10 minutes and a
          meal period is 30, so we cannot tell which these were. <strong>Nothing has been added or
          removed for them</strong> and your break premiums are unchanged.</p>
        ${table(["Day", "What the record has", "Length"], c.rows.map((r) =>
          [esc(r.date), `${esc(r.from)} - ${esc(r.to)}`, `${esc(r.minutes)} min`]))}
        <p style="${P}color:#5c4a24;margin-bottom:8px;"><strong>Which was it?</strong></p>
        <ul style="margin:0 0 10px;padding-left:20px;font-size:14px;color:#5c4a24;line-height:1.6;">
          <li><strong>It was my unpaid meal period.</strong> Reply and say so. That day would stop owing
            a meal premium, so your premium hours would go <strong>down by one hour for each day</strong>.
            Say it only if it is true - we would rather pay it than assume it.</li>
          <li><strong>It was a 10-minute rest break and the times are wrong.</strong> Reply with the time
            you actually stopped and we will correct the record. Your premiums do not change.</li>
          <li><strong>Neither - I did not take a break then.</strong> Reply and say so. Nothing changes,
            the premium stays, and we will get the entry fixed at source.</li>
        </ul>
        <p style="margin:0;font-size:13px;color:#7a4a12;">Clock meal periods and rest breaks separately,
          so the record shows which is which.</p>
      </div>`;

    // ten minutes recorded against no shift at all. Paid, no premium, and worth
    // saying because the habit is what needs fixing, not the pay.
    case "restOutsideShift":
      return `<div style="${CARD("#f2f7fd", "#c8dcf3")}">
        <p style="${H}color:#1c4d80;">Rest breaks recorded outside your shift</p>
        <p style="${P}color:#2c4a66;">On the days below your rest break is recorded
          <strong>before your first shift started or after your last one ended</strong>. A rest period
          is paid time, so <strong>those minutes have been added to your day and paid</strong>, and no
          break premium is owed for them.</p>
        ${table(["Day", "Recorded at"], c.rows.map((r) =>
          [esc(r.date), `${esc(r.from)} - ${esc(r.to)}`]))}
        <p style="${P}color:#2c4a66;margin-bottom:8px;"><strong>Please check these.</strong></p>
        <ul style="margin:0 0 10px;padding-left:20px;font-size:14px;color:#2c4a66;line-height:1.6;">
          <li><strong>That is when I took it.</strong> Nothing to do. Going forward take your rest break
            <em>during</em> the shift - a break before you start is not the break the law gives you.</li>
          <li><strong>I took it during my shift and the time is wrong.</strong> Reply with when you
            actually stopped and we will correct it.</li>
        </ul>
        <p style="margin:0;font-size:13px;color:#2c4a66;">Either way you are not out of pocket. This is
          about the record matching the day.</p>
      </div>`;

    // the report asserts a break and holds neither end of it
    case "restNoTimes":
      return `<div style="${CARD("#f2f7fd", "#c8dcf3")}">
        <p style="${H}color:#1c4d80;">A rest break with no times on it</p>
        <p style="${P}color:#2c4a66;">The break record says you took a rest break on the shift below
          but has neither the time you stopped nor the time you started again. Your timesheet shows it
          as <strong>???</strong> on that shift. <strong>Nothing has been charged and no premium is
          affected</strong> - it looks like the times were simply never entered.</p>
        ${table(["Day", "Shift"], c.rows.map((r) => [esc(r.date), esc(r.shift)]))}
        <p style="${P}color:#2c4a66;margin-bottom:8px;"><strong>Did you take it?</strong></p>
        <ul style="margin:0 0 10px;padding-left:20px;font-size:14px;color:#2c4a66;line-height:1.6;">
          <li><strong>Yes.</strong> Reply with roughly when, and we will put the times in so the record
            is complete.</li>
          <li><strong>No, I did not get one.</strong> Reply and say so - then a break premium IS owed
            for that day and we will add it.</li>
        </ul>
        <p style="margin:0;font-size:13px;color:#2c4a66;">Clock out and back in for your rest breaks so
          the times record themselves.</p>
      </div>`;

    // a meal rostered in the middle of the night
    case "mealAmPm":
      return `<div style="${CARD("#f2f7fd", "#c8dcf3")}">
        <p style="${H}color:#1c4d80;">A meal break rostered in the middle of the night</p>
        <p style="${P}color:#2c4a66;">Your schedule has a meal break at a time nobody works. We have
          read it as twelve hours out - an AM picked where PM was meant - and your timesheet shows it at
          the corrected time. <strong>Your hours and premiums are unchanged.</strong></p>
        ${table(["Day", "Schedule says", "We read it as"], c.rows.map((r) =>
          [esc(r.date), esc(r.was), `<strong>${esc(r.now)}</strong>`]))}
        <p style="margin:0;font-size:13px;color:#2c4a66;">If that is not when your meal break was, reply
          and tell us - we would rather fix the schedule than guess at it twice.</p>
      </div>`;

    case "mealUnknown":
      return `<div style="${CARD("#f4f6f9", "#d8dee6")}">
        <p style="${H}color:#33414f;">Days we could not check</p>
        <p style="${P}color:#4a5a6b;">We have no schedule for the days below, so we cannot
          tell whether you were given a meal period. Nothing has been added or removed for them.</p>
        ${table(["Day", "Hours worked"], c.rows.map((r) => [esc(r.date), `${esc(r.hours)} hrs`]))}
        <p style="margin:0;font-size:13px;color:#4a5a6b;">If you missed a meal period on any of these,
          reply and we will add it.</p>
      </div>`;

    default:
      return "";
  }
}

function restAdvice() {
  return `<p style="${P}color:#5c4a24;margin-bottom:8px;"><strong>Which was it?</strong></p>
    <ul style="margin:0 0 10px;padding-left:20px;font-size:14px;color:#5c4a24;line-height:1.6;">
      <li><strong>You took the break but did not clock it.</strong> That is the one to fix. Clock out and
        back in for every rest break from now on - if it is not recorded, it did not happen as far as
        payroll and the state are concerned.</li>
      <li><strong>You did not get to take it.</strong> Then the extra hour on this sheet is yours and you
        should sign for it. Tell your supervisor so the schedule can be fixed - that is our problem to
        solve, not yours.</li>
    </ul>
    <p style="margin:0;font-size:13px;color:#7a4a12;">Rest breaks are not optional and not something to
      work through. Repeatedly not recording them is a timekeeping issue and will be documented and
      raised with your supervisor. If you are regularly unable to take them, say so.</p>`;
}

export function renderChecksHtml(checks) {
  if (!checks?.length) return "";
  return `<p style="margin:22px 0 10px;font-size:16px;font-weight:700;color:#0f2230;">Things to check on this timesheet</p>
    ${checks.map(renderCheck).join("")}`;
}

function summaryRow(label, value) {
  return `<tr>
    <td style="padding:6px 0;color:#64748b;border-bottom:1px solid #eef1f5;">${esc(label)}</td>
    <td style="padding:6px 0;text-align:right;font-weight:600;color:#0f2230;border-bottom:1px solid #eef1f5;">${esc(value)}</td>
  </tr>`;
}
