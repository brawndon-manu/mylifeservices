import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import BackLink from "@/components/BackLink";
import { amendmentStage, STAGE_LABELS, stageLine, missingPunchText, hasServiceNote, firstLast } from "@/lib/clock-amendment/rules";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clock addenda", robots: { index: false, follow: false } };

// THE ONES THAT HAVE BEEN RAISED, AND WHERE EACH ONE IS.
//
// Raised by hand: somebody tells the office they could not clock in or out, and
// the office raises one. Nothing here goes looking through the clock export -
// this list is what has been asked for, not what might need asking about.
//
// GROUPED BY STAGE rather than by date, because the stage is the only thing
// anybody acts on.
//
// WAITING ON THEM FIRST. The whole risk of this feature is a form raised and
// never returned: the hours stay billed either way, so a row nobody chases is a
// billed hour with no record behind it, which is the exact thing this exists to
// prevent.
const STAGE_ORDER = ["filled", "sent", "draft", "approved"];

export default async function ClockAmendmentsPage() {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const rows = await prisma.clockAmendment.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    select: {
      id: true, clientName: true, service: true, shiftDate: true,
      scheduledIn: true, scheduledOut: true, clockedIn: true, clockedOut: true,
      dsnStart: true, dsnEnd: true,
      sentAt: true, filledAt: true, approvedAt: true, clientSignedAt: true, clientUnavailableReason: true,
      testOnly: true, demo: true, chaseCount: true, clockRow: true,
      createdAt: true,
      staff: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
      recipient: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
    },
  });

  const shown = (u) =>
    [u?.preferredFirstName, u?.preferredLastName].filter(Boolean).join(" ") || u?.name || "(unnamed)";

  const byStage = new Map(STAGE_ORDER.map((s) => [s, []]));
  for (const r of rows) byStage.get(amendmentStage(r))?.push(r);

  return (
    <section className="mx-auto max-w-5xl px-6 py-10">
      <BackLink href="/portal/admin">Back to Admin</BackLink>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Clock addenda</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            A shift the clock record cannot account for on its own. The person who worked it, or
            their supervisor, says what the times were and why the clock is wrong, and the person
            served signs for the visit.
          </p>
        </div>
        <Link
          href="/portal/admin/clock-amendments/new"
          className="min-h-[44px] shrink-0 rounded-[9px] bg-brand px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          New addendum
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-xl border border-border bg-surface px-5 py-8 text-center">
          <p className="text-sm font-medium text-foreground">Nothing raised yet.</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted">
            When somebody tells you they could not clock out, raise one here. It carries what we
            already hold about the shift, so they confirm it rather than write it out again.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-7">
          {STAGE_ORDER.map((stage) => {
            const list = byStage.get(stage) || [];
            if (!list.length) return null;
            return (
              <div key={stage}>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-[13px] font-semibold text-foreground">{STAGE_LABELS[stage]}</h2>
                  <span className="text-xs tabular-nums text-muted">{list.length}</span>
                </div>
                <ul className="mt-2 divide-y divide-sep overflow-hidden rounded-xl border border-border bg-surface">
                  {list.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/portal/admin/clock-amendments/${r.id}`}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition hover:bg-fill"
                      >
                        <span className="min-w-[150px] flex-none text-[13px] font-semibold text-foreground">
                          {shown(r.staff)}
                        </span>
                        <span className="min-w-0 flex-1 text-[13px] text-muted">
                          {firstLast(r.clientName)}
                          <span className="ml-2 text-xs text-faint">{r.service}</span>
                        </span>
                        {r.testOnly && (
                          <span className="flex-none rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                            {r.demo ? "demo" : "rehearsal"}
                          </span>
                        )}
                        <span className="flex-none font-mono text-[11.5px] text-muted">
                          {r.shiftDate}
                        </span>
                        {/* WHAT IS WRONG WITH THE CLOCK RECORD, said on the row, so
                            the pile can be read without opening anything */}
                        <span className="flex-none rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                          {missingPunchText(r)}
                        </span>
                        {/* and whether their own service note already answers it */}
                        {hasServiceNote(r) && (
                          <span className="flex-none rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                            note on file
                          </span>
                        )}
                        <span className="flex-none text-right text-[11.5px] text-faint">
                          {stageLine(r)}
                          {stage !== "approved" && <> · to {shown(r.recipient)}</>}
                          {r.chaseCount > 0 && <> · reminded {r.chaseCount}×</>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-8 max-w-2xl text-xs leading-relaxed text-faint">
        The approved document is emailed to the office and to the staff member, and kept on the record here.
      </p>
    </section>
  );
}
