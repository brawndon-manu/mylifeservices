import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import BackLink from "@/components/BackLink";

export const metadata = { title: "Repeat patterns", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const fmt = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);

// a shift only "owed" a meal past 5 hours, and a rest once it reached the
// 4-hour mark. rating people against shifts x 2 would understate how often
// breaks are genuinely being missed. mirrors possiblePremiums in stats.js.
function owedOn(day) {
  const meal = (day.paidHours || 0) > 5 ? 1 : 0;
  const rest = (day.restRequired || 0) > 0 ? 1 : 0;
  return meal + rest;
}

export default async function PatternsPage() {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const batches = await prisma.timesheetBatch.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      timesheets: {
        include: {
          user: {
            select: { id: true, name: true, preferredFirstName: true, preferredLastName: true },
          },
        },
      },
    },
  });

  // group by the matched account where there is one, otherwise by the name QSP
  // printed, so an unmatched row still aggregates with itself across periods.
  const people = new Map();
  for (const b of batches) {
    const period = `${b.periodFrom} to ${b.periodTo}`;
    for (const ts of b.timesheets) {
      const key = ts.userId || `name:${ts.sourceName}`;
      if (!people.has(key)) {
        people.set(key, {
          key,
          who: ts.user ? preferredName(ts.user) : ts.sourceName,
          matched: !!ts.userId,
          periods: new Set(),
          days: 0,
          owed: 0,
          mealMissed: 0,
          restMissed: 0,
          premiumHours: 0,
          paidHours: 0,
          periodsWithMisses: 0,
          restPunches: 0,
          mealPunches: 0,
        });
      }
      const p = people.get(key);
      p.periods.add(period);
      p.premiumHours += ts.premiumHours || 0;
      p.paidHours += ts.paidHours || 0;

      let missesThisPeriod = 0;
      for (const d of ts.data?.days || []) {
        p.days++;
        p.owed += owedOn(d);
        p.restPunches += d.restCount || 0;
        p.mealPunches += d.mealCount || 0;
        if (d.mealViolation) { p.mealMissed++; missesThisPeriod++; }
        if (d.restViolation) { p.restMissed++; missesThisPeriod++; }
      }
      if (missesThisPeriod > 0) p.periodsWithMisses++;
    }
  }

  const rows = [...people.values()]
    .map((p) => ({
      ...p,
      periodCount: p.periods.size,
      missed: p.mealMissed + p.restMissed,
      rate: pct(p.mealMissed + p.restMissed, p.owed),
    }))
    // rate first, because a busy person shouldn't top the list just for working
    // more days than everyone else
    .sort((a, b) => b.rate - a.rate || b.missed - a.missed);

  const periodCount = batches.length;
  // "every period" only means something once there's more than one to compare
  const recurring = rows.filter((r) => r.periodCount > 1 && r.periodsWithMisses === r.periodCount);

  // people who have never once clocked a rest break. that someone clocks their
  // MEALS but never a rest is the giveaway - they use the clock fine, they just
  // weren't told rests go on it too.
  const notClockingRests = rows
    .filter((r) => r.restPunches === 0 && r.restMissed > 0)
    .sort((a, b) => b.restMissed - a.restMissed);

  return (
    <section className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin/timesheets">Back to Timesheets</BackLink>

      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Across pay periods
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Repeat patterns
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Who is missing breaks period after period, across every batch uploaded so
        far. Usually this is a timekeeping habit rather than breaks actually
        being denied - people forget to clock out for lunch. Either way it costs
        the company a premium every time, so it&apos;s worth a conversation
        rather than a recalculation.
      </p>

      {periodCount < 2 && (
        <div className="mt-6 rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
          Only {periodCount === 1 ? "one pay period has" : "no pay periods have"} been
          uploaded, so there&apos;s no trend to read yet. This page gets useful
          once a few periods have run.
        </div>
      )}

      {notClockingRests.length > 0 && (
        <div className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-5 dark:border-rose-900/60 dark:bg-rose-950/30">
          <h2 className="text-base font-semibold text-rose-900 dark:text-rose-200">
            Not clocking rest breaks at all
          </h2>
          <p className="mt-1 text-sm text-rose-800 dark:text-rose-200/80">
            These {notClockingRests.length} have never punched a single rest break.
            Because there is no punch, there is nothing showing the break was
            taken, so every qualifying day owes a premium - {" "}
            <strong>
              {notClockingRests.reduce((n, r) => n + r.restMissed, 0)} hours
            </strong>{" "}
            between them so far. This is the group to talk to: the fix is
            clocking the break when it happens, and it costs a premium every day
            it doesn&apos;t.
          </p>
          <ul className="mt-3 grid gap-1 sm:grid-cols-2">
            {notClockingRests.map((r) => (
              <li key={r.key} className="text-sm text-rose-900 dark:text-rose-200">
                <span className="font-semibold">{r.who}</span> — {r.restMissed} of{" "}
                {r.days} days
                {r.mealPunches > 0 && (
                  <span className="text-xs opacity-80"> (does clock meals)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recurring.length > 0 && (
        <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>{recurring.length}</strong>{" "}
          {recurring.length === 1 ? "person has" : "people have"} missed at least
          one break in <strong>every</strong> period they appear in:{" "}
          {recurring.slice(0, 6).map((r) => r.who).join(", ")}
          {recurring.length > 6 && `, and ${recurring.length - 6} more`}.
        </div>
      )}

      <div className="mt-8 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[780px] text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Employee</th>
              <th className="px-3 py-2 text-right font-semibold">Periods</th>
              <th className="px-3 py-2 text-right font-semibold">Days</th>
              <th className="px-3 py-2 text-right font-semibold">Meals missed</th>
              <th className="px-3 py-2 text-right font-semibold">Rests missed</th>
              <th className="px-3 py-2 text-right font-semibold">Miss rate</th>
              <th className="px-3 py-2 text-right font-semibold">Premium hrs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border">
                <td className="px-3 py-2 text-foreground">
                  {r.who}
                  {!r.matched && (
                    <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
                      unmatched
                    </span>
                  )}
                  {r.periodCount > 1 && r.periodsWithMisses === r.periodCount && (
                    <span className="ml-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
                      every period
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">
                  {r.periodsWithMisses}/{r.periodCount}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">{r.days}</td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {r.mealMissed}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {r.restMissed}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
                  {r.rate}%
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-rose-600 dark:text-rose-400">
                  {fmt(r.premiumHours)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="mt-6 text-sm text-muted">
          No timesheets have been uploaded yet.{" "}
          <Link
            href="/portal/admin/timesheets/new"
            className="font-semibold underline underline-offset-4"
          >
            Upload a pay period
          </Link>
          .
        </p>
      )}
    </section>
  );
}
