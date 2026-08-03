import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyTimesheetToken } from "@/lib/timesheet-token";
import { preferredName } from "@/lib/contacts";
import TimesheetSigner from "./TimesheetSigner";
import ReportProblem from "./ReportProblem";
import {
  submitSignedTimesheet,
  submitTimesheetCorrections,
} from "@/app/portal/admin/timesheets/actions";
import { correctionLabel } from "@/lib/timesheet/corrections";

// no-login page where an employee reviews and signs their own timesheet. lives
// outside /portal so proxy.js doesn't bounce it to login - the signed token IS
// the credential, and it only ever unlocks this one timesheet.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your timesheet · My Life Services",
  robots: { index: false, follow: false },
};

export default async function SignTimesheetPage({ params }) {
  const { token } = await params;
  const id = verifyTimesheetToken(token);
  if (!id) notFound();

  const ts = await prisma.timesheet.findUnique({
    where: { id },
    include: {
      batch: { select: { periodFrom: true, periodTo: true } },
      user: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
      corrections: {
        where: { status: "open" },
        select: { id: true, date: true, kind: true, note: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!ts) notFound();

  // the row exists but its PDF was never stored (storage was down at upload).
  // say so plainly - a bare 404 here looks like the link is fake and sends
  // people chasing payroll for nothing.
  if (!ts.pdfUrl) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          This timesheet isn&apos;t ready yet
        </h1>
        <p className="mt-3 text-base text-muted">
          Your link is valid, but the document didn&apos;t finish generating on our
          end. Nothing is wrong with your hours - payroll needs to re-send it.
          You can reply to the email that brought you here.
        </p>
      </section>
    );
  }

  const who = ts.user ? preferredName(ts.user) : ts.sourceName;
  const period = `${ts.batch.periodFrom} to ${ts.batch.periodTo}`;

  return (
    // wider than a reading column on purpose: the main thing on this page is a
    // dense letter-size timesheet, and squeezing it into 768px put its 7pt table
    // text at roughly 7 pixels tall.
    <section className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
        My Life Services
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Your timesheet
      </h1>
      <p className="mt-2 text-sm text-muted">
        {who} · {period}
      </p>

      <div className="mt-5 grid gap-2 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2">
        <Figure label="Hours worked" value={ts.paidHours} strong />
        {ts.otHours > 0 && <Figure label="Overtime" value={ts.otHours} />}
        {ts.doubleHours > 0 && <Figure label="Double time" value={ts.doubleHours} />}
        {ts.premiumHours > 0 && (
          <Figure label="Break premium owed" value={ts.premiumHours} tone="prem" />
        )}
      </div>

      {ts.message && (
        <div className="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm leading-relaxed text-foreground">
          {ts.message}
        </div>
      )}

      {ts.dueAt && !ts.signedAt && (
        <p className="mt-4 text-sm font-semibold text-amber-700 dark:text-amber-400">
          Please sign by{" "}
          {new Date(ts.dueAt).toLocaleDateString("en-US", {
            month: "long", day: "numeric", year: "numeric",
          })}
          .
        </p>
      )}

      {ts.signedAt ? (
        <div className="mt-6 rounded-xl border border-emerald-300/60 bg-emerald-50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            Signed - thank you.
          </p>
          <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-200/80">
            You signed this on{" "}
            {new Date(ts.signedAt).toLocaleDateString("en-US", {
              month: "long", day: "numeric", year: "numeric",
            })}
            . Payroll has your copy - nothing else to do.
          </p>
        </div>
      ) : ts.corrections.length > 0 ? (
        // they've told us something is wrong, so there's nothing to sign until
        // it's sorted. show what we have on record so they can see it landed.
        <div className="mt-6 rounded-xl border border-amber-300/60 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/30">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Payroll is looking at this one.
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200/80">
            You reported{" "}
            {ts.corrections.length === 1
              ? "a problem"
              : `${ts.corrections.length} problems`}{" "}
            on{" "}
            {new Date(ts.corrections[0].createdAt).toLocaleDateString("en-US", {
              month: "long", day: "numeric", year: "numeric",
            })}
            . Don&apos;t sign this version - once it&apos;s sorted you&apos;ll get
            a corrected timesheet to sign.
          </p>
          <ul className="mt-3 space-y-1">
            {ts.corrections.map((c) => (
              <li key={c.id} className="text-sm text-amber-800 dark:text-amber-200/80">
                <span className="font-semibold">{c.date || "This timesheet"}</span>
                {" - "}
                {correctionLabel(c.kind)}
                {c.note && <span className="block text-xs opacity-80">{c.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <TimesheetSigner
            token={token}
            fileUrl={`/t/${token}/pdf`}
            title={`timesheet-${period.replace(/[^\w]+/g, "-")}`}
            submitAction={submitSignedTimesheet}
          />
          <ReportProblem
            token={token}
            days={ts.data?.days || []}
            submitAction={submitTimesheetCorrections}
          />
        </>
      )}
    </section>
  );
}

function Figure({ label, value, strong, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-muted">{label}</span>
      <span
        className={`text-sm font-semibold ${
          tone === "prem" ? "text-rose-600 dark:text-rose-400" : "text-foreground"
        } ${strong ? "text-base" : ""}`}
      >
        {(Math.round((value || 0) * 100) / 100).toFixed(2)} hrs
      </span>
    </div>
  );
}
