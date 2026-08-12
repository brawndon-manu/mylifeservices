import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { restKey, restNameFor } from "@/lib/timesheet/rests";
import { blockTimes, serviceOf } from "@/lib/timesheet/schedule";
import { drawnRest } from "@/lib/timesheet/recorded-breaks";
import { violationsFor, VIOLATION_KINDS, violationHead } from "@/lib/timesheet/violations";
import BackLink from "@/components/BackLink";
import DayPeek from "../../checks/DayPeek";
import FlagButton from "../../checks/FlagButton";

export const metadata = { title: "Their schedule", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const f2 = (n) => (n == null ? "-" : (Math.round(n * 100) / 100).toFixed(2));

// ONE PERSON, THEIR WHOLE PERIOD, EVERY DAY OF IT.
//
// The checks list is one row per person because the job is a conversation, not
// a day. This is where that conversation gets its detail: what the documents
// recorded on each of their days, which of those days broke a rule, and what to
// tell them to change in QuickSolve.
//
// THE QUIET DAYS ARE DRAWN TOO. A schedule with the clean days deleted is not a
// schedule, it is the list again with extra steps - and the useful thing is
// often the comparison. Flores has a ten minute punch gap at 12:30 on the 1st
// and the same gap on the 2nd, which reads as a rest nobody logged rather than
// two unrelated days, and you can only see that with both in front of you.
export default async function PersonSchedulePage({ params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const { id, sheetId } = await params;
  const sheet = await prisma.timesheet.findUnique({
    where: { id: sheetId },
    include: { batch: { select: { id: true, periodFrom: true, periodTo: true, partialPeriod: true, partialFrom: true, partialThrough: true, restsByDate: true } } },
  });
  // a sheet id from another batch would render somebody's days under the wrong
  // period heading, so the pairing is checked rather than assumed
  if (!sheet || sheet.batchId !== id) notFound();

  const flag = await prisma.timesheetCheckFlag.findUnique({
    where: { batchId_rowKey: { batchId: id, rowKey: `person-${sheet.id}` } },
    select: { rowKey: true, flaggedName: true, flaggedImage: true },
  });

  const v = violationsFor(sheet.data);
  const byDate = sheet.data?.scheduleCheck?.byDate || {};

  // THE SAME PICTURE THE CHECKS SCREEN DRAWS, built the same way - see the long
  // note in checks/page.js. Schedule parsing pulls in the pdf stack, so the
  // blocks are resolved here on the server and the client gets plain objects.
  // As the documents hold it, with no answers applied: this is the audit view.
  const restName = restNameFor(sheet.sourceName, sheet.data);
  const dayViews = new Map();
  for (const d of sheet.data?.days || []) {
    const blocks = [];
    for (const sh of byDate[d.date]?.shifts || []) {
      const at = blockTimes(sh.text);
      const service = serviceOf(sh.text);
      if (at && service) blocks.push({ from: at.start, to: at.end, service, meal: !!sh.meal });
    }
    const drawn = [];
    for (const row of sheet.batch.restsByDate || []) {
      if (row.date !== d.date || restKey(row.name) !== restKey(restName)) continue;
      const at = drawnRest(row, { mealScheduled: d.mealScheduled });
      if (at) drawn.push(at);
    }
    dayViews.set(d.date, {
      day: { date: d.date, punches: d.punches || [], breaks: d.breaks || [] },
      rests: drawn,
      scheduled: blocks,
    });
  }

  const b = sheet.batch;
  const period = b.partialPeriod
    ? `${b.partialFrom} to ${b.partialThrough}`
    : `${b.periodFrom} to ${b.periodTo}`;

  return (
    <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <BackLink href={`/portal/admin/timesheets/${id}/checks`}>Back to Data checks</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">Admin</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {sheet.sourceName}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {period}
        {b.partialPeriod && " · partial period"} · {v.days.length}{" "}
        {v.days.length === 1 ? "day" : "days"} worked
      </p>

      <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4 rounded-xl border border-border bg-surface p-5">
        {[
          ["Paid hours", f2(sheet.paidHours)],
          ["Premium hours", f2(sheet.premiumHours)],
          ["Days worked", String(v.days.length)],
          ["To raise", String(v.total)],
        ].map(([k, val], i) => (
          <div key={k}>
            <span className="block text-[11px] font-bold uppercase tracking-wide text-faint">
              {k}
            </span>
            <span
              className={`mt-0.5 block text-xl font-bold tabular-nums ${
                i === 3 && v.total ? "text-fuchsia-600 dark:text-fuchsia-400" : "text-foreground"
              }`}
            >
              {val}
            </span>
          </div>
        ))}
        <div className="ml-auto self-center">
          <FlagButton batchId={id} rowKey={`person-${sheet.id}`} flag={flag} />
        </div>
      </div>

      {/* WHY their rests are missing, once. Every one of their rest violations
          below is real and charged, but the cause is the same on all of them:
          the Rest Periods Report does not mention this person, so nothing
          recorded a break for them anywhere. Said per day it was the identical
          sentence five times down Aranda's page. */}
      {v.noReport > 0 && (
        <p className="mt-5 border-l-2 border-amber-600 pl-3 text-sm leading-relaxed text-amber-700 dark:text-amber-400">
          The Rest Periods Report never mentions this person, so nothing recorded
          a break for them anywhere. That is why{" "}
          {v.noReport === 1 ? "one of the rest findings below reads" : `all ${v.noReport} of the rest findings below read`}{" "}
          as nothing taken. Getting them into that report in QSP is what settles
          it, and one decision moves all of it at once.
        </p>
      )}

      <h2 className="mt-9 text-xs font-bold uppercase tracking-wide text-faint">
        Their schedule{" "}
        <span className="text-[11px] font-semibold normal-case tracking-normal tabular-nums">
          {v.days.length}
        </span>
      </h2>

      <div className="mt-3 space-y-3">
        {v.days.map(({ day: d, list }) => (
          <div
            key={d.date}
            className={`rounded-lg border border-border bg-surface p-4 border-l-4 ${
              list.length ? "border-l-fuchsia-500" : "border-l-emerald-700/40"
            }`}
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-sm font-semibold tabular-nums text-foreground">{d.date}</p>
              <p className="text-xs text-faint">{f2(d.paidHours)} hrs</p>
              {list.length ? (
                <p className="text-sm font-semibold text-fuchsia-700 dark:text-fuchsia-300">
                  {list.map(violationHead).join(", ")}
                </p>
              ) : (
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  nothing flagged
                </p>
              )}
            </div>

            {list.length > 0 && (
              <ul className="mt-2 divide-y divide-border border-y border-border">
                {list.map((x) => (
                  <li key={x.kind} className="grid gap-x-4 gap-y-0.5 py-2 text-xs sm:grid-cols-[190px_200px_1fr]">
                    <span className="font-semibold text-fuchsia-700 dark:text-fuchsia-300">
                      {VIOLATION_KINDS[x.kind].label}
                    </span>
                    <span className="text-muted">{x.detail}</span>
                    {/* what to say to them. the only reason this screen exists,
                        and it comes from the kind table so the list and this
                        page cannot end up phrasing it differently. */}
                    <span className="italic text-faint">{VIOLATION_KINDS[x.kind].ask}</span>
                  </li>
                ))}
              </ul>
            )}

            <DayPeek {...(dayViews.get(d.date) || {})} />
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-border bg-surface-2 p-4 text-sm text-muted">
        <p className="font-semibold text-foreground">Fixing these</p>
        <p className="mt-1">
          Correct the entries in QSP, then upload the period again. Nothing on
          this page edits QSP, and nothing here has changed their hours - a
          violation is charged from what the documents already say.
        </p>
        <p className="mt-2">
          <a
            href={`/portal/admin/timesheets/sheet/${sheet.id}/download`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand underline underline-offset-4"
          >
            Open their sheet
          </a>{" "}
          to see the document itself.
        </p>
      </div>
    </section>
  );
}
