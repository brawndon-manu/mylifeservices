import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { CORRECTION_KINDS, correctionEffect } from "@/lib/timesheet/corrections";
import CorrectionRow from "./CorrectionRow";
import RecomputeButton from "./RecomputeButton";

export const dynamic = "force-dynamic";

const fmt = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);

export default async function CorrectionsPage({ params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const { id } = await params;
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    select: { id: true, periodFrom: true, periodTo: true },
  });
  if (!batch) notFound();

  // every sheet in this batch that has something reported on it, open or not.
  // resolved ones stay visible: what was declined, and why, is the part you'd
  // want on hand if anyone ever asks about a figure.
  const sheets = await prisma.timesheet.findMany({
    where: { batchId: id, corrections: { some: {} } },
    include: {
      user: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
      corrections: {
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        include: {
          resolvedBy: {
            select: { name: true, preferredFirstName: true, preferredLastName: true },
          },
        },
      },
    },
    orderBy: { disputedAt: "desc" },
  });

  const openCount = sheets.reduce(
    (n, s) => n + s.corrections.filter((c) => c.status === "open").length,
    0,
  );

  return (
    <section className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href={`/portal/admin/timesheets/${id}`}
        className="text-sm text-muted underline underline-offset-4 hover:text-foreground"
      >
        Back to the batch
      </Link>

      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
        Reported problems
      </h1>
      <p className="mt-2 text-sm text-muted">
        {batch.periodFrom} to {batch.periodTo} ·{" "}
        {openCount === 0
          ? "nothing outstanding"
          : `${openCount} waiting on you`}
      </p>

      {sheets.length === 0 ? (
        <p className="mt-10 rounded-xl border border-border bg-surface p-6 text-sm text-muted">
          Nobody has reported a problem with this batch.
        </p>
      ) : (
        <div className="mt-8 space-y-6">
          {sheets.map((s) => {
            const who = s.user ? preferredName(s.user) : s.sourceName;
            const open = s.corrections.filter((c) => c.status === "open");
            const days = s.data?.days || [];
            const canRebuild =
              open.length === 0 &&
              days.length > 0 &&
              days.some((d) => Array.isArray(d.punches));

            return (
              <div
                key={s.id}
                className="rounded-xl border border-border bg-surface p-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{who}</h2>
                    <p className="text-sm text-muted">
                      {fmt(s.paidHours)} hrs · {fmt(s.premiumHours)} premium
                      {s.recomputedAt && " · recomputed"}
                    </p>
                  </div>
                  {open.length > 0 ? (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                      {open.length} open
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                      All handled
                    </span>
                  )}
                </div>

                <ul className="mt-4 space-y-3">
                  {s.corrections.map((c) => {
                    const day = days.find((d) => d.date === c.date) || null;
                    return (
                      <CorrectionRow
                        key={c.id}
                        correction={{
                          id: c.id,
                          date: c.date,
                          kind: c.kind,
                          label: CORRECTION_KINDS[c.kind]?.label || c.kind,
                          claimedHours: c.claimedHours,
                          note: c.note,
                          status: c.status,
                          resolutionNote: c.resolutionNote,
                          resolvedBy: c.resolvedBy ? preferredName(c.resolvedBy) : null,
                          effect: correctionEffect(c.kind, day, c.claimedHours),
                        }}
                        day={
                          day && {
                            paidHours: day.paidHours,
                            mealCount: day.mealCount,
                            restCount: day.restCount,
                            restRequired: day.restRequired,
                            mealViolation: day.mealViolation,
                            restViolation: day.restViolation,
                          }
                        }
                      />
                    );
                  })}
                </ul>

                {open.length === 0 && (
                  <div className="mt-5 border-t border-border pt-4">
                    {canRebuild ? (
                      <RecomputeButton
                        timesheetId={s.id}
                        accepted={s.corrections.filter((c) => c.status === "accepted").length}
                      />
                    ) : (
                      <p className="text-sm text-muted">
                        This batch was uploaded before corrections existed, so
                        there&apos;s no punch detail to rebuild the sheet from.
                        Re-upload the period to correct it here.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
