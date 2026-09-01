import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import BackLink from "@/components/BackLink";
import { setPto } from "@/app/portal/admin/day-program/actions";
import PtoCell from "./PtoCell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar", robots: { index: false, follow: false } };

// THE PERIOD AS A GRID: everybody down the side, every day across.
//
// It exists for the day program, which has no Misc classification to park a
// non-working day under - so a day somebody was off simply read as a gap, and a
// gap looks identical to a day nobody has looked at yet. Here the gap is
// fillable: click it and say how many hours of time off it was.
//
// PEOPLE WITH NO TIMESHEET STILL APPEAR. Somebody whose whole fortnight is time
// off never lands on a QSP export, because QSP prints punches and they have
// none. Leaving them off this screen would make their time off unrecordable and
// invisible at once, so the roster is the batch's people UNION anybody already
// holding PTO for the period.
//
// PTO IS NEVER ADDED TO A WORKED FIGURE HERE. The columns are separate on
// purpose: a PTO day is not a shift, owes no rest break, and must not reach the
// over-40 test. See the note on the `PtoEntry` model.
export default async function CalendarPage({ params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");
  const { id } = await params;

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    select: {
      id: true, periodFrom: true, periodTo: true, program: true,
      timesheets: {
        orderBy: { sourceName: "asc" },
        select: {
          id: true, sourceName: true, userId: true, data: true, paidHours: true,
          // the day-program review's time-off answer, so a day somebody said
          // held PTO or sick time shows here as reported until it is accepted
          corrections: {
            where: { kind: "time_off" },
            select: { choice: true, timeOff: true },
          },
        },
      },
    },
  });
  if (!batch) notFound();

  const program = batch.program || "MLS";
  const pto = await prisma.ptoEntry.findMany({
    where: { program, periodFrom: batch.periodFrom, periodTo: batch.periodTo },
    orderBy: { date: "asc" },
  });

  // ANYBODY HOLDING TIME OFF WHO IS NOT ON THE UPLOAD. Read by account id, then
  // named from the account, because there is no sheet to take a spelling from.
  const onSheet = new Set(batch.timesheets.map((t) => t.userId).filter(Boolean));
  const strays = [...new Set(pto.map((p) => p.personKey))].filter((k) => !onSheet.has(k));
  const strayUsers = strays.length
    ? await prisma.user.findMany({
      where: { id: { in: strays } },
      select: { id: true, name: true, preferredFirstName: true, preferredLastName: true },
    })
    : [];

  // WHAT STAFF REPORTED ON THEIR REVIEW, keyed the same way. A claim, not the
  // record: the cell shows it as reported until someone accepts it, and a day
  // that already holds a PtoEntry has been handled - the row is the answer.
  const reportedBy = new Map();
  for (const t of batch.timesheets) {
    if (!t.userId) continue;
    const row = (t.corrections || []).find((c) => c.choice === "yes" && Array.isArray(c.timeOff));
    for (const e of row?.timeOff || []) {
      if (e?.date && Number(e.hours) > 0) {
        reportedBy.set(`${t.userId}|${e.date}`, { kind: e.kind === "sick" ? "sick" : "pto", hours: e.hours });
      }
    }
  }

  // the days of the period, taken from the sheets themselves rather than from
  // the printed dates - a date nobody worked and nobody has PTO on still needs
  // a column, so the union of every day seen is the axis. Reported days are in
  // the union too: a claimed PTO day is exactly a day its person never worked,
  // and on a quiet date nobody else worked either, so without this the one
  // column the claim needs would not exist and the claim would never show.
  const dates = [...new Set([
    ...batch.timesheets.flatMap((t) => (t.data?.days || []).map((d) => d.date)),
    ...pto.map((p) => p.date),
    ...[...reportedBy.keys()].map((k) => k.split("|")[1]),
  ])].filter(Boolean).sort((a, b) => {
    const k = (s) => { const [m, d, y] = String(s).split("/"); return `${y}${m}${d}`; };
    return k(a).localeCompare(k(b));
  });

  const ptoBy = new Map(pto.map((p) => [`${p.personKey}|${p.date}`, p]));

  const nameOf = (u) => {
    const f = u.preferredFirstName || (u.name || "").split(" ")[0] || "";
    const l = u.preferredLastName || (u.name || "").split(" ").slice(1).join(" ") || "";
    return `${l}, ${f}`.replace(/^, |, $/, "") || "(unnamed)";
  };

  const rows = [
    ...batch.timesheets.map((t) => ({
      key: t.userId || t.id,
      name: t.sourceName,
      userId: t.userId,
      worked: new Map((t.data?.days || []).map((d) => [d.date, d.paidHours])),
      paid: t.paidHours,
      noSheet: false,
    })),
    ...strayUsers.map((u) => ({
      key: u.id, name: nameOf(u), userId: u.id, worked: new Map(), paid: 0, noSheet: true,
    })),
  ].sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const back = `/portal/admin/timesheets/${batch.id}/calendar`;
  const r2 = (n) => Math.round((n || 0) * 100) / 100;
  const ptoTotal = r2(pto.reduce((n, p) => n + p.hours, 0));

  return (
    <section className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <BackLink href={program === "DP" ? "/portal/admin/day-program" : "/portal/admin/timesheets"}>
        {program === "DP" ? "Back to Day program" : "Back to Timesheets"}
      </BackLink>

      <h1 className="mt-4 text-3xl font-bold text-foreground">Calendar</h1>
      <p className="mt-1 text-sm text-muted">
        {batch.periodFrom} to {batch.periodTo} &middot; {rows.length} people &middot;{" "}
        {ptoTotal > 0 ? `${ptoTotal} hours of time off recorded` : "no time off recorded yet"}
      </p>
      <p className="mt-3 max-w-3xl text-sm text-muted">
        Worked hours come from the upload and cannot be edited here. Click any day to record
        time off against it. Time off is kept against the person and the pay period, so it
        survives a re-upload, and it is never added to worked hours or to overtime.
      </p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2">
              <th className="sticky left-0 z-10 bg-surface-2 px-3 py-2 text-left text-xs font-semibold text-muted">
                Employee
              </th>
              {dates.map((d) => (
                <th key={d} className="px-1 py-2 text-center text-[11px] font-semibold text-muted">
                  {d.slice(0, 5)}
                </th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-semibold text-muted">Time off</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const mine = dates.map((d) => ptoBy.get(`${r.userId}|${d}`));
              const tot = r2(mine.reduce((n, p) => n + (p?.hours || 0), 0));
              return (
                <tr key={r.key} className="border-t border-border">
                  <td className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-xs font-medium text-foreground">
                    {r.name}
                    {/* said plainly, because their row is empty for a reason */}
                    {r.noSheet && (
                      <span className="ml-2 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                        no timesheet
                      </span>
                    )}
                  </td>
                  {dates.map((d, i) => (
                    <td key={d} className="p-0.5 align-middle" style={{ minWidth: 58 }}>
                      <PtoCell
                        action={setPto}
                        program={program}
                        periodFrom={batch.periodFrom}
                        periodTo={batch.periodTo}
                        personKey={r.userId || ""}
                        date={d}
                        worked={r.worked.get(d) ? r2(r.worked.get(d)) : null}
                        pto={mine[i]?.hours ?? null}
                        ptoKind={mine[i]?.kind || "pto"}
                        reported={mine[i] ? null : reportedBy.get(`${r.userId}|${d}`) || null}
                        back={back}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right text-xs font-semibold text-foreground">
                    {tot > 0 ? tot : <span className="text-faint">&ndash;</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* a person with no account cannot hold a PTO row, because the row is
          keyed on the account. Saying so beats a cell that silently does
          nothing when it is clicked. */}
      {rows.some((r) => !r.userId) && (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          Some rows are not matched to a portal account yet, so time off cannot be recorded
          against them. Match them on the batch page first.
        </p>
      )}

      <Link
        href={`/portal/admin/timesheets/${batch.id}`}
        className="mt-6 inline-block rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
      >
        Back to this pay period &rarr;
      </Link>
    </section>
  );
}
