import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { restKey, restNameFor } from "@/lib/timesheet/rests";
import { violationsFor } from "@/lib/timesheet/violations";
import { tagsForPerson, isClean } from "@/lib/timesheet/person-tags";
import BackLink from "@/components/BackLink";
import FlagButton from "../checks/FlagButton";

export const metadata = { title: "Everybody on this timesheet", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const f2 = (n) => (n == null ? "-" : (Math.round(n * 100) / 100).toFixed(2));

// FULL LITERAL CLASS STRINGS. Tailwind v4 compiles what it can see in source, so
// a class assembled from a variable produces no colour - the violations group
// shipped with a plain white border once for exactly that reason.
const TONE = {
  violation: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-800/70 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
  premium: "border-fuchsia-400 bg-fuchsia-100 text-fuchsia-900 dark:border-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-200",
  conflict: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/40 dark:text-rose-300",
  anomaly: "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800/70 dark:bg-violet-950/40 dark:text-violet-300",
  missing: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-300",
};

// EVERYBODY ON THE TIMESHEET, ONE CARD EACH.
//
// Mánu 2026-08-12: "a button to view all employees. it should show a card for
// every name in the timesheet. and have tags for every violation / premium /
// missing / conflict. under it it should see something to view their day by day
// with the calendar views so we can reach out to them."
//
// THE CLEAN ONES ARE THE POINT. The checks list only shows people something is
// wrong with, which on the August batch is 46 of 60 - so 14 people appear on no
// screen this portal has, and finding one of them to call meant knowing they
// existed. A list of everybody is also the only way to see that somebody is
// missing from the export entirely.
//
// It does not re-decide anything. Every tag reads a source that is already the
// single definition of its own question - see `person-tags.js`.
export default async function AllPeoplePage({ params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const { id } = await params;
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    include: {
      timesheets: {
        orderBy: { sourceName: "asc" },
        select: {
          id: true, sourceName: true, paidHours: true, premiumHours: true,
          signedAt: true, sentAt: true, data: true,
        },
      },
    },
  });
  if (!batch) notFound();

  const flags = new Map(
    (await prisma.timesheetCheckFlag.findMany({
      where: { batchId: id },
      select: { rowKey: true, flaggedName: true, flaggedImage: true },
    })).map((f) => [f.rowKey, f]),
  );

  // Rest report rows worth a person's attention, counted per person. KEYED ON
  // THE REPORT'S OWN SPELLING, because QSP files Delgado Pineda, Ruth under
  // "Delgado Pineda, Angel" and matching on the timesheet's name finds none of
  // her eleven rows.
  const restRows = new Map();
  const byRestName = new Map(
    batch.timesheets.map((t) => [restKey(restNameFor(t.sourceName, t.data)), t.id]),
  );
  for (const r of (batch.restsByDate || []).filter((x) => x.kind)) {
    const sheetId = byRestName.get(restKey(r.name));
    if (!sheetId) continue;
    restRows.set(sheetId, (restRows.get(sheetId) || 0) + 1);
  }

  const people = batch.timesheets.map((t) => {
    const v = violationsFor(t.data);
    const tags = tagsForPerson(t, { restRowCount: restRows.get(t.id) || 0 });
    return {
      id: t.id,
      who: t.sourceName,
      paid: t.paidHours,
      premium: t.premiumHours,
      days: v.days.length,
      toRaise: v.total,
      tags,
      clean: isClean(tags),
      flag: flags.get(`person-${t.id}`) || null,
    };
  });

  const clean = people.filter((p) => p.clean).length;
  const period = batch.partialPeriod
    ? `${batch.partialFrom} to ${batch.partialThrough}`
    : `${batch.periodFrom} to ${batch.periodTo}`;

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <BackLink href={`/portal/admin/timesheets/${batch.id}/checks`}>Back to Data checks</BackLink>

      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">Admin</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Everybody on this timesheet
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
        {period}
        {batch.partialPeriod && " · partial period"} · every name in the export,
        including the {clean} with nothing flagged. The Data checks list only
        shows people something is wrong with, so this is the one place somebody
        clean can be found. Open anybody to see their day by day with the
        calendar under each day.
      </p>

      <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4 rounded-xl border border-border bg-surface p-5">
        {[
          ["People", String(people.length)],
          ["With something to raise", String(people.filter((p) => p.toRaise > 0).length)],
          ["Nothing flagged", String(clean)],
          ["Premium hours", f2(people.reduce((n, p) => n + (p.premium || 0), 0))],
        ].map(([k, val]) => (
          <div key={k}>
            <span className="block text-[11px] font-bold uppercase tracking-wide text-faint">{k}</span>
            <span className="mt-0.5 block text-xl font-bold tabular-nums text-foreground">{val}</span>
          </div>
        ))}
      </div>

      {/* ONE FULL WIDTH ROW PER PERSON, not a grid of cards. Mánu 2026-08-12
          wants to keep adding to a person's row, and a three-across grid caps
          how much any one of them can hold - the third column is already narrow
          on a laptop. Down the page each row can grow as far right as it likes
          and the list still reads as a list.

          The name sits in a fixed width column so the names line up down the
          page. That is what makes sixty rows scannable: the eye runs down one
          edge instead of hunting for where each name starts. */}
      <div className="mt-6 space-y-2">
        {people.map((p) => (
          <div
            key={p.id}
            className={`rounded-lg border border-border bg-surface p-4 border-l-4 ${
              p.clean ? "border-l-emerald-600/50" : "border-l-fuchsia-500"
            }`}
          >
            <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
              <div className="w-full shrink-0 sm:w-56">
                <p className="text-sm font-semibold text-foreground">{p.who}</p>
                <p className="mt-0.5 text-xs tabular-nums text-faint">
                  {f2(p.paid)} paid · {p.days} {p.days === 1 ? "day" : "days"}
                </p>
              </div>

              {/* WHAT THEY ARE CHARGED, as a figure rather than a chip.
                  It is the number the row gets read for, and one hour is owed
                  per workday per kind - so it should equal the findings beside
                  it. Aranda's August row reads 5 rest and 5 meal against 10.00,
                  and a premium with nothing beside it to account for it is the
                  same failure the batch level 148 = 148.00 exists to catch.

                  Printed at 0.00 too, so the column stays a column. A blank
                  reads as "not worked out yet" rather than "nothing owed". */}
              <div className="w-28 shrink-0">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-faint">
                  Premium hrs
                </span>
                <span
                  className={`mt-0.5 block text-lg font-bold tabular-nums ${
                    p.premium > 0 ? "text-fuchsia-600 dark:text-fuchsia-400" : "text-faint"
                  }`}
                >
                  {f2(p.premium)}
                </span>
                {p.toRaise > 0 && (
                  <span className="block text-[11px] tabular-nums text-muted">
                    {p.toRaise} to raise
                  </span>
                )}
              </div>

              {/* the middle is deliberately the flexible part, so whatever gets
                  added next has somewhere to go without the row re-laying out */}
              <div className="min-w-[16rem] flex-1">
                <div className="flex flex-wrap gap-1.5">
                  {p.clean ? (
                    <span className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300">
                      Nothing flagged
                    </span>
                  ) : (
                    // premium is not a chip here: it has its own column now, and
                    // saying it twice on one row is how two copies of a fact
                    // start disagreeing
                    p.tags.filter((t) => t.key !== "premium").map((tag) => (
                      <span
                        key={tag.key}
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${TONE[tag.tone]}`}
                      >
                        {tag.n != null && (
                          <span className="tabular-nums">{tag.figure ? f2(tag.n) : tag.n} </span>
                        )}
                        {tag.label}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* THE WAY IN, on every row and not only the ones with a finding.
                  Their page draws every day of the period with the real calendar
                  under it, clean days included, which is the thing you read
                  before picking up the phone. */}
              <div className="ml-auto flex shrink-0 items-center gap-3">
                <FlagButton batchId={id} rowKey={`person-${p.id}`} flag={p.flag} />
                <Link
                  href={`/portal/admin/timesheets/${batch.id}/person/${p.id}`}
                  className="card-lift block rounded-md border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-brand shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  View their day by day
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
