import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { supersededBy } from "@/lib/timesheet/superseded";
import { batchPeriodLabels } from "@/lib/timesheet/batch-overview";
import BackLink from "@/components/BackLink";
import { approveTimesheet } from "../actions";
import ApprovalsList from "./ApprovalsList";

// EVERY SHEET WAITING FOR THE APPROVAL LINE, IN ONE PLACE.
//
// The approval is signed one sheet at a time on the sheet's own page, which is
// right when there are three of them and wrong when there are fifty one: the
// same signature, drawn again, fifty one times. This draws it once and stamps
// the sheets left ticked.
//
// WHAT IT WILL NOT OFFER, and each of these is a rule rather than a filter for
// tidiness:
//
//   - A sheet the employee has not signed. approveTimesheet refuses one anyway
//     ("approving something the employee hasn't signed would put management's
//     signature on an unattested document"), and it must not be on a list whose
//     whole point is one press.
//   - Nothing on the approver's own behalf BY DEFAULT. His sheet is on the list
//     at his word, so whoever else works this page can sign it off, but the
//     viewer's own row never starts ticked: a press aimed at a fortnight must
//     not approve the presser's own timesheet on the way past.
//   - Anything on a REPLACED upload. approveTimesheet has no superseded guard of
//     its own - it is reached from a page you can only open per sheet - so the
//     check lives here, and a batch that has been re-uploaded never appears.
//
// AND OLDER PERIODS ARE SHOWN BUT NEVER TICKED. 64 sheets from 08/01-08/15 are
// signed and unapproved, on batches that were never superseded, so they are
// genuinely waiting and hiding them would be the wrong answer. Ticking them by
// default would be worse: a page whose whole point is one press would sweep up a
// month of history that was left alone on purpose. Only the CURRENT period per
// program starts selected; anything older has to be ticked by hand.
export const dynamic = "force-dynamic";
export const metadata = { title: "Approvals", robots: { index: false, follow: false } };

export default async function ApprovalsPage() {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const waiting = await prisma.timesheet.findMany({
    where: {
      signedAt: { not: null },
      approvedAt: null,
    },
    select: {
      id: true, sourceName: true, paidHours: true, premiumHours: true,
      otHours: true, signedAt: true, signedName: true, userId: true,
      signedPdfUrl: true, pdfUrl: true, batchId: true,
      batch: { select: { id: true, program: true, periodFrom: true, periodTo: true, createdAt: true } },
      corrections: { select: { kind: true, status: true } },
    },
    orderBy: [{ sourceName: "asc" }],
  });

  // one superseded check per BATCH, not per sheet - fifty one sheets share a
  // handful of uploads between them
  const batchIds = [...new Set(waiting.map((t) => t.batchId))];
  const replaced = new Set();
  const bestAt = new Map();
  await Promise.all(batchIds.map(async (id) => {
    if (await supersededBy(id)) replaced.add(id);
  }));

  // THE PERIOD BEING WORKED, per program: the newest upload that has not been
  // replaced. Everything older is history somebody chose to leave.
  const currentBatch = new Map();
  for (const t of waiting) {
    if (replaced.has(t.batchId)) continue;
    const key = t.batch.program || "MLS";
    const best = currentBatch.get(key);
    if (!best || t.batch.createdAt > bestAt.get(key)) {
      currentBatch.set(key, t.batchId);
      bestAt.set(key, t.batch.createdAt);
    }
  }

  const claimsOf = (rows) => rows.filter((c) => {
    const k = String(c.kind || "");
    return !k.startsWith("q_") && !k.startsWith("fix_") && k !== "time_off";
  });

  const rows = waiting
    .filter((t) => !replaced.has(t.batchId))
    // a sheet with no file has nowhere to put a signature; approveTimesheet
    // answers "nofile" and the row would only ever fail
    .filter((t) => !!(t.signedPdfUrl || t.pdfUrl))
    .map((t) => {
      const claims = claimsOf(t.corrections);
      return {
        id: t.id,
        name: t.sourceName,
        hours: t.paidHours ?? 0,
        premium: t.premiumHours ?? 0,
        ot: t.otHours ?? 0,
        signedAtLabel: new Date(t.signedAt).toLocaleDateString("en-US", {
          month: "short", day: "numeric", timeZone: "America/Los_Angeles",
        }),
        signedName: t.signedName || null,
        accepted: claims.filter((c) => c.status === "accepted").length,
        declined: claims.filter((c) => c.status === "declined").length,
        group: `${t.batch.program === "DP" ? "Day Program" : "ILS"} · ${batchPeriodLabels(t.batch.periodFrom, t.batch.periodTo).title}`,
        batchId: t.batchId,
        // the newest live upload for this program is the period being worked
        current: currentBatch.get(t.batch.program || "MLS") === t.batchId,
        // the viewer's own sheet: listed, never ticked for them
        mine: !!t.userId && t.userId === user.id,
      };
    });

  // groups in a stable order: program, then period
  const byGroup = new Map();
  for (const r of rows) {
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group).push(r);
  }
  const groups = [...byGroup]
    .map(([name, list]) => ({ name, rows: list, current: list.some((r) => r.current) }))
    // the period being worked first, then the rest
    .sort((a, b) => (b.current === true) - (a.current === true) || a.name.localeCompare(b.name));

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <BackLink href="/portal/admin/timesheets">Back to Timesheets</BackLink>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">Approvals</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        Every signed timesheet still waiting for the approval line. Your signature
        is drawn once and stamped onto each sheet you leave ticked, with today&apos;s
        date and your name above it.
      </p>

      <ApprovalsList
        groups={groups}
        approve={approveTimesheet}
        // THE LEGAL NAME, BECAUSE THAT IS WHAT THE STAMP PRINTS. approveTimesheet
        // draws `user.name` above the line and the single-sheet approve page
        // labels itself with the same field. This said the preferred name for one
        // night: the documents were right and the sentence over them was wrong,
        // which is worse than either - it described a payroll document
        // incorrectly at the moment somebody was deciding to sign 41 of them.
        approverName={user?.name || ""}
      />

      <p className="mt-8 text-xs leading-relaxed text-faint">
        Your own timesheet is listed so somebody else can sign it off, but it is
        never ticked for you. A sheet the employee has not signed is never listed,
        nor one on an upload that has since been replaced.
      </p>
    </section>
  );
}
