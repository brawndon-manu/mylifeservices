"use server";

// handles job application submissions: validate -> rate-limit -> email the
// careers inbox via resend, with the resume attached. recipient is env-driven
// (APPLICATIONS_INBOX). sends FROM the verified resend sender, reply-to = the
// applicant so staff can reply straight to them. email is sent as styled HTML
// with a plain-text fallback.

import { headers } from "next/headers";
import { Resend } from "resend";
import { checkRateLimit, cleanEmail, cleanDisplayName } from "@/lib/security";

// keep under Vercel Hobby's ~4.5MB request cap (resume + the text fields).
const MAX_RESUME_BYTES = 4 * 1024 * 1024;
const ALLOWED_RESUME_EXT = [".pdf", ".doc", ".docx"];

// mirrored from the form so the server controls how things are labeled.
const POSITIONS = [
  { name: "pos_ils", label: "Independent Living Staff" },
  { name: "pos_dps", label: "Day Program Staff" },
  { name: "pos_sls", label: "Supported Living Staff" },
  { name: "pos_sds", label: "Self-Determination Staff" },
  { name: "pos_css", label: "Crisis Support Staff" },
];
const EMPLOYMENT_TYPES = [{ name: "avail_ft" }, { name: "avail_pt" }, { name: "avail_oc" }];
const SHIFTS = [{ name: "shift_am" }, { name: "shift_pm" }, { name: "shift_we" }];
const CERTIFICATIONS = [
  { name: "cert_cpr" },
  { name: "cert_cna" },
  { name: "cert_dsp" },
  { name: "cert_med" },
  { name: "cert_medi" },
];

export async function submitApplication(_prevState, formData) {
  // honeypot - hidden field; if filled it's a bot, fake-succeed
  if (formData.get("company")) return { ok: true };

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { ok: underLimit } = await checkRateLimit(`apply:${ip}`);
  if (!underLimit) {
    return {
      ok: false,
      error: "Too many submissions in a short time. Please wait a minute and try again.",
    };
  }

  const firstName = cleanDisplayName(formData.get("first_name"), 80);
  const lastName = cleanDisplayName(formData.get("last_name"), 80);
  const email = cleanEmail(formData.get("email"));

  if (!firstName || !lastName) return { ok: false, error: "Please enter your first and last name." };
  if (!email) return { ok: false, error: "Please enter a valid email address." };

  // resume (optional). server action receives it as a File via FormData.
  let attachments;
  const resume = formData.get("resume");
  if (resume && typeof resume === "object" && typeof resume.arrayBuffer === "function" && resume.size > 0) {
    if (resume.size > MAX_RESUME_BYTES) {
      return { ok: false, error: "Your resume is over 4MB. Please attach a smaller file." };
    }
    const lowerName = (resume.name || "").toLowerCase();
    if (!ALLOWED_RESUME_EXT.some((ext) => lowerName.endsWith(ext))) {
      return { ok: false, error: "Resume must be a PDF or Word document (.pdf, .doc, .docx)." };
    }
    const buffer = Buffer.from(await resume.arrayBuffer());
    attachments = [{ filename: resume.name || "resume", content: buffer }];
  }

  // if they said their work history is on their resume, a resume must be attached
  if (formData.get("exp_on_resume") && !attachments) {
    return {
      ok: false,
      error:
        "You checked that your work history is on your resume. Please attach it below, or uncheck that box and fill in your work experience.",
    };
  }

  // APPLICATIONS_INBOX can be one address or a comma-separated list - everyone
  // listed gets a copy.
  const to = (process.env.APPLICATIONS_INBOX || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // dedicated sender so reviewers can filter applications easily. any
  // @mylifeservicesinc.com address works since the domain is verified in
  // resend; falls back to the default sender if APPLICATIONS_FROM isn't set.
  const from = process.env.APPLICATIONS_FROM || process.env.AUTH_RESEND_FROM;
  if (!to.length || !from || !process.env.RESEND_API_KEY) {
    console.error(
      "application form misconfigured - missing APPLICATIONS_INBOX / AUTH_RESEND_FROM / RESEND_API_KEY",
    );
    return {
      ok: false,
      error: "Something went wrong on our end. Please try again, or call us at (562) 686-2548.",
    };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const app = readApplication(formData, attachments ? attachments[0].filename : null);

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: email,
      subject: `New job application from ${firstName} ${lastName}`,
      text: buildText(app),
      html: buildHtml(app),
      attachments,
    });
    if (error) {
      console.error("resend application send error:", error);
      return {
        ok: false,
        error: "We couldn't submit your application. Please try again, or call us at (562) 686-2548.",
      };
    }
  } catch (err) {
    console.error("application send threw:", err);
    return {
      ok: false,
      error: "We couldn't submit your application. Please try again, or call us at (562) 686-2548.",
    };
  }

  return { ok: true, firstName };
}

/* -------------------------------------------------------------------------- */
/*  Email body builders                                                       */
/* -------------------------------------------------------------------------- */

// pull the whole application into one structured object that both the text
// and html builders read from, so the two never drift apart.
function readApplication(data, resumeFileName) {
  const v = (name) => {
    const value = data.get(name);
    const s = value === null || value === undefined ? "" : value.toString().trim();
    return s || "—";
  };
  const checkedAny = (names) => {
    const vals = [];
    for (const n of names) {
      const val = data.get(n);
      if (val) vals.push(val.toString());
    }
    return vals.length ? vals.join(", ") : "None selected";
  };

  return {
    positions: checkedAny(POSITIONS.map((p) => p.name)),
    appDate: v("app_date"),
    startDate: v("start_date"),
    name: `${v("first_name")} ${v("last_name")}`.replace(/—/g, "").trim() || "—",
    address: `${v("address")}, ${v("city")}, ${v("state")} ${v("zip")}`,
    phonePrimary: v("phone_primary"),
    phoneSecondary: v("phone_secondary"),
    email: v("email"),
    referral: v("q_referral"),
    referralName: v("referral_name"),
    empType: checkedAny(EMPLOYMENT_TYPES.map((t) => t.name)),
    shifts: checkedAny(SHIFTS.map((s) => s.name)),
    pay: v("pay_rate"),
    hours: v("hours_week"),
    education: v("education"),
    fieldOfStudy: v("field_of_study"),
    school: v("school"),
    certs: checkedAny(CERTIFICATIONS.map((c) => c.name)),
    expOnResume: !!data.get("exp_on_resume"),
    employers: [1, 2, 3].map((i) => ({
      name: v(`emp${i}_name`),
      title: v(`emp${i}_title`),
      supervisor: v(`emp${i}_supervisor`),
      phone: v(`emp${i}_phone`),
      from: v(`emp${i}_from`),
      to: v(`emp${i}_to`),
      reason: v(`emp${i}_reason`),
      duties: v(`emp${i}_duties`),
    })),
    qualifications: [
      ["Disability experience", v("q_disability")],
      ["Behavioral support plans", v("q_bsp")],
      ["Bilingual", v("q_bilingual")],
      ["CA Driver's License", v("q_license")],
      ["Reliable vehicle", v("q_vehicle")],
      ["Auto insurance", v("q_insurance")],
      ["Vehicle registration", v("q_registration")],
      ["Willing to transport clients", v("q_transport")],
      ["DSP training", v("q_dsp")],
    ],
    additionalSkills: v("additional_skills"),
    references: [1, 2, 3].map((i) => ({
      name: v(`ref${i}_name`),
      relationship: v(`ref${i}_relationship`),
      org: v(`ref${i}_org`),
      phone: v(`ref${i}_phone`),
    })),
    conviction: v("q_conviction"),
    convictionExplain: v("conviction_explain"),
    signature: v("signature"),
    signDate: v("sign_date"),
    resume: resumeFileName || null,
  };
}

// plain-text fallback (and what clients without html rendering will show).
function buildText(a) {
  const lines = [];
  lines.push("=== MY LIFE SERVICES – EMPLOYMENT APPLICATION ===\n");
  lines.push("POSITION(S) APPLIED FOR: " + a.positions);
  lines.push(`Application Date: ${a.appDate}  |  Available Start Date: ${a.startDate}`);
  lines.push("\n--- PERSONAL INFORMATION ---");
  lines.push(`Name: ${a.name}`);
  lines.push(`Address: ${a.address}`);
  lines.push(`Primary Phone: ${a.phonePrimary}  |  Secondary: ${a.phoneSecondary}`);
  lines.push(`Email: ${a.email}`);
  lines.push("\n--- REFERRAL ---");
  lines.push(`Referred by an employee: ${a.referral}`);
  lines.push(`Referrer name: ${a.referralName}`);
  lines.push("\n--- AVAILABILITY ---");
  lines.push(`Employment Type: ${a.empType}`);
  lines.push(`Shifts: ${a.shifts}`);
  lines.push(`Desired Pay: ${a.pay}  |  Hours/Week: ${a.hours}`);
  lines.push("\n--- EDUCATION ---");
  lines.push(`Education: ${a.education}`);
  lines.push(`Field of Study: ${a.fieldOfStudy}  |  School: ${a.school}`);
  lines.push(`Certifications: ${a.certs}`);
  lines.push("\n--- WORK EXPERIENCE ---");
  if (a.expOnResume) {
    lines.push("Provided in the attached resume.");
  } else {
    a.employers.forEach((e, i) => {
      lines.push(`Employer ${i + 1}: ${e.name} | Title: ${e.title} | Supervisor: ${e.supervisor} | Phone: ${e.phone}`);
      lines.push(`  Dates: ${e.from} to ${e.to} | Reason for Leaving: ${e.reason}`);
      lines.push(`  Duties: ${e.duties}`);
    });
  }
  lines.push("\n--- QUALIFICATIONS ---");
  a.qualifications.forEach(([label, value]) => lines.push(`${label}: ${value}`));
  lines.push(`Additional Skills: ${a.additionalSkills}`);
  lines.push("\n--- REFERENCES ---");
  a.references.forEach((r, i) => lines.push(`Ref ${i + 1}: ${r.name} | ${r.relationship} | ${r.org} | ${r.phone}`));
  lines.push("\n--- BACKGROUND CHECK ---");
  lines.push(`Prior Conviction: ${a.conviction}`);
  lines.push(`Explanation: ${a.convictionExplain}`);
  lines.push("\n--- RESUME ---");
  lines.push(`Resume: ${a.resume ? `${a.resume} (attached)` : "Not attached"}`);
  lines.push("\n--- SIGNATURE ---");
  lines.push(`Signed by: ${a.signature}  |  Date: ${a.signDate}`);
  lines.push("\n=== END OF APPLICATION ===");
  return lines.join("\n");
}

// escape user-supplied values before dropping them into the html email.
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// styled html email - inline styles + tables for broad email-client support.
function buildHtml(a) {
  const BRAND = "#14283c";
  const ACCENT = "#196e93";
  const MUTED = "#64748b";
  const LINE = "#e2e8f0";
  const dash = `<span style="color:#a8b3c0">—</span>`;
  const val = (x) => (x && x !== "—" ? esc(x) : dash);
  const mail = (e) =>
    e && e !== "—"
      ? `<a href="mailto:${esc(e)}" style="color:${ACCENT};text-decoration:none;">${esc(e)}</a>`
      : dash;

  const row = (label, value) =>
    `<tr><td style="padding:5px 14px 5px 0;color:${MUTED};font-size:13px;vertical-align:top;width:170px;">${esc(label)}</td><td style="padding:5px 0;font-size:14px;color:#1c1c1c;vertical-align:top;">${value}</td></tr>`;

  const section = (title, inner) =>
    `<tr><td style="padding:24px 28px 0;"><div style="font-size:12px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;color:${ACCENT};border-bottom:2px solid ${LINE};padding-bottom:8px;margin-bottom:10px;">${esc(title)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;">${inner}</table></td></tr>`;

  const employerBlocks = a.employers
    .map((e, i) => {
      const empty = [e.name, e.title, e.supervisor, e.phone, e.from, e.to, e.reason, e.duties].every((x) => x === "—");
      if (empty) return "";
      return `<tr><td style="padding-top:${i === 0 ? 0 : 10}px;"><div style="background:#f7f9fb;border:1px solid ${LINE};border-radius:8px;padding:12px 14px;"><div style="font-size:12px;font-weight:bold;color:${BRAND};margin-bottom:6px;">Employer ${i + 1}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${row("Company", val(e.name))}${row("Title", val(e.title))}${row("Supervisor", val(e.supervisor))}${row("Phone", val(e.phone))}${row("Dates", `${val(e.from)} – ${val(e.to)}`)}${row("Reason for leaving", val(e.reason))}${row("Duties", val(e.duties))}</table></div></td></tr>`;
    })
    .join("");
  const employersInner = a.expOnResume
    ? `<tr><td style="font-size:14px;color:#1c1c1c;"><strong>Provided in the attached resume.</strong></td></tr>`
    : employerBlocks || `<tr><td style="font-size:14px;">${dash}</td></tr>`;

  const refBlocks = a.references
    .map((r) => {
      const empty = [r.name, r.relationship, r.org, r.phone].every((x) => x === "—");
      if (empty) return "";
      return `<tr><td style="padding:4px 0;font-size:14px;color:#1c1c1c;"><strong>${val(r.name)}:</strong> <span style="color:${MUTED};">${val(r.relationship)}, ${val(r.org)} · ${val(r.phone)}</span></td></tr>`;
    })
    .join("");
  const refsInner = refBlocks || `<tr><td style="font-size:14px;">${dash}</td></tr>`;

  const quals = a.qualifications
    .map(([label, value]) => {
      const yes = value === "Yes";
      const no = value === "No";
      const color = yes ? "#16794c" : no ? "#9b2c2c" : MUTED;
      const bg = yes ? "#e7f6ee" : no ? "#fdeaea" : "#eef2f5";
      const badge = `<span style="display:inline-block;padding:1px 9px;border-radius:999px;font-size:12px;font-weight:bold;color:${color};background:${bg};">${esc(value)}</span>`;
      return row(label, badge);
    })
    .join("");

  const resumeBadge = a.resume
    ? `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:bold;color:#16794c;background:#e7f6ee;">Attached · ${esc(a.resume)}</span>`
    : `<span style="color:${MUTED};font-size:13px;">No resume attached</span>`;

  return `<!doctype html><html><body style="margin:0;background:#eef2f5;padding:24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${LINE};font-family:Arial,Helvetica,sans-serif;">
  <tr><td style="background:${BRAND};padding:24px 28px;">
    <div style="color:#9fc3d8;font-size:12px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;">New job application</div>
    <div style="color:#ffffff;font-size:22px;font-weight:bold;margin-top:4px;">${esc(a.name)}</div>
    <div style="color:#cde0ec;font-size:14px;margin-top:4px;">${val(a.positions)}</div>
  </td></tr>

  <tr><td style="padding:20px 28px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fb;border:1px solid ${LINE};border-radius:8px;"><tr><td style="padding:14px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${row("Email", mail(a.email))}
        ${row("Primary phone", val(a.phonePrimary))}
        ${row("Resume", resumeBadge)}
      </table>
    </td></tr></table>
  </td></tr>

  ${section("Position & availability", row("Position(s)", val(a.positions)) + row("Application date", val(a.appDate)) + row("Available start", val(a.startDate)) + row("Employment type", val(a.empType)) + row("Shifts", val(a.shifts)) + row("Desired pay", val(a.pay)) + row("Hours / week", val(a.hours)))}

  ${section("Personal information", row("Name", val(a.name)) + row("Address", val(a.address)) + row("Primary phone", val(a.phonePrimary)) + row("Secondary phone", val(a.phoneSecondary)) + row("Email", mail(a.email)))}

  ${section("Referral", row("Referred by an employee?", val(a.referral)) + row("Referrer name", val(a.referralName)))}

  ${section("Education & certifications", row("Education", val(a.education)) + row("Field of study", val(a.fieldOfStudy)) + row("School", val(a.school)) + row("Certifications", val(a.certs)))}

  ${section("Qualifications", quals + row("Additional skills", val(a.additionalSkills)))}

  ${section("Work experience", employersInner)}

  ${section("References", refsInner)}

  ${section("Background check", row("Prior conviction", val(a.conviction)) + row("Explanation", val(a.convictionExplain)))}

  ${section("Certification & signature", row("Signed by", val(a.signature)) + row("Date", val(a.signDate)))}

  <tr><td style="padding:24px 28px 28px;">
    <div style="border-top:1px solid ${LINE};padding-top:14px;font-size:12px;color:${MUTED};line-height:1.5;">
      Reply to this email to respond directly to ${esc(a.name)}.<br>Submitted through the My Life Services website.
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
