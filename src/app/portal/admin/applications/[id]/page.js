import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated } from "@/lib/roles";
import BackLink from "@/components/BackLink";
import ConfirmButton from "@/components/ConfirmButton";
import PdfPreview from "@/components/PdfPreview";
import { avatarGradient } from "@/lib/applications";
import { deleteApplication } from "../actions";

export const metadata = {
  title: "Application",
  robots: { index: false, follow: false },
};

const isDash = (x) => !x || x === "—" || x === "None selected";

export default async function ApplicationDetailPage({ params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!isElevated(user?.role)) redirect("/portal");

  const app = await prisma.application.findUnique({ where: { id } });
  if (!app) notFound();

  const d = app.data || {};
  const submitted = new Date(app.createdAt).toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });
  const employers = Array.isArray(d.employers) ? d.employers : [];
  const references = Array.isArray(d.references) ? d.references : [];
  const quals = Array.isArray(d.qualifications) ? d.qualifications : [];

  const shownEmployers = employers.filter(
    (e) => !Object.values(e).every((v) => isDash(v)),
  );
  const shownRefs = references.filter(
    (r) => !Object.values(r).every((v) => isDash(v)),
  );

  const resumeRoute = `/portal/admin/applications/${app.id}/resume`;
  const isPdfResume = app.resumeName && /\.pdf$/i.test(app.resumeName);

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <BackLink href="/portal/admin/applications">Back to Applications</BackLink>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        {/* header - primary actions (Resume/Reply) live up here; Delete is
            demoted to the very bottom so a destructive click isn't next to them */}
        <div className="bg-gradient-to-br from-[#0b1020] to-[#14608a] px-6 py-6 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <span
                className={`flex h-14 w-14 flex-none items-center justify-center rounded-full bg-gradient-to-br ${avatarGradient(app.gender)} text-lg font-bold text-white ring-2 ring-white/20`}
              >
                {((app.firstName?.[0] || "") + (app.lastName?.[0] || "")).toUpperCase() || "?"}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#9fc3d8]">
                  Application · submitted {submitted}
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  {app.firstName} {app.lastName}
                </h1>
                {!isDash(d.positions) && (
                  <p className="mt-1 text-sm text-[#cde0ec]">{d.positions}</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {app.resumeName && (
                <a
                  href={resumeRoute}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-[#14608a] shadow-sm transition hover:bg-white/90"
                >
                  <DownloadIcon className="h-4 w-4" /> Resume
                </a>
              )}
              <a
                href={`mailto:${app.email}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/40 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <MailIcon className="h-4 w-4" /> Reply
              </a>
            </div>
          </div>
        </div>

        {/* quick bar - pure contact info */}
        <div className="flex flex-wrap items-start gap-x-8 gap-y-3 border-b border-border bg-surface-2 px-6 py-4 sm:px-8">
          <QuickField label="Email">
            <a href={`mailto:${app.email}`} className="text-brand-light hover:underline">
              {app.email}
            </a>
          </QuickField>
          {!isDash(d.phonePrimary) && (
            <QuickField label="Primary phone">{d.phonePrimary}</QuickField>
          )}
          {!isDash(d.startDate) && (
            <QuickField label="Available start">{d.startDate}</QuickField>
          )}
        </div>

        <Section title="Position & availability">
          <Row k="Position(s)" v={d.positions} />
          <Row k="Application date" v={d.appDate} />
          <Row k="Available start" v={d.startDate} />
          <Row k="Employment type" v={d.empType} />
          <Row k="Shifts" v={d.shifts} />
          <Row k="Desired pay" v={d.pay} />
          <Row k="Hours / week" v={d.hours} />
        </Section>

        <Section title="Personal information">
          <Row k="Name" v={d.name} />
          {!isDash(d.gender) && <Row k="Gender" v={d.gender} />}
          <Row k="Address" v={d.address} />
          <Row k="Primary phone" v={d.phonePrimary} />
          <Row k="Secondary phone" v={d.phoneSecondary} />
          <Row k="Email" v={d.email} />
        </Section>

        <Section title="Referral">
          <Row k="Referred by an employee?" v={d.referral} />
          <Row k="Referrer name" v={d.referralName} />
        </Section>

        <Section title="Education & certifications">
          <Row k="Education" v={d.education} />
          <Row k="Field of study" v={d.fieldOfStudy} />
          <Row k="School" v={d.school} />
          <Row k="Certifications" v={d.certs} />
        </Section>

        {quals.length > 0 && (
          <Section title="Qualifications">
            {quals.map(([label, value]) => (
              <Row key={label} k={label} v={<YesNo value={value} />} raw />
            ))}
            <Row k="Additional skills" v={d.additionalSkills} />
          </Section>
        )}

        <Section title="Work experience" flow>
          {d.expOnResume ? (
            <p className="text-sm text-foreground">
              Provided in the attached resume.
            </p>
          ) : shownEmployers.length === 0 ? (
            <p className="text-sm text-faint">—</p>
          ) : (
            <div className="space-y-3">
              {shownEmployers.map((e, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-surface-2 p-4"
                >
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-brand-dark">
                    Employer {i + 1}
                  </p>
                  <dl className="grid gap-y-1.5 sm:grid-cols-[170px_1fr]">
                    <Cell k="Company" v={e.name} />
                    <Cell k="Title" v={e.title} />
                    <Cell k="Supervisor" v={e.supervisor} />
                    <Cell k="Phone" v={e.phone} />
                    <Cell k="Dates" v={`${dash(e.from)} – ${dash(e.to)}`} />
                    <Cell k="Reason for leaving" v={e.reason} />
                    <Cell k="Duties" v={e.duties} />
                  </dl>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="References" flow>
          {shownRefs.length === 0 ? (
            <p className="text-sm text-faint">—</p>
          ) : (
            <ul className="space-y-2">
              {shownRefs.map((r, i) => (
                <li key={i} className="text-sm text-foreground">
                  <span className="font-medium">{dash(r.name)}</span>
                  <span className="text-muted">
                    {" "}
                    — {dash(r.relationship)}, {dash(r.org)} · {dash(r.phone)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Background & signature">
          <Row k="Prior conviction" v={<YesNo value={d.conviction} />} raw />
          {!isDash(d.convictionExplain) && (
            <Row k="Explanation" v={d.convictionExplain} />
          )}
          <Row k="Signed by" v={d.signature} />
          <Row k="Date" v={d.signDate} />
        </Section>

        {app.resumeName && (
          <Section title="Resume" flow>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-muted">{app.resumeName}</span>
              <a
                href={resumeRoute}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-brand-light hover:underline"
              >
                Open in new tab ↗
              </a>
            </div>
            {isPdfResume ? (
              <PdfPreview url={resumeRoute} />
            ) : (
              <p className="rounded-lg border border-border bg-surface-2 p-4 text-sm text-muted">
                Inline preview isn&apos;t available for Word documents. Use the{" "}
                <span className="font-medium text-foreground">Resume</span> button
                above to open or download it.
              </p>
            )}
          </Section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4 sm:px-8">
          <p className="max-w-lg text-xs text-faint">
            Emailed to the applications inbox on submit; this copy is stored for
            review. Replying goes straight to the applicant.
          </p>
          <form action={deleteApplication.bind(null, app.id)}>
            <ConfirmButton
              message="Delete this application? This removes the stored copy and its resume. This can't be undone."
              className="text-xs font-medium text-rose-600 transition hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
            >
              Delete application
            </ConfirmButton>
          </form>
        </div>
      </div>
    </section>
  );
}

function dash(x) {
  return isDash(x) ? "—" : x;
}

function QuickField({ label, children }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-foreground">{children}</div>
    </div>
  );
}

// `flow` sections hold free-form content (employer cards, reference list) instead
// of label/value Rows, so they render in a plain block, not the 2-column grid.
function Section({ title, children, flow }) {
  return (
    <div className="border-t border-border px-6 py-6 first:border-t-0 sm:px-8">
      <h2 className="mb-4 border-b border-border pb-2 text-[11px] font-semibold uppercase tracking-wider text-brand-dark">
        {title}
      </h2>
      {flow ? (
        <div>{children}</div>
      ) : (
        <dl className="grid gap-y-2.5 sm:grid-cols-[190px_1fr]">{children}</dl>
      )}
    </div>
  );
}

// a label/value pair. `raw` skips the dash treatment (for badges etc.).
function Row({ k, v, raw }) {
  const empty = !raw && isDash(v);
  return (
    <>
      <dt className="text-sm text-muted">{k}</dt>
      <dd className="text-sm text-foreground">
        {empty ? <span className="text-faint">—</span> : v}
      </dd>
    </>
  );
}

// tighter label/value used inside the employer cards.
function Cell({ k, v }) {
  return (
    <>
      <dt className="text-[13px] text-muted">{k}</dt>
      <dd className="text-[13px] text-foreground">
        {isDash(v) ? <span className="text-faint">—</span> : v}
      </dd>
    </>
  );
}

function YesNo({ value }) {
  if (value === "Yes") {
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
        Yes
      </span>
    );
  }
  if (value === "No") {
    return (
      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
        No
      </span>
    );
  }
  return isDash(value) ? (
    <span className="text-faint">—</span>
  ) : (
    <span className="text-foreground">{value}</span>
  );
}

function DownloadIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function MailIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}
