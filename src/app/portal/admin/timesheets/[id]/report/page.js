import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import BackLink from "@/components/BackLink";

export const metadata = { title: "Payout report", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const fmt = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);

export default async function PayoutReportPage({ params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const { id } = await params;
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    include: {
      timesheets: {
        orderBy: { sourceName: "asc" },
        include: {
          user: {
            select: { name: true, preferredFirstName: true, preferredLastName: true },
          },
          corrections: { where: { status: "open" }, select: { id: true } },
        },
      },
    },
  });
  if (!batch) notFound();

  const rows = batch.timesheets.map((t) => ({
    id: t.id,
    who: t.user ? preferredName(t.user) : t.sourceName,
    sourceName: t.sourceName,
    matched: !!t.userId,
    regularHours: t.regularHours,
    otHours: t.otHours,
    doubleHours: t.doubleHours,
    paidHours: t.paidHours,
    premiumHours: t.premiumHours,
    payable: (t.paidHours || 0) + (t.premiumHours || 0),
    partialWeek: t.partialWeek,
    signedAt: t.signedAt,
    approvedAt: t.approvedAt,
    disputed: t.corrections.length > 0,
    recomputed: !!t.recomputedAt,
  }));

  const sum = (k) => rows.reduce((n, r) => n + (r[k] || 0), 0);
  const totals = {
    regularHours: sum("regularHours"),
    otHours: sum("otHours"),
    doubleHours: sum("doubleHours"),
    paidHours: sum("paidHours"),
    premiumHours: sum("premiumHours"),
    payable: sum("payable"),
  };

  const disputed = rows.filter((r) => r.disputed).length;
  const unmatched = rows.filter((r) => !r.matched).length;
  const partial = rows.filter((r) => r.partialWeek).length;

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink href={`/portal/admin/timesheets/${batch.id}`}>Back to the batch</BackLink>
        <span className="flex flex-wrap items-center gap-2">
          <a
            href={`/portal/admin/timesheets/${batch.id}/report/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-brand bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand transition hover:bg-brand/20"
          >
            Download PDF
          </a>
          <a
            href={`/portal/admin/timesheets/${batch.id}/report/csv`}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            Download CSV
          </a>
        </span>
      </div>

      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Payout report
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {batch.periodFrom} to {batch.periodTo}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        What this pay period owes, per person and in total. This is the figures
        only - the signed timesheets are a separate record and download
        separately from the batch.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Big label="Hours worked" value={fmt(totals.paidHours)} />
        <Big label="Premium hours" value={fmt(totals.premiumHours)} tone="prem" />
        <Big label="Total hours payable" value={fmt(totals.payable)} strong />
      </div>

      {(disputed > 0 || unmatched > 0 || partial > 0) && (
        <div className="mt-4 space-y-2">
          {disputed > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <strong>{disputed}</strong>{" "}
              {disputed === 1 ? "person has" : "people have"} reported a problem
              that hasn&apos;t been resolved. Those figures are likely to change.{" "}
              <Link
                href={`/portal/admin/timesheets/${batch.id}/corrections`}
                className="font-semibold underline underline-offset-4"
              >
                Review them
              </Link>
              .
            </div>
          )}
          {unmatched > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <strong>{unmatched}</strong> row
              {unmatched === 1 ? " is" : "s are"} not matched to an account. They
              are counted in the totals but named only as QSP printed them.
            </div>
          )}
          {partial > 0 && (
            <div className="rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
              <strong>{partial}</strong> sheet{partial === 1 ? "" : "s"} include a
              workweek cut off by the pay-period boundary, so the overtime on
              those weeks is provisional until the neighbouring period is known.
            </div>
          )}
        </div>
      )}

      <div className="mt-8 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted">
            <tr>
              <Th align="left">Employee</Th>
              <Th>Regular</Th>
              <Th>OT</Th>
              <Th>Double</Th>
              <Th>Hours worked</Th>
              <Th>Premium</Th>
              <Th>Total payable</Th>
              <Th align="left">Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 text-foreground">
                  {r.who}
                  {!r.matched && (
                    <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
                      unmatched
                    </span>
                  )}
                  {r.partialWeek && (
                    <span className="ml-2 text-xs text-muted">partial week</span>
                  )}
                </td>
                <Td>{fmt(r.regularHours)}</Td>
                <Td>{fmt(r.otHours)}</Td>
                <Td>{fmt(r.doubleHours)}</Td>
                <Td strong>{fmt(r.paidHours)}</Td>
                <Td tone={r.premiumHours > 0 ? "prem" : undefined}>
                  {fmt(r.premiumHours)}
                </Td>
                <Td strong>{fmt(r.payable)}</Td>
                <td className="px-3 py-2 text-xs text-muted">
                  {r.disputed
                    ? "Reported a problem"
                    : r.approvedAt
                      ? "Approved"
                      : r.signedAt
                        ? "Signed"
                        : "Not signed"}
                  {r.recomputed && " · corrected"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-border-strong bg-surface-2 font-semibold">
            <tr>
              <td className="px-3 py-3 text-foreground">
                {rows.length} employee{rows.length === 1 ? "" : "s"}
              </td>
              <Td>{fmt(totals.regularHours)}</Td>
              <Td>{fmt(totals.otHours)}</Td>
              <Td>{fmt(totals.doubleHours)}</Td>
              <Td strong>{fmt(totals.paidHours)}</Td>
              <Td tone="prem">{fmt(totals.premiumHours)}</Td>
              <Td strong>{fmt(totals.payable)}</Td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function Th({ children, align }) {
  return (
    <th className={`px-3 py-2 font-semibold ${align === "left" ? "text-left" : "text-right"}`}>
      {children}
    </th>
  );
}

function Td({ children, strong, tone }) {
  return (
    <td
      className={`px-3 py-2 text-right tabular-nums ${
        tone === "prem" ? "text-rose-600 dark:text-rose-400" : "text-foreground"
      } ${strong ? "font-semibold" : ""}`}
    >
      {children}
    </td>
  );
}

function Big({ label, value, tone, strong }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          tone === "prem" ? "text-rose-600 dark:text-rose-400" : "text-foreground"
        } ${strong ? "text-3xl" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
