import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp, canManageTimesheets } from "@/lib/roles";
import AuditCards from "./AuditCards";
import { buildAudit } from "./build";
import { prisma } from "@/lib/prisma";
import { scheduleKey } from "@/lib/timesheet/schedule";

export const metadata = { title: "Audit", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// THE THREE RECORDS OF ONE SHIFT, LINED UP.
//
// The roster says what was billed, the clock export says what was worked, and
// the service note says what was documented. They come from three separate
// uploads and are joined in ./build.js on the person and the day - shared with
// the client-hours report route, so the document can never disagree with the
// screen.
//
// Nothing on this page changes an hour, a premium or a signed timesheet. It
// reports what three documents say and ranks the disagreements for a person to
// read - see the note at the top of note-audit.js for why none of these rules
// concludes anything on its own.
export default async function AuditBatchPage({ params }) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");

  const { id } = await params;
  const data = await buildAudit(id);
  if (!data) notFound();
  const { batch, rows, lost, orphans, notesCount, clockLoaded, periodLabels, authorized, authMonthLabel, hasAuthorizations } = data;

  // the deck prints the employee's role beside the name - resolved by the
  // schedule key the rows already carry, exactly like the flagged report
  const staff = await prisma.user.findMany({
    where: { deactivatedAt: null },
    select: { name: true, title: true },
  });
  const titles = {};
  for (const u of staff) {
    const k = scheduleKey(u.name || "");
    if (k && u.title) titles[k] = u.title;
  }

  return (
      <AuditCards
        batchId={batch.id}
        periodLabel={`${batch.periodFrom} to ${batch.periodTo}`}
        canUpload={canManageTimesheets(user?.role)}
        rows={rows}
        titles={titles}
        orphans={orphans}
        lost={lost}
        authorized={hasAuthorizations ? authorized : null}
        authMonthLabel={authMonthLabel}
        periods={periodLabels}
        totals={{
          notes: notesCount,
          shifts: rows.length,
          clocked: clockLoaded,
          orphans: orphans.length,
          // which of the two service notes reports this period actually got.
          // Neither is complete on its own, so a period holding one of them is
          // a period whose "no service note" count is partly about the file.
          fromPdf: batch.serviceNotes?.pdfCount || 0,
          fromXls: batch.serviceNotes?.serviceCount || 0,
          notesName: batch.notesName || null,
          serviceNotesName: batch.serviceNotesName || null,
        }}
      />
  );
}

