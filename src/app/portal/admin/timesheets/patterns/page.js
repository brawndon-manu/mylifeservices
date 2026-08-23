import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import BackLink from "@/components/BackLink";
import {
  complianceFor, complianceCounts, repeatsByPerson, attendanceOf, COMPLIANCE_KINDS, CAP_MINUTES,
} from "@/lib/timesheet/compliance";

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

export default async function PatternsPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  // ONE PAYROLL AT A TIME. This page reads across every period, so without a
  // program filter the day program's fortnights would land in the agency's
  // repeat-pattern counts and change what a reviewer sees about their own
  // people. The link from each list carries its program.
  const sp = await searchParams;
  const program = sp?.program === "DP" ? "DP" : "MLS";

  const allBatches = await prisma.timesheetBatch.findMany({
    where: { program },
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

  // ONE UPLOAD PER PAY PERIOD, 2026-08-22.
  //
  // This read every batch row, and a re-uploaded period is a second batch row
  // holding the same fortnight again. 08/01-08/15 was uploaded fourteen times,
  // so seventeen rows covered three periods and every total on this page counted
  // the same days over and over: Garcia read 160 missed breaks against a real 21,
  // Cain 140 against 32. The miss RATE survived it - both halves inflated
  // together - which is why a page of wrong numbers still looked plausible.
  //
  // The "missed in every period" callout was not inflated but broken: it compares
  // `periodsWithMisses`, counted per batch, against `periodCount`, counted per
  // period. Fourteen never equals three, so people who miss breaks every single
  // period fell out of the one list built to find them - 1 shown where there are
  // 11.
  //
  // Current-per-period is the same rule `supersededBy` applies: newest createdAt
  // for the same program and fortnight. Ordered ascending above, so the last one
  // written for a key wins.
  const currentByPeriod = new Map();
  for (const b of allBatches) currentByPeriod.set(`${b.periodFrom}-${b.periodTo}`, b);
  const batches = [...currentByPeriod.values()];
  const supersededCount = allBatches.length - batches.length;

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

  // now one batch per fortnight, so this counts pay periods rather than uploads
  const periodCount = batches.length;
  // "every period" only means something once there's more than one to compare.
  // `periodsWithMisses` and `periodCount` are finally counting the same unit.
  const recurring = rows.filter((r) => r.periodCount > 1 && r.periodsWithMisses === r.periodCount);

  // ---- scheduling compliance, which is nobody's pay and somebody's job ------
  //
  // Mánu 2026-08-22: "I want to have a way to have MLS violations where it
  // becomes admins job to see patterns and repeats and stop it." A booking
  // rostered at eight hours was built that way before anyone clocked in, so it
  // is not on the person who worked it and never reaches their pay - see the
  // note at the top of compliance.js. It belongs here, on the page about what
  // keeps happening.
  const complianceRows = [];
  for (const b of batches) {
    const period = `${b.periodFrom} to ${b.periodTo}`;
    for (const ts of b.timesheets) {
      complianceRows.push({
        who: ts.user ? preferredName(ts.user) : ts.sourceName,
        period,
        findings: complianceFor(ts.data, attendanceOf(b, ts.sourceName)),
      });
    }
  }
  const repeats = repeatsByPerson(complianceRows);
  const complianceTotals = complianceCounts(complianceRows.flatMap((r) => r.findings));
  const overCapTotal = complianceTotals["booking-over-cap"] || 0;
  const overlapTotal = complianceTotals["blocks-overlap"] || 0;

  // people who have never once clocked a rest break. that someone clocks their
  // MEALS but never a rest is the giveaway - they use the clock fine, they just
  // weren't told rests go on it too.
  const notClockingRests = rows
    .filter((r) => r.restPunches === 0 && r.restMissed > 0)
    .sort((a, b) => b.restMissed - a.restMissed);

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
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

      {supersededCount > 0 && (
        <p className="mt-3 max-w-3xl text-xs text-muted">
          Counting the current upload of each pay period only. {supersededCount}{" "}
          earlier {supersededCount === 1 ? "upload was" : "uploads were"} replaced
          by a newer one of the same fortnight and {supersededCount === 1 ? "is" : "are"}{" "}
          not counted again here.
        </p>
      )}

      {periodCount < 2 && (
        <div className="mt-6 rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
          {/* the space has to live INSIDE the expression. JSX eats the newline
              after a {...} and this rendered as "hasbeen uploaded" on screen.
              third time this file's shape has done it - build, lint and tests
              all pass, it is only ever visible in a picture. */}
          Only {periodCount === 1 ? "one pay period has " : "no pay periods have "}
          been uploaded, so there&apos;s no trend to read yet. This page gets
          useful once a few periods have run.
        </div>
      )}

      {notClockingRests.length > 0 && (
        <div className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-5 dark:border-rose-900/60 dark:bg-rose-950/30">
          <h2 className="text-base font-semibold text-rose-900 dark:text-rose-200">
            Not clocking rest breaks at all
          </h2>
          {/* This used to say the premium was owed BECAUSE there was no punch.
              That stopped being true on 06 August, when QSP stopped punching
              rest breaks: a punch witnesses nothing now and the Rest Periods
              Report decides. Two people here never punch a rest and owe nothing
              at all, because the report records theirs. Never punching is the
              pattern; what it COSTS is a separate question the report answers. */}
          <p className="mt-1 text-sm text-rose-800 dark:text-rose-200/80">
            These {notClockingRests.length} have never punched a single rest break,
            and are also short on the Rest Periods Report - {" "}
            <strong>
              {notClockingRests.reduce((n, r) => n + r.restMissed, 0)} hours
            </strong>{" "}
            between them so far. The punch is not what decides it: since the
            export set changed, only the Rest Periods Report can say a break
            happened, and people who never punch a rest but appear in the report
            owe nothing. This is still the group to talk to, because a habit of
            not recording a break is what turns into a premium when the report
            misses it too.
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

      {repeats.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Scheduling to stop
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            Not breaks and not pay. These are rules broken by how the schedule
            was <em>built</em>{" "}
            {/* the space has to live INSIDE the expression - see the note
                further up this file. A text node that runs onto the next line
                loses the space that opened it, so this rendered as "built- a
                booking" on screen while the source plainly had one. Fourth
                time this file's shape has caught somebody. */}
            - a booking rostered past the cap, or two rostered over each other -
            so nobody is owed anything and nothing here appears on the sheet
            anyone signs. They were set before the shift was worked, which makes
            them the office&apos;s to fix.{" "}
            <strong>{overCapTotal}</strong>{" "}
            {overCapTotal === 1 ? "booking runs" : "bookings run"} past{" "}
            {CAP_MINUTES / 60} hours and <strong>{overlapTotal}</strong>{" "}
            {overlapTotal === 1 ? "day has" : "days have"} blocks over each other,
            across {repeats.length}{" "}
            {repeats.length === 1 ? "person" : "people"}.
          </p>

          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[780px] text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Employee</th>
                  <th className="px-3 py-2 text-right font-semibold">Periods</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    Over {CAP_MINUTES / 60}h
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">Overlaps</th>
                  <th className="px-3 py-2 text-left font-semibold">Longest booking</th>
                </tr>
              </thead>
              <tbody>
                {repeats.map((p) => (
                  <tr key={p.who} className="border-t border-border">
                    <td className="px-3 py-2 text-foreground">{p.who}</td>
                    {/* a person with ten in one fortnight is a different
                        conversation from one with ten spread over five */}
                    <td className="px-3 py-2 text-right tabular-nums text-muted">
                      {p.periods.length}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {p.byKind["booking-over-cap"] || 0}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {p.byKind["blocks-overlap"] || 0}
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {p.worst
                        ? `${p.worst.date} - ${COMPLIANCE_KINDS["booking-over-cap"].describe(p.worst)}`
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">
            {COMPLIANCE_KINDS["booking-over-cap"].action}{" "}
            {COMPLIANCE_KINDS["blocks-overlap"].action}
          </p>
        </div>
      )}

      <h2 className="mt-10 text-xl font-semibold tracking-tight text-foreground">
        Breaks, by person
      </h2>
      <div className="mt-4 overflow-x-auto rounded-xl border border-border">
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
