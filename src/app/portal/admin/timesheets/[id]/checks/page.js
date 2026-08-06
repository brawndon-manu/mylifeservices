import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import {
  anomalyLabel,
  ANOMALY_KINDS,
  describePunchIssue,
  scheduledPaidHours,
} from "@/lib/timesheet/anomalies";
import BackLink from "@/components/BackLink";
import CorrectDay from "./CorrectDay";
import Evidence from "./Evidence";
import ChecksFilter from "./ChecksFilter";
import RecomputeButton from "../corrections/RecomputeButton";

export const metadata = { title: "Data checks", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const f2 = (n) => (n == null ? "-" : (Math.round(n * 100) / 100).toFixed(2));

// One row per DAY, not per person. This screen used to be a card per employee
// with every flag inside it at equal weight, so on this period the 3 days that
// actually need somebody sat inside 55 that mostly do not. What a person
// opening this screen wants to know is "what do I have to do", and that is a
// property of a day, not of an employee.
//
// Every headline carries a figure AND what is known about it. "reads 9.00 hrs"
// on its own invites the obvious question: as opposed to what?
function describePunchRow(p) {
  const t = p.say?.tone;
  if (t === "human") {
    return {
      group: "decide",
      head: `${f2(p.hoursNow)} hrs, not settled`,
      tone: "text-rose-700 dark:text-rose-400",
      lead:
        "The punches contradict themselves, no single swap puts them back in order, and the schedule does not settle it either. The day could land above or below this figure once somebody reads the source.",
    };
  }
  if (t === "settled") {
    return {
      group: "settled",
      head: `${f2(p.say.hours)} hrs, confirmed`,
      tone: "text-emerald-700 dark:text-emerald-400",
      lead: `The punches contradict themselves, but the schedule this timesheet was built from independently says ${f2(p.say.hours)} hrs, so the total is not in question. Worth correcting in QSP so the next export is clean.`,
    };
  }
  if (t === "inert") {
    return {
      group: "settled",
      head: `${f2(p.say.hours)} hrs either way`,
      tone: "text-muted",
      lead:
        "A repair is available and it moves neither the hours nor the premiums, so nothing on this sheet turns on it. Worth correcting in QSP, but there is nothing to decide.",
    };
  }
  return {
    group: "settled",
    head: `${f2(p.say.was)} → ${f2(p.say.hours)} hrs`,
    tone: "text-emerald-700 dark:text-emerald-400",
    lead: `Repaired: ${(p.say.applied || []).join("; ") || "punches reordered"}. The schedule agrees with the repaired figure, which is the only reason it was applied.`,
  };
}

function describeFlagRow(f) {
  if (f.timesheet == null) {
    return {
      group: "unworked",
      head: "pays 0.00",
      tone: "text-amber-700 dark:text-amber-400",
      lead: `The schedule has ${f2(f.schedule)} hrs for this day and the timesheet has no punches at all, so the corrected sheet pays nothing for it. Somebody has to ask whether they worked it.`,
    };
  }
  if (f.schedule == null) {
    return {
      group: "settled",
      head: `${f2(f.timesheet)} hrs worked`,
      tone: "text-muted",
      lead:
        "Worked, but the schedule has nothing for this day. The timesheet is the record we pay from, so this is context rather than a problem.",
    };
  }
  return {
    group: "settled",
    head: `${f2(f.timesheet)} worked, ${f2(f.schedule)} scheduled`,
    tone: "text-muted",
    lead:
      "People work hours other than the ones they were scheduled. The timesheet is the record we pay from, so this never moves a figure. It is here as context.",
  };
}

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

  const entries = [];
  let anySchedule = false;

  for (const t of batch.timesheets) {
    const sched = t.data?.scheduleCheck || { matched: false };
    if (sched.matched) anySchedule = true;
    const byDate = sched.byDate || {};
    const common = {
      timesheetId: t.id,
      who: t.user ? preferredName(t.user) : t.sourceName,
      signed: !!t.signedAt,
      overrides: t.overrides || {},
      dayByDate: Object.fromEntries((t.data?.days || []).map((d) => [d.date, d])),
      dayHours: Object.fromEntries((t.data?.days || []).map((d) => [d.date, d.paidHours])),
      byDate,
    };

    for (const p of t.data?.punchIssues || []) {
      const withSay = { ...p, say: describePunchIssue(p, scheduledPaidHours(byDate[p.date])) };
      entries.push({ ...common, kind: "punch", date: p.date, p: withSay, d: describePunchRow(withSay) });
    }
    for (const f of sched.flagged || []) {
      entries.push({ ...common, kind: "flag", date: f.date, f, d: describeFlagRow(f) });
    }
  }

  const ORDER = { decide: 0, unworked: 1, settled: 2 };
  entries.sort(
    (a, b) =>
      ORDER[a.d.group] - ORDER[b.d.group] ||
      a.who.localeCompare(b.who) ||
      String(a.date).localeCompare(String(b.date)),
  );

  const counts = { decide: 0, unworked: 0, settled: 0 };
  for (const e of entries) counts[e.d.group]++;
  const needsPerson = counts.decide + counts.unworked;

  // the recompute prompt belongs to a SHEET, not a day, so it rides on the
  // first row that sheet contributes rather than repeating on every one
  const recomputeShown = new Set();
  for (const e of entries) {
    if (Object.keys(e.overrides).length > 0 && !e.signed && !recomputeShown.has(e.timesheetId)) {
      recomputeShown.add(e.timesheetId);
      e.showRecompute = true;
    }
  }

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <BackLink href={`/portal/admin/timesheets/${batch.id}`}>Back to the batch</BackLink>

      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Data checks
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {batch.periodFrom} to {batch.periodTo}
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
        Nothing here has changed anybody&apos;s hours. The engine reproduces what
        QSP exported to the hundredth of an hour, so everything below is a problem
        in the source data rather than in the arithmetic.{" "}
        {entries.length === 0 ? (
          "Nothing was flagged in this batch."
        ) : (
          <>
            <span className="font-semibold text-foreground">
              {needsPerson} of these need a person.
            </span>{" "}
            The rest are here so you can audit them.
          </>
        )}
      </p>

      {!anySchedule && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          No schedule export was uploaded with this batch, so the hours could only
          be checked against themselves. A punch typed into the wrong box is
          invisible that way - especially when two of them cancel out and leave a
          total that looks perfectly normal. Upload the period again with the
          Employee Schedules PDF to get the second check.
        </div>
      )}

      {entries.length === 0 ? (
        <p className="mt-10 rounded-xl border border-emerald-300/60 bg-emerald-50 p-6 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
          Nothing looks wrong in this batch. Every punch pair runs forwards, no
          stretch on the clock is impossibly long, and
          {anySchedule
            ? " every day agrees with the schedule."
            : " no schedule was provided to compare against."}
        </p>
      ) : (
        <ChecksFilter counts={counts} groups={entries.map((e) => e.d.group)}>
          {entries.map((e) => (
            <div
              key={`${e.timesheetId}-${e.kind}-${e.date}`}
              className={`rounded-lg border border-border bg-surface p-4 border-l-4 ${
                e.d.group === "decide"
                  ? "border-l-rose-500"
                  : e.d.group === "unworked"
                    ? "border-l-amber-500"
                    : "border-l-emerald-600/70"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm">
                  <span className="font-semibold text-foreground">{e.who}</span>
                  <span className="ml-2 text-xs text-faint">{e.date}</span>
                </p>
                <p className={`text-sm font-semibold ${e.d.tone}`}>{e.d.head}</p>
              </div>

              <p className="mt-1.5 text-sm leading-relaxed text-muted">{e.d.lead}</p>

              <details className="group mt-2">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-brand">
                  <span aria-hidden="true" className="transition-transform group-open:rotate-90">
                    ▶
                  </span>
                  What the documents say
                </summary>
                <div className="mt-2 rounded-md border border-border bg-surface-2 p-3">
                  {e.kind === "punch" && (
                    <>
                      {e.p.anomalies.map((a, j) => (
                        <p key={j} className="mb-1 text-xs leading-relaxed text-muted">
                          <span className="font-semibold text-foreground">
                            {anomalyLabel(a.kind)}:
                          </span>{" "}
                          {a.shown} - {a.note}
                          <span className="block italic">{ANOMALY_KINDS[a.kind]?.why}</span>
                        </p>
                      ))}
                      <p className="mt-2 font-mono text-xs text-muted">
                        QSP has: {e.p.shownPunches.join("  ")}
                      </p>
                      {e.p.suggestion && (
                        <p className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
                          Likely: {e.p.suggestion.punches.join("  ")}
                        </p>
                      )}
                    </>
                  )}
                  <Evidence
                    batchId={batch.id}
                    timesheetId={e.timesheetId}
                    date={e.date}
                    day={e.dayByDate[e.date] || null}
                    shifts={e.byDate[e.date]?.shifts}
                    schedulePages={e.byDate[e.date]?.pages}
                    hasSource={!!batch.sourceUrl}
                    hasSchedule={!!batch.scheduleUrl}
                  />
                </div>
              </details>

              {/* correcting is offered per day against the figure that day
                  actually holds, never as a blanket "trust the schedule" - that
                  is what would have turned a page-break bug into an offer to
                  overwrite a correct 8.00 */}
              {e.kind === "flag" &&
                !e.signed &&
                e.f.timesheet != null &&
                e.dayHours[e.date] != null && (
                  <CorrectDay
                    timesheetId={e.timesheetId}
                    date={e.date}
                    timesheet={e.f.timesheet}
                    schedule={e.f.schedule}
                    existing={e.overrides[e.date] || null}
                  />
                )}

              <div className="mt-2 flex flex-wrap items-center gap-4">
                <a
                  href={`/portal/admin/timesheets/sheet/${e.timesheetId}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-brand hover:text-brand-dark"
                >
                  Open their sheet →
                </a>
                {e.showRecompute && (
                  <RecomputeButton
                    timesheetId={e.timesheetId}
                    accepted={Object.keys(e.overrides).length}
                  />
                )}
              </div>
            </div>
          ))}
        </ChecksFilter>
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
