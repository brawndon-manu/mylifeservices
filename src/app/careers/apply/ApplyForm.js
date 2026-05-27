"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import emailjs from "@emailjs/browser";

// EmailJS credentials — public-key model, safe to commit per EmailJS docs.
// Remember to enforce allowed-domains in the EmailJS dashboard before launch.
const EMAILJS_PUBLIC_KEY = "yu_iQHPcq3JegCHEA";
const EMAILJS_SERVICE_ID = "service_g9l4ocj";
const EMAILJS_TEMPLATE_ID = "template_rnnyp59";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

// Positions map: slug used in the ?program= query param ↔ form input name ↔ display label
const POSITIONS = [
  { slug: "independent-living", name: "pos_ils", label: "Independent Living Staff" },
  { slug: "day-program", name: "pos_dps", label: "Day Program Staff" },
  { slug: "supported-living", name: "pos_sls", label: "Supported Living Staff" },
  { slug: "self-determination", name: "pos_sds", label: "Self-Determination Staff" },
  { slug: "crisis-support", name: "pos_css", label: "Crisis Support Staff" },
];

const EMPLOYMENT_TYPES = [
  { name: "avail_ft", label: "Full-Time" },
  { name: "avail_pt", label: "Part-Time" },
  { name: "avail_oc", label: "Per Diem / On-Call" },
];

const SHIFTS = [
  { name: "shift_am", label: "Morning (6am–2pm)" },
  { name: "shift_pm", label: "Afternoon (2pm–10pm)" },
  { name: "shift_on", label: "Overnight (10pm–6am)" },
  { name: "shift_we", label: "Weekends" },
];

const CERTIFICATIONS = [
  { name: "cert_cpr", label: "CPR / First Aid" },
  { name: "cert_cna", label: "CNA" },
  { name: "cert_dsp", label: "DSP Certificate" },
  { name: "cert_med", label: "Medication Administration" },
  { name: "cert_medi", label: "Medi-Cal Billing" },
];

const QUESTIONS = [
  { name: "q_disability", label: "Experience supporting individuals with disabilities?" },
  { name: "q_bsp", label: "Experience with behavioral support plans?" },
  { name: "q_bilingual", label: "Bilingual?" },
  { name: "q_license", label: "Valid California Driver’s License?" },
  { name: "q_vehicle", label: "Reliable personal vehicle?" },
  { name: "q_insurance", label: "Current auto insurance?" },
  { name: "q_transport", label: "Willing to provide transportation to clients?" },
  { name: "q_dsp", label: "Received any DSP training?" },
];

export default function ApplyForm() {
  const searchParams = useSearchParams();
  const preselectedSlug = searchParams.get("program");
  const [resumeFileName, setResumeFileName] = useState("");
  const [status, setStatus] = useState({ state: "idle", message: "" });
  const fileInputRef = useRef(null);

  useEffect(() => {
    emailjs.init(EMAILJS_PUBLIC_KEY);
  }, []);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) {
      setResumeFileName("");
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      alert("That file is over 5MB. Please choose a smaller file.");
      e.target.value = "";
      setResumeFileName("");
      return;
    }
    setResumeFileName(file.name);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    const firstName = (data.get("first_name") || "").toString().trim();
    const lastName = (data.get("last_name") || "").toString().trim();
    const positionLabels = POSITIONS
      .filter((p) => data.get(p.name))
      .map((p) => p.label);
    const positionsField = positionLabels.length
      ? positionLabels.join(", ")
      : "None selected";

    const messageBody = buildMessage(data, resumeFileName);

    setStatus({ state: "submitting", message: "" });

    try {
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        applicant_name: `${firstName} ${lastName}`.trim(),
        position: positionsField,
        message: messageBody,
      });
      setStatus({
        state: "success",
        message: `Thank you, ${firstName}! Your application has been received. Our team will be in touch soon.`,
      });
      form.reset();
      setResumeFileName("");
      // Bring the confirmation into view in case the form was long.
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("EmailJS error:", err);
      setStatus({
        state: "error",
        message:
          "Something went wrong while submitting. Please try again, or call us at (909) 837-0907.",
      });
    }
  }

  if (status.state === "success") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
        <h2 className="text-2xl font-semibold text-emerald-900">
          Application received
        </h2>
        <p className="mt-3 text-base text-emerald-900">{status.message}</p>
        <p className="mt-4 text-sm text-emerald-900/80">
          We&apos;ll follow up by email if a resume attachment is needed.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-12" noValidate>
      {/* --- Position Applied For --- */}
      <section>
        <SectionHeading>Position applied for</SectionHeading>
        <p className="mb-4 text-sm font-medium text-slate-700">
          Select all that apply:
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {POSITIONS.map((p) => (
            <Checkbox
              key={p.slug}
              name={p.name}
              value={p.label}
              label={p.label}
              defaultChecked={preselectedSlug === p.slug}
            />
          ))}
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Application date" name="app_date" type="date" />
          <Field label="Available start date" name="start_date" type="date" />
        </div>
      </section>

      {/* --- Personal Information --- */}
      <section>
        <SectionHeading>Personal information</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" name="first_name" required />
          <Field label="Last name" name="last_name" required />
        </div>
        <div className="mt-4">
          <Field label="Street address" name="address" />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_120px_140px]">
          <Field label="City" name="city" />
          <Field label="State" name="state" maxLength={2} placeholder="CA" />
          <Field label="Zip code" name="zip" maxLength={10} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Primary phone" name="phone_primary" type="tel" required />
          <Field label="Secondary phone" name="phone_secondary" type="tel" />
        </div>
        <div className="mt-4">
          <Field label="Email address" name="email" type="email" required />
        </div>
      </section>

      {/* --- Availability --- */}
      <section>
        <SectionHeading>Availability</SectionHeading>
        <p className="mb-3 text-sm font-medium text-slate-700">Employment type:</p>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {EMPLOYMENT_TYPES.map((t) => (
            <Checkbox key={t.name} name={t.name} value={t.label} label={t.label} />
          ))}
        </div>
        <p className="mt-6 mb-3 text-sm font-medium text-slate-700">
          Shift availability (check all that apply):
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {SHIFTS.map((s) => (
            <Checkbox key={s.name} name={s.name} value={s.label} label={s.label} />
          ))}
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Desired pay rate" name="pay_rate" placeholder="e.g. $18/hr" />
          <Field label="Hours available per week" name="hours_week" placeholder="e.g. 32" />
        </div>
      </section>

      {/* --- Education & Certifications --- */}
      <section>
        <SectionHeading>Education & certifications</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Highest level of education" name="education">
            <option value="">— Select —</option>
            <option>High School / GED</option>
            <option>Some College</option>
            <option>Associate&apos;s Degree</option>
            <option>Bachelor&apos;s Degree</option>
            <option>Master&apos;s Degree or Higher</option>
            <option>Vocational / Trade School</option>
          </Select>
          <Field label="Field of study" name="field_of_study" />
        </div>
        <div className="mt-4">
          <Field label="School / institution" name="school" />
        </div>
        <p className="mt-6 mb-3 text-sm font-medium text-slate-700">
          Certifications / licenses (check all that apply):
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {CERTIFICATIONS.map((c) => (
            <Checkbox key={c.name} name={c.name} value={c.label} label={c.label} />
          ))}
        </div>
      </section>

      {/* --- Work Experience --- */}
      <section>
        <SectionHeading>Work experience</SectionHeading>
        <p className="mb-4 text-xs text-slate-500">
          List most recent employer first.
        </p>
        <div className="space-y-5">
          {[1, 2, 3].map((i) => (
            <EmployerBlock key={i} index={i} />
          ))}
        </div>
      </section>

      {/* --- Qualifications --- */}
      <section>
        <SectionHeading>Qualifications & skills</SectionHeading>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 sm:px-5">
          {QUESTIONS.map((q) => (
            <YesNoRow key={q.name} name={q.name} label={q.label} />
          ))}
        </div>
        <div className="mt-5">
          <TextArea
            label="Additional skills or qualifications"
            name="additional_skills"
            rows={3}
          />
        </div>
      </section>

      {/* --- References --- */}
      <section>
        <SectionHeading>Professional references</SectionHeading>
        <p className="mb-4 text-xs text-slate-500">
          Please provide three professional references (not family members).
        </p>
        <div className="space-y-5">
          {[1, 2, 3].map((i) => (
            <ReferenceBlock key={i} index={i} />
          ))}
        </div>
      </section>

      {/* --- Background Check --- */}
      <section>
        <SectionHeading>Background check</SectionHeading>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 sm:px-5">
          <YesNoRow
            name="q_conviction"
            label="Have you ever been convicted of a felony or misdemeanor (excluding minor traffic violations)?"
          />
        </div>
        <div className="mt-5">
          <TextArea
            label="If yes, please explain"
            name="conviction_explain"
            rows={2}
          />
        </div>
      </section>

      {/* --- Resume --- */}
      <section>
        <SectionHeading>Resume</SectionHeading>
        <div
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          role="button"
          tabIndex={0}
          className="cursor-pointer rounded-lg border-2 border-dashed border-brand bg-slate-50 px-6 py-8 text-center transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <p className="text-base font-semibold text-brand-dark">
            {resumeFileName ? "Change file" : "Click to attach your resume"}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            PDF or Word document — max 5MB
          </p>
          {resumeFileName && (
            <p className="mt-3 text-sm font-medium text-slate-800">
              Selected: {resumeFileName}
            </p>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          className="sr-only"
          onChange={handleFileChange}
        />
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
          <strong>Heads up:</strong> Our form captures the resume filename only —
          the file itself is not transmitted with this submission. After you
          submit, our team will reply by email to request your resume
          attachment.
        </p>
      </section>

      {/* --- Signature --- */}
      <section>
        <SectionHeading>Certification & signature</SectionHeading>
        <p className="mb-5 text-sm leading-relaxed text-slate-700">
          I certify that all information provided in this application is true,
          correct, and complete to the best of my knowledge. I understand that
          any misrepresentation or omission of facts may result in
          disqualification from consideration or dismissal from employment. I
          authorize My Life Services to contact my former employers, references,
          and educational institutions to verify the information provided.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Full name (acts as digital signature)"
            name="signature"
            required
          />
          <Field label="Today’s date" name="sign_date" type="date" required />
        </div>
      </section>

      {/* --- Submit --- */}
      <div>
        <button
          type="submit"
          disabled={status.state === "submitting"}
          className="w-full rounded-md bg-brand-light px-6 py-3 text-base font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {status.state === "submitting" ? "Submitting…" : "Submit application"}
        </button>
        {status.state === "error" && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          >
            {status.message}
          </p>
        )}
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function SectionHeading({ children }) {
  return (
    <div className="mb-5 border-b border-slate-200 pb-3">
      <h2 className="text-sm font-bold uppercase tracking-wider text-brand-dark">
        {children}
      </h2>
    </div>
  );
}

const fieldInputClass =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

// default length caps. these are soft client-side guards - emailjs has
// its own server-side limits too. mostly here so someone pasting a 5mb
// novel into the first-name field doesnt break the form submission.
// override per-field with maxLength={...} when needed (state code = 2,
// zip = 10, etc - already done where it matters).
const FIELD_MAX_LEN = 200;
const TEXTAREA_MAX_LEN = 2000;

function Field({ label, name, type = "text", required = false, maxLength = FIELD_MAX_LEN, ...rest }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        maxLength={maxLength}
        className={fieldInputClass}
        {...rest}
      />
    </label>
  );
}

function TextArea({ label, name, rows = 3, required = false, maxLength = TEXTAREA_MAX_LEN, ...rest }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </span>
      <textarea
        name={name}
        rows={rows}
        required={required}
        maxLength={maxLength}
        className={`${fieldInputClass} resize-y`}
        {...rest}
      />
    </label>
  );
}

function Select({ label, name, children, required = false }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </span>
      <select name={name} required={required} className={fieldInputClass}>
        {children}
      </select>
    </label>
  );
}

function Checkbox({ name, value, label, defaultChecked = false }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-800">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="h-4 w-4 accent-brand"
      />
      <span>{label}</span>
    </label>
  );
}

function YesNoRow({ name, label }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 py-3 last:border-b-0">
      <span className="flex-1 text-sm text-slate-800">{label}</span>
      <div className="flex gap-4">
        <label className="flex items-center gap-1.5 text-sm text-slate-800">
          <input
            type="radio"
            name={name}
            value="Yes"
            className="h-4 w-4 accent-brand"
          />
          Yes
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-800">
          <input
            type="radio"
            name={name}
            value="No"
            className="h-4 w-4 accent-brand"
          />
          No
        </label>
      </div>
    </div>
  );
}

function EmployerBlock({ index }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-5">
      <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-brand-dark">
        Employer {index}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Employer name" name={`emp${index}_name`} />
        <Field label="Phone" name={`emp${index}_phone`} type="tel" />
        <Field label="Job title" name={`emp${index}_title`} />
        <Field label="Supervisor" name={`emp${index}_supervisor`} />
        <Field label="From" name={`emp${index}_from`} type="month" />
        <Field label="To" name={`emp${index}_to`} type="month" />
      </div>
      <div className="mt-4">
        <Field label="Reason for leaving" name={`emp${index}_reason`} />
      </div>
      <div className="mt-4">
        <TextArea
          label="Responsibilities"
          name={`emp${index}_duties`}
          rows={2}
        />
      </div>
    </div>
  );
}

function ReferenceBlock({ index }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-5">
      <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-brand-dark">
        Reference {index}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name={`ref${index}_name`} />
        <Field label="Relationship" name={`ref${index}_relationship`} />
        <Field label="Organization" name={`ref${index}_org`} />
        <Field label="Phone" name={`ref${index}_phone`} type="tel" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Email body builder                                                        */
/* -------------------------------------------------------------------------- */

function buildMessage(data, resumeFileName) {
  const v = (name) => {
    const value = data.get(name);
    if (value === null || value === undefined) return "—";
    const s = value.toString().trim();
    return s || "—";
  };
  const checkedAny = (names) => {
    const vals = [];
    for (const n of names) {
      const val = data.get(n);
      if (val) vals.push(val);
    }
    return vals.length ? vals.join(", ") : "None selected";
  };

  const positions = checkedAny(POSITIONS.map((p) => p.name));
  const empTypes = checkedAny(EMPLOYMENT_TYPES.map((t) => t.name));
  const shifts = checkedAny(SHIFTS.map((s) => s.name));
  const certs = checkedAny(CERTIFICATIONS.map((c) => c.name));

  const lines = [];
  lines.push("=== MY LIFE SERVICES – EMPLOYMENT APPLICATION ===\n");
  lines.push("POSITION(S) APPLIED FOR: " + positions);
  lines.push(`Application Date: ${v("app_date")}  |  Available Start Date: ${v("start_date")}`);

  lines.push("\n--- PERSONAL INFORMATION ---");
  lines.push(`Name: ${v("first_name")} ${v("last_name")}`);
  lines.push(`Address: ${v("address")}, ${v("city")}, ${v("state")} ${v("zip")}`);
  lines.push(`Primary Phone: ${v("phone_primary")}  |  Secondary: ${v("phone_secondary")}`);
  lines.push(`Email: ${v("email")}`);

  lines.push("\n--- AVAILABILITY ---");
  lines.push(`Employment Type: ${empTypes}`);
  lines.push(`Shifts: ${shifts}`);
  lines.push(`Desired Pay: ${v("pay_rate")}  |  Hours/Week: ${v("hours_week")}`);

  lines.push("\n--- EDUCATION ---");
  lines.push(`Education: ${v("education")}`);
  lines.push(`Field of Study: ${v("field_of_study")}  |  School: ${v("school")}`);
  lines.push(`Certifications: ${certs}`);

  lines.push("\n--- WORK EXPERIENCE ---");
  for (let i = 1; i <= 3; i++) {
    lines.push(
      `Employer ${i}: ${v(`emp${i}_name`)} | Title: ${v(`emp${i}_title`)} | Supervisor: ${v(`emp${i}_supervisor`)} | Phone: ${v(`emp${i}_phone`)}`,
    );
    lines.push(
      `  Dates: ${v(`emp${i}_from`)} to ${v(`emp${i}_to`)} | Reason for Leaving: ${v(`emp${i}_reason`)}`,
    );
    lines.push(`  Duties: ${v(`emp${i}_duties`)}`);
  }

  lines.push("\n--- QUALIFICATIONS ---");
  lines.push(
    `Disability experience: ${v("q_disability")}  |  BSP experience: ${v("q_bsp")}  |  Bilingual: ${v("q_bilingual")}`,
  );
  lines.push(
    `CA Driver's License: ${v("q_license")}  |  Vehicle: ${v("q_vehicle")}  |  Auto Insurance: ${v("q_insurance")}`,
  );
  lines.push(
    `Willing to transport clients: ${v("q_transport")}  |  DSP Training: ${v("q_dsp")}`,
  );
  lines.push(`Additional Skills: ${v("additional_skills")}`);

  lines.push("\n--- REFERENCES ---");
  for (let i = 1; i <= 3; i++) {
    lines.push(
      `Ref ${i}: ${v(`ref${i}_name`)} | ${v(`ref${i}_relationship`)} | ${v(`ref${i}_org`)} | ${v(`ref${i}_phone`)}`,
    );
  }

  lines.push("\n--- BACKGROUND CHECK ---");
  lines.push(`Prior Conviction: ${v("q_conviction")}`);
  lines.push(`Explanation: ${v("conviction_explain")}`);

  lines.push("\n--- RESUME ---");
  lines.push(`Resume File: ${resumeFileName || "Not attached"}`);

  lines.push("\n--- SIGNATURE ---");
  lines.push(`Signed by: ${v("signature")}  |  Date: ${v("sign_date")}`);

  lines.push("\n=== END OF APPLICATION ===");
  return lines.join("\n");
}
