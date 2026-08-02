import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { buildBatchStats } from "@/lib/timesheet/stats";
import BackLink from "@/components/BackLink";

export const metadata = { title: "Timesheet stats", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const n2 = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);

export default async function TimesheetStatsPage({ params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    include: {
      timesheets: {
        include: {
          user: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
        },
      },
    },
  });
  if (!batch) notFound();

  const rows = batch.timesheets.map((t) => ({
    ...t,
    displayName: t.user ? preferredName(t.user) : t.sourceName,
  }));
  const s = buildBatchStats(rows);
  const t = s.totals;

  const maxDow = Math.max(1, ...s.byDow.map((d) => d.meal + d.rest));

  return (
    <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <BackLink href={`/portal/admin/timesheets/${batch.id}`}>Back to the pay period</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Pay period insights
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {batch.periodFrom} to {batch.periodTo}
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
        What the correction changed, what the company owes, and where breaks are
        being missed. Everything here is computed from the punches in the payroll
        export.
      </p>

      {/* headline numbers */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Employees" value={t.employees} sub={`${t.daysWorked} days worked`} />
        <Card
          label="Hours worked (corrected)"
          value={n2(t.paidHours)}
          sub={`${n2(t.rawHours)} as exported`}
        />
        <Card
          label="Paid rest time added back"
          value={n2(t.addedHours)}
          sub={`avg ${n2(t.avgAdded)} per person`}
          tone="good"
        />
        <Card
          label="Premium hours owed"
          value={n2(t.premiumHours)}
          sub={`${t.employeesWithPremium} of ${t.employees} affected`}
          tone="warn"
        />
      </div>

      {/* the money question */}
      <Section title="Break premiums owed" hint="California Labor Code 226.7 - one hour per missed meal period, one per missed rest break, max one of each per day.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Mini label="Meal period premiums" value={`${n2(t.mealPremiumHours)} hrs`} />
          <Mini label="Rest break premiums" value={`${n2(t.restPremiumHours)} hrs`} />
          <Mini label="Total" value={`${n2(t.premiumHours)} hrs`} strong />
        </div>

        {t.neverPunchedCount > 0 && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900/60 dark:bg-amber-950/30">
            <p className="font-semibold text-amber-900 dark:text-amber-300">
              Verify {t.neverPunchedCount} {t.neverPunchedCount === 1 ? "person" : "people"} before paying out
              ({n2(t.neverPunchedPremiumHours)} hrs,{" "}
              {Math.round((t.neverPunchedPremiumHours / (t.premiumHours || 1)) * 100)}% of the total)
            </p>
            <p className="mt-1 leading-relaxed text-amber-800 dark:text-amber-200/80">
              A break is only visible as a gap between punches, so someone who
              never clocks out for breaks looks the same as someone who never got
              one. These people show no punched break all period - worth checking
              whether it&apos;s a timekeeping habit rather than a denied break.
            </p>
            <ul className="mt-2 space-y-0.5">
              {s.neverPunched.map((a) => (
                <li key={a.id} className="text-amber-900 dark:text-amber-200">
                  {a.name} - {n2(a.premiumHours)} hrs over {a.daysWorked} days
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* where it happens */}
      <Section title="When breaks get missed" hint="Missed meal periods and rest breaks by day of the week. A spike on one day usually means a scheduling problem rather than individual choices.">
        {/* each shift can trigger at most one meal premium and one rest premium,
            so the denominator is shifts x 2 - spelled out in the header because
            "92 of 95 shifts" invites reading it as 97% when it isn't. */}
        <div className="mb-2 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-faint">
          <span className="w-20 flex-none">Day</span>
          <span className="flex-1" />
          <span className="w-24 flex-none whitespace-nowrap text-right">Missed</span>
          <span className="w-12 flex-none whitespace-nowrap text-right">Rate</span>
        </div>
        <div className="space-y-1.5">
          {s.byDow
            .filter((d) => d.worked > 0)
            .map((d) => {
              const total = d.meal + d.rest;
              // real count of premiums a shift could owe - a short shift owes
              // no meal and sometimes no rest, so this is not simply worked x 2
              const possible = d.possible;
              const rate = possible ? Math.round((total / possible) * 100) : 0;
              return (
                <div key={d.label} className="flex items-center gap-3">
                  <span className="w-20 flex-none truncate text-xs text-muted">{d.label}</span>
                  <span className="flex h-4 flex-1 overflow-hidden rounded bg-surface-3">
                    <span
                      className="bg-amber-400"
                      style={{ width: `${(d.meal / maxDow) * 100}%` }}
                      title={`${d.meal} missed meal periods`}
                    />
                    <span
                      className="bg-rose-400"
                      style={{ width: `${(d.rest / maxDow) * 100}%` }}
                      title={`${d.rest} missed rest breaks`}
                    />
                  </span>
                  <span className="w-24 flex-none whitespace-nowrap text-right text-xs tabular-nums text-muted">
                    {total} / {possible}
                  </span>
                  <span className="w-12 flex-none whitespace-nowrap text-right text-xs font-semibold tabular-nums text-foreground">
                    {rate}%
                  </span>
                </div>
              );
            })}
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> missed meal period
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> missed rest break
          </span>
          <span className="text-faint">
            &ldquo;possible&rdquo; counts what each shift actually owed - a meal past 5
            hours, a rest break past 4 - so short shifts don&apos;t inflate it
          </span>
        </p>

        {s.worstDates.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Hardest days this period <span className="normal-case tracking-normal text-faint">(by rate, 5+ people working)</span>
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {s.worstDates.map((d) => (
                <li key={d.date} className="flex items-center justify-between gap-3">
                  <span className="text-foreground">{d.date}</span>
                  <span className="whitespace-nowrap text-muted">
                    {d.meal} meal · {d.rest} rest · {d.worked} working ·{" "}
                    <span className="font-semibold text-foreground">
                      {Math.round(d.rate * 100)}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* who */}
      <Section title="Most affected staff" hint="Ranked by premium hours owed. Someone missing breaks on nearly every shift is usually a workload or coverage problem.">
        {s.mostAffected.length === 0 ? (
          <p className="text-sm text-muted">Nobody missed a break this period.</p>
        ) : (
          <ul className="divide-y divide-border">
            {s.mostAffected.slice(0, 12).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-sm font-medium text-foreground">{a.name}</span>
                <span className="flex items-center gap-3 text-xs text-muted">
                  <span>
                    {a.mealMissed} meal · {a.restMissed} rest of {a.daysWorked} shifts
                  </span>
                  <span className="w-16 text-right font-semibold text-rose-600 dark:text-rose-400">
                    {n2(a.premiumHours)} hrs
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {s.mostAffected.length > 12 && (
          <p className="mt-2 text-xs text-faint">
            and {s.mostAffected.length - 12} more with premiums owed
          </p>
        )}
      </Section>

      {/* overtime */}
      <Section title="Overtime" hint="Daily over 8, double time over 12, and weekly over 40 on a Monday-Sunday workweek. Counting paid rest breaks as hours worked can push a shift past 8.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Mini label="Overtime" value={`${n2(t.otHours)} hrs`} />
          <Mini label="Double time" value={`${n2(t.doubleHours)} hrs`} />
          <Mini label="Staff with overtime" value={`${t.employeesWithOt} of ${t.employees}`} />
        </div>
        {s.withOt.length > 0 && (
          <>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-faint">
              Overtime + double time combined
            </p>
            <ul className="mt-1 divide-y divide-border">
              {s.withOt.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm text-foreground">{a.name}</span>
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    {n2(a.otHours)} hrs
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-3 text-xs leading-relaxed text-faint">
          Pay periods run 1st-15th and 16th to month end, but the workweek runs
          Monday to Sunday, so the weeks at each end of this period are split
          across two exports. Their over-40 overtime is an estimate until the
          neighbouring period is included.
        </p>
      </Section>

      {/* sign-off */}
      <Section title="Sign-off" hint="Who has returned a signed timesheet.">
        <div className="grid gap-3 sm:grid-cols-4">
          <Mini label="Signed" value={s.signing.signed} />
          <Mini label="Sent, not signed" value={s.signing.outstanding.length} />
          <Mini label="Not sent yet" value={s.signing.notSent} />
          <Mini label="Employees" value={t.employees} />
        </div>
        {s.signing.outstanding.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Still waiting on
            </p>
            <p className="mt-1.5 text-sm text-foreground">
              {s.signing.outstanding.map((a) => a.name).join(", ")}
            </p>
          </div>
        )}
      </Section>

      <p className="mt-10 text-xs text-faint">
        <Link href={`/portal/admin/timesheets/${batch.id}`} className="text-brand hover:text-brand-dark">
          Back to the review list
        </Link>
      </p>
    </section>
  );
}

function Card({ label, value, sub, tone }) {
  const valueTone =
    tone === "warn"
      ? "text-rose-600 dark:text-rose-400"
      : tone === "good"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${valueTone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-faint">{sub}</p>}
    </div>
  );
}

function Mini({ label, value, strong }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${strong ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <div className="mt-8 rounded-xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      {hint && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}
