import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import BackLink from "@/components/BackLink";
import { reviewChoices } from "@/lib/timesheet/qsp-changes";
import { timeOffReviewItems } from "@/lib/timesheet/time-off";
import { markQspEntry } from "@/app/portal/admin/timesheets/actions";
import QspDesk from "./QspDesk";
// the batch's ONE presence system, mounted in the layout - faces, hover, and
// the version poll that makes marks and approvals live are all already
// running for this screen; the bar only puts the faces on it
import { PresenceBar } from "../Presence";

export const dynamic = "force-dynamic";
export const metadata = { title: "QuickSolve corrections", robots: { index: false, follow: false } };

// THE CORRECTIONS DESK, 2026-09-02. Every signed review that left entries to
// change in QuickSolve, one card per person, worked live: mark each entry as
// it is keyed in, sign the review off once every one is marked, and new
// signatures appear as they land - the same items both review emails carry,
// from the same derivation, so this screen and the office's inbox can never
// disagree about what is owed.
//
// The people whose reviews left NOTHING to enter are here too, on Mánu's
// instruction - a desk that hides them reads as work still coming.
export default async function QspDeskPage({ params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");
  const { id } = await params;

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    select: {
      id: true, periodFrom: true, periodTo: true,
      timesheets: {
        where: { signedAt: { not: null } },
        orderBy: { signedAt: "desc" },
        select: {
          id: true, sourceName: true, signedAt: true,
          approvedAt: true,
          approvedBy: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
          user: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
          corrections: {
            where: { status: { not: "open" } },
            select: {
              id: true, kind: true, date: true, status: true, choice: true,
              statedBreaks: true, question: true, timeOff: true,
              qspMarks: { select: { fact: true, byName: true, createdAt: true } },
            },
          },
        },
      },
    },
  });
  if (!batch) notFound();

  const fmt = (d) =>
    new Date(d).toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });

  const rows = batch.timesheets.map((t) => {
    const marksByRow = new Map(
      t.corrections.map((c) => [c.id, new Map(c.qspMarks.map((m) => [m.fact, m]))]),
    );
    const items = [...reviewChoices(t.corrections), ...timeOffReviewItems(t.corrections)]
      .map((it) => ({
        date: it.date,
        said: it.said || null,
        correctionId: it.correctionId,
        changes: it.changes.map((ch) => {
          const m = marksByRow.get(it.correctionId)?.get(ch.fact) || null;
          return {
            fact: ch.fact,
            action: ch.action,
            mark: m ? { byName: m.byName, when: fmt(m.createdAt) } : null,
          };
        }),
      }));
    const owed = items.reduce((n, it) => n + it.changes.length, 0);
    return {
      timesheetId: t.id,
      name: (t.user ? preferredName(t.user) : null) || t.sourceName,
      signedAtLabel: fmt(t.signedAt),
      signedAtMs: new Date(t.signedAt).getTime(),
      approved: t.approvedAt
        ? { byName: t.approvedBy ? preferredName(t.approvedBy) : null, when: fmt(t.approvedAt) }
        : null,
      items,
      owed,
      marked: items.reduce((n, it) => n + it.changes.filter((ch) => ch.mark).length, 0),
      answers: items.length,
    };
  });

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <BackLink href={`/portal/admin/timesheets/${batch.id}`}>Back to this pay period</BackLink>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
        Corrections to make in QuickSolve
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        Every signed review, one card per person, with their signed timesheet
        linked on the card. Mark each entry as it is added in QuickSolve.
        Review and approve opens the same approval the pay period uses, and an
        approved review with entries still to add shows exactly that. New
        signatures appear here as they land.
      </p>
      <p className="mt-1 text-sm text-muted">{batch.periodFrom} to {batch.periodTo}</p>

      <PresenceBar />
      <QspDesk rows={rows} mark={markQspEntry} viewerName={preferredName(user)} />
    </section>
  );
}
