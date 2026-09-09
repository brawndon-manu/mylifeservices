import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { splitSourceName } from "@/lib/timesheet/people-sort";
import { CORRECTION_KINDS, correctionEffect } from "@/lib/timesheet/corrections";
// minutes -> "08:00 AM", the same words the employee typed them as
import { breaksAgainstSlots, droppedBreakLabel } from "@/lib/timesheet/work-slots";
import { TIME_OFF_KIND } from "@/lib/timesheet/time-off";
import ReportedIssues from "./ReportedIssues";
import { shiftsOf } from "@/lib/timesheet/questions";

export const dynamic = "force-dynamic";

const iso = (date) => date?.toISOString() || null;

export default async function CorrectionsPage({ params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const { id } = await params;
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    select: { id: true, periodFrom: true, periodTo: true, program: true },
  });
  if (!batch) notFound();

  // every sheet in this batch that has something reported on it, open or not.
  // resolved ones stay visible: what was declined, and why, is the part you'd
  // want on hand if anyone ever asks about a figure.
  //
  // NOT the `q_` rows. Those are the five questions asked before signing, and
  // they are a different workflow: they are never "open", they are already
  // answered by the time they exist, and there is nothing here for anyone to
  // accept or reject. Left in, they would list every confirmation on this
  // screen under a raw "q_repair" label and bury the reports that do need a
  // decision. They surface on the batch list and on the employee's own page.
  //
  // AND NOT THE TIME-OFF ANSWER. The day program's card writes its answer as
  // a correction row so it survives and rides the emails - status "noted", a
  // vocabulary this desk does not speak, so every "No time off" answer was
  // rendering here as a raw time_off tag under a Declined chip (Mánu
  // 2026-09-03: "why is this showing up in the issues reported"). A claim's
  // actionable surface is the batch calendar's amber cell and its Accept,
  // and a "no" needs nothing from anyone.
  const NOT_A_QUESTION = {
    AND: [
      { kind: { not: { startsWith: "q_" } } },
      { kind: { not: TIME_OFF_KIND } },
    ],
  };
  const sheets = await prisma.timesheet.findMany({
    where: { batchId: id, corrections: { some: NOT_A_QUESTION } },
    include: {
      user: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
      corrections: {
        where: NOT_A_QUESTION,
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

  const reports = sheets.map((s) => {
    const days = s.data?.days || [];
    const originalDays = s.data?.daysOriginal || days;
    const source = splitSourceName(s.sourceName);
    return {
      id: s.id,
      name: s.user ? preferredName(s.user) : [source.first, source.last].filter(Boolean).join(" "),
      paidHours: s.paidHours,
      premiumHours: s.premiumHours,
      recomputedAt: iso(s.recomputedAt),
      sentAt: iso(s.sentAt),
      signedAt: iso(s.signedAt),
      approvedAt: iso(s.approvedAt),
      canRebuild: originalDays.some((d) => Array.isArray(d.punches)),
      corrections: s.corrections.map((c) => {
        const day = days.find((d) => d.date === c.date) || null;
        const original = originalDays.find((d) => d.date === c.date) || null;
        return {
          id: c.id, date: c.date, kind: c.kind,
          label: CORRECTION_KINDS[c.kind]?.label || "Reported issue",
          claimedHours: c.claimedHours,
          statedSlots: Array.isArray(c.statedSlots) ? c.statedSlots.map(({ from, to }) => ({ from, to })) : [],
          statedTimes: Array.isArray(c.statedBreaks)
            ? c.statedBreaks.filter((b) => b?.from && b?.to).map((b) => `${b.from} to ${b.to}`) : [],
          strandedBreaks: Array.isArray(c.statedSlots) && c.statedSlots.length && day
            ? breaksAgainstSlots(day.breaks, c.statedSlots).dropped.map(droppedBreakLabel) : [],
          note: c.note, status: c.status, resolutionNote: c.resolutionNote,
          resolvedBy: c.resolvedBy ? preferredName(c.resolvedBy) : null,
          createdAt: iso(c.createdAt), resolvedAt: iso(c.resolvedAt),
          effect: correctionEffect(c.kind, c.status === "open" ? day : original, c.claimedHours),
          original: original ? {
            paidHours: original.paidHours, slots: shiftsOf(original),
            mealCount: original.mealCount, restCount: original.restCount,
            restRequired: original.restRequired,
            mealViolation: original.mealViolation, restViolation: original.restViolation,
          } : null,
        };
      }),
    };
  });

  return <ReportedIssues batch={batch} sheets={reports} />;
}
