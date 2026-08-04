import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { anomalyLabel, ANOMALY_KINDS } from "@/lib/timesheet/anomalies";
import BackLink from "@/components/BackLink";

export const metadata = { title: "Data checks", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const f2 = (n) => (n == null ? "-" : (Math.round(n * 100) / 100).toFixed(2));

const FLAG_COPY = {
  mismatch: "Hours don't match the schedule",
  "not-on-schedule": "Worked, but nothing on the schedule",
  "missing-from-timesheet": "On the schedule, but no punches",
};

export default async function ChecksPage({ params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const { id } = await params;
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    include: {
      timesheets: {
        orderBy: { sourceName: "asc" },
        include: {
          user: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
        },
      },
    },
  });
  if (!batch) notFound();

  const rows = [];
  let anySchedule = false;
  for (const t of batch.timesheets) {
    const punches = t.data?.punchIssues || [];
    const sched = t.data?.scheduleCheck || { matched: false };
    if (sched.matched) anySchedule = true;
    const flagged = sched.flagged || [];
    if (!punches.length && !flagged.length) continue;
    rows.push({
      id: t.id,
      who: t.user ? preferredName(t.user) : t.sourceName,
      hours: t.paidHours,
      punches,
      flagged,
      scheduleTotal: sched.scheduleTotal ?? null,
      timesheetTotal: sched.timesheetTotal ?? null,
    });
  }

  // biggest disagreement first - that's the order you'd work them in
  const worstOf = (r) =>
    Math.max(
      ...r.flagged.map((f) => Math.abs(f.diff ?? 99)),
      ...r.punches.map((p) => {
        const now = p.hoursNow || 0;
        const then = p.suggestion ? p.suggestion.hours : now;
        return Math.abs(now - then);
      }),
      0,
    );
  rows.sort((a, b) => worstOf(b) - worstOf(a));

  const totalPunch = rows.reduce((n, r) => n + r.punches.length, 0);
  const totalSched = rows.reduce((n, r) => n + r.flagged.length, 0);

  return (
    <section className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
      <BackLink href={`/portal/admin/timesheets/${batch.id}`}>Back to the batch</BackLink>

      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Data checks
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {batch.periodFrom} to {batch.periodTo}
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Nothing here has changed a figure. These are days where the punch record
        contradicts itself, or where the timesheet and the schedule disagree. The
        engine reproduces what QSP exported to the hundredth of an hour, so
        anything on this page is a problem in the source data, not the arithmetic.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Staff affected" value={rows.length} of={batch.timesheets.length} />
        <Stat label="Punch entries that can't be right" value={totalPunch} tone="warn" />
        <Stat
          label="Days disagreeing with the schedule"
          value={anySchedule ? totalSched : "-"}
          tone={anySchedule ? "warn" : undefined}
        />
      </div>

      {!anySchedule && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          No schedule export was uploaded with this batch, so the hours could only
          be checked against themselves. A punch typed into the wrong box is
          invisible that way - especially when two of them cancel out and leave a
          total that looks perfectly normal. Upload the period again with the
          Employee Schedules PDF to get the second check.
        </div>
      )}

      {rows.length === 0 ? (
        <p className="mt-10 rounded-xl border border-emerald-300/60 bg-emerald-50 p-6 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
          Nothing looks wrong in this batch. Every punch pair runs forwards, no
          stretch on the clock is impossibly long, and
          {anySchedule
            ? " every day agrees with the schedule."
            : " no schedule was provided to compare against."}
        </p>
      ) : (
        <div className="mt-8 space-y-5">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{r.who}</h2>
                  <p className="text-sm text-muted">
                    {f2(r.hours)} hrs on the corrected sheet
                    {r.scheduleTotal != null && (
                      <>
                        {" · "}schedule has {f2(r.scheduleTotal)} for the same days
                      </>
                    )}
                  </p>
                </div>
                <a
                  href={`/portal/admin/timesheets/sheet/${r.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-brand hover:text-brand-dark"
                >
                  Open their sheet →
                </a>
              </div>

              {r.flagged.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Against the schedule
                  </p>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead className="text-xs uppercase tracking-wider text-faint">
                        <tr>
                          <th className="py-1 text-left font-semibold">Day</th>
                          <th className="py-1 text-right font-semibold">Timesheet</th>
                          <th className="py-1 text-right font-semibold">Schedule</th>
                          <th className="py-1 text-right font-semibold">Difference</th>
                          <th className="py-1 pl-4 text-left font-semibold">What it means</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.flagged.map((f, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="py-1.5 text-foreground">{f.date}</td>
                            <td className="py-1.5 text-right tabular-nums text-foreground">{f2(f.timesheet)}</td>
                            <td className="py-1.5 text-right tabular-nums text-foreground">{f2(f.schedule)}</td>
                            <td className="py-1.5 text-right tabular-nums font-semibold text-rose-600 dark:text-rose-400">
                              {f.diff == null ? "-" : `${f.diff > 0 ? "+" : ""}${f2(f.diff)}`}
                            </td>
                            <td className="py-1.5 pl-4 text-xs text-muted">{FLAG_COPY[f.flag] || f.flag}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {r.punches.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Punch entries that can&apos;t be right
                  </p>
                  <ul className="mt-2 space-y-3">
                    {r.punches.map((p, i) => (
                      <li key={i} className="rounded-lg border border-amber-300/60 bg-amber-50/40 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                        <p className="text-sm font-semibold text-foreground">
                          {p.date} · reads {f2(p.hoursNow)} hrs
                        </p>
                        {p.anomalies.map((a, j) => (
                          <p key={j} className="mt-1 text-xs text-muted">
                            <span className="font-semibold text-foreground">{anomalyLabel(a.kind)}:</span>{" "}
                            {a.shown} - {a.note}
                            <span className="block italic">{ANOMALY_KINDS[a.kind]?.why}</span>
                          </p>
                        ))}
                        <p className="mt-2 font-mono text-xs text-muted">
                          QSP has: {p.shownPunches.join("  ")}
                        </p>
                        {p.suggestion ? (
                          <>
                            <p className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
                              Likely: {p.suggestion.punches.join("  ")}
                            </p>
                            <p className="mt-1 text-xs text-foreground">
                              That would make the day{" "}
                              <span className="font-semibold">{f2(p.suggestion.hours)} hrs</span>{" "}
                              instead of {f2(p.hoursNow)} ({p.suggestion.applied.join("; ")}).
                            </p>
                          </>
                        ) : (
                          <p className="mt-2 text-xs font-semibold text-rose-700 dark:text-rose-400">
                            No safe reading of these punches - this one needs working
                            out by hand.
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 rounded-lg border border-border bg-surface-2 p-4 text-sm text-muted">
        <p className="font-semibold text-foreground">Fixing these</p>
        <p className="mt-1">
          Correct the entries in QSP, then upload the period again. Nothing on
          this page edits QSP, and nothing here is applied to the figures on its
          own - a suggestion is only ever shown next to what QSP actually holds.
        </p>
        <p className="mt-2">
          <Link
            href={`/portal/admin/timesheets/${batch.id}/corrections`}
            className="font-semibold text-brand underline underline-offset-4"
          >
            Problems reported by staff
          </Link>{" "}
          are tracked separately.
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value, of, tone }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          tone === "warn" && value !== 0 && value !== "-"
            ? "text-rose-600 dark:text-rose-400"
            : "text-foreground"
        }`}
      >
        {value}
        {of != null && <span className="text-base font-normal text-muted"> of {of}</span>}
      </p>
    </div>
  );
}
