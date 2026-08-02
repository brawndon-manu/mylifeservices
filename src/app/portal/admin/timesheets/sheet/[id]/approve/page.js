import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import BackLink from "@/components/BackLink";
import ApproveSigner from "./ApproveSigner";
import { approveTimesheet } from "../../../actions";

export const metadata = { title: "Approve timesheet", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ApproveTimesheetPage({ params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const ts = await prisma.timesheet.findUnique({
    where: { id },
    include: {
      batch: { select: { id: true, periodFrom: true, periodTo: true } },
      user: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
      approvedBy: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
    },
  });
  if (!ts) notFound();

  const who = ts.user ? preferredName(ts.user) : ts.sourceName;
  const period = `${ts.batch.periodFrom} to ${ts.batch.periodTo}`;
  const backHref = `/portal/admin/timesheets/${ts.batch.id}`;

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <BackLink href={backHref}>Back to the pay period</BackLink>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Approve timesheet
      </h1>
      <p className="mt-2 text-sm text-muted">
        {who} · {period}
      </p>

      <div className="mt-5 grid gap-2 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2">
        <Fig label="Hours worked" value={ts.paidHours} strong />
        {ts.otHours > 0 && <Fig label="Overtime" value={ts.otHours} />}
        {ts.doubleHours > 0 && <Fig label="Double time" value={ts.doubleHours} />}
        {ts.premiumHours > 0 && <Fig label="Break premium owed" value={ts.premiumHours} tone="prem" />}
      </div>

      {!ts.signedAt ? (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-950/30">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
            Waiting on the employee
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200/80">
            {who} hasn&apos;t signed this yet. Management signs off after the
            employee has attested to their hours, so there&apos;s nothing to
            approve here until then.
          </p>
          <Link href={backHref} className="mt-3 inline-block text-sm font-medium text-brand hover:text-brand-dark">
            Back to the pay period →
          </Link>
        </div>
      ) : ts.approvedAt ? (
        <div className="mt-6 rounded-xl border border-emerald-300/60 bg-emerald-50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            Approved
          </p>
          <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-200/80">
            Signed off
            {ts.approvedBy ? ` by ${preferredName(ts.approvedBy)}` : ""} on{" "}
            {new Date(ts.approvedAt).toLocaleDateString("en-US", {
              month: "long", day: "numeric", year: "numeric",
            })}
            . This is the copy the batch downloads hand back.
          </p>
          <a
            href={`/portal/admin/timesheets/sheet/${ts.id}/download`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-sm font-medium text-brand hover:text-brand-dark"
          >
            Open the approved PDF →
          </a>
        </div>
      ) : (
        <>
          <p className="mt-6 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
            {who} signed this on{" "}
            {new Date(ts.signedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            . Review the hours below, then sign the approval line at the bottom.
          </p>
          <ApproveSigner
            timesheetId={ts.id}
            fileUrl={`/portal/admin/timesheets/sheet/${ts.id}/download`}
            title={`approval-${period.replace(/[^\w]+/g, "-")}`}
            submitAction={approveTimesheet}
            backHref={backHref}
          />
        </>
      )}
    </section>
  );
}

function Fig({ label, value, strong, tone }) {
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
