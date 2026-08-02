import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { sendModeSummary } from "@/lib/timesheet-send";
import BackLink from "@/components/BackLink";
import SendModeBanner from "../_components/SendModeBanner";
import ReviewTable from "../_components/ReviewTable";
import SendPanel from "../_components/SendPanel";
import { assignTimesheet, clearTimesheetAssignment, sendTimesheets } from "../actions";

export const metadata = { title: "Timesheet batch", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function TimesheetBatchPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    include: {
      timesheets: {
        orderBy: { sourceName: "asc" },
        include: {
          user: {
            select: {
              id: true, email: true, name: true,
              preferredFirstName: true, preferredLastName: true, title: true, image: true,
            },
          },
        },
      },
    },
  });
  if (!batch) notFound();

  const staff = await prisma.user.findMany({
    where: { deactivatedAt: null },
    select: { id: true, name: true, preferredFirstName: true, preferredLastName: true, title: true, image: true, email: true },
    orderBy: [{ preferredFirstName: "asc" }, { name: "asc" }],
  });
  const candidates = staff.map((u) => ({
    id: u.id,
    displayName: preferredName(u),
    title: u.title || "",
    image: u.image || null,
    email: u.email,
  }));

  const rows = batch.timesheets.map((t) => ({
    id: t.id,
    sourceName: t.sourceName,
    matchMethod: t.matchMethod,
    confidence: t.data?.confidence ?? null,
    suggestions: (t.data?.suggestions || []).map((s) => ({
      ...candidates.find((c) => c.id === s.id),
      confidence: s.confidence,
    })).filter((s) => s.id),
    user: t.user
      ? { id: t.user.id, displayName: preferredName(t.user), email: t.user.email, image: t.user.image }
      : null,
    rawHours: t.rawHours,
    paidHours: t.paidHours,
    otHours: t.otHours,
    doubleHours: t.doubleHours,
    premiumHours: t.premiumHours,
    partialWeek: t.partialWeek,
    hasPdf: !!t.pdfUrl,
    sentAt: t.sentAt ? t.sentAt.toISOString() : null,
    sentToEmail: t.sentToEmail,
    intendedEmail: t.intendedEmail,
    signedAt: t.signedAt ? t.signedAt.toISOString() : null,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
  }));

  const total = rows.length;
  const matched = rows.filter((r) => r.user).length;
  const unmatched = total - matched;
  const sent = rows.filter((r) => r.sentAt).length;
  const signed = rows.filter((r) => r.signedAt).length;
  const readyToSend = rows.filter((r) => r.user && r.hasPdf && !r.sentAt).length;
  const missingPdf = rows.filter((r) => !r.hasPdf).length;
  const mode = sendModeSummary();

  const sentCount = sp?.sent ? Number(sp.sent) : null;
  const failedCount = sp?.failed ? Number(sp.failed) : null;

  return (
    <section className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink href="/portal/admin/timesheets">Back to Timesheets</BackLink>
        {signed > 0 && (
          <Link
            href={`/portal/admin/timesheets/${batch.id}/download`}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            Download all signed ({signed}) →
          </Link>
        )}
      </div>

      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">Pay period</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {batch.periodFrom} to {batch.periodTo}
      </h1>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Stat label="employees" value={total} />
        <Stat label="matched" value={matched} tone={unmatched ? "warn" : "ok"} />
        <Stat label="sent" value={sent} />
        <Stat label="signed" value={signed} tone={signed === total && total > 0 ? "ok" : undefined} />
      </div>

      <SendModeBanner mode={mode} />

      {sentCount !== null && (
        <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          Sent {sentCount} timesheet{sentCount === 1 ? "" : "s"}
          {mode.live ? "" : ` (redirected to ${mode.recipients.join(", ")})`}.
          {failedCount ? ` ${failedCount} failed - check the rows below.` : ""}
        </div>
      )}

      {missingPdf > 0 && (
        <div className="mt-4 rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          <strong>{missingPdf}</strong> timesheet{missingPdf === 1 ? "" : "s"} in this
          batch {missingPdf === 1 ? "has" : "have"} no stored PDF - file storage was
          failing when it was uploaded. Those can&apos;t be sent (the link would
          404). Refresh the Blob token with{" "}
          <code className="rounded bg-rose-100 px-1 py-0.5 text-xs dark:bg-rose-900/50">
            vercel env pull .env.local
          </code>{" "}
          and upload the export again.
        </div>
      )}

      {unmatched > 0 && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>{unmatched}</strong> timesheet{unmatched === 1 ? " has" : "s have"} no
          matched employee yet. Those can&apos;t be sent until you pick who they
          belong to.
        </div>
      )}

      <SendPanel
        batchId={batch.id}
        readyToSend={readyToSend}
        alreadySent={sent}
        send={sendTimesheets}
        live={mode.live}
      />

      <ReviewTable
        rows={rows}
        candidates={candidates}
        batchId={batch.id}
        assign={assignTimesheet}
        clear={clearTimesheetAssignment}
        send={sendTimesheets}
      />
    </section>
  );
}

function Stat({ label, value, tone }) {
  const cls =
    tone === "ok"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
      : tone === "warn"
        ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
        : "border-border bg-surface text-muted";
  return (
    <span className={`rounded-md border px-2.5 py-1 ${cls}`}>
      {label} <b className="font-semibold">{value}</b>
    </span>
  );
}
