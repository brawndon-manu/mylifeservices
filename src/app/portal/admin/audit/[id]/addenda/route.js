import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { scheduleKey } from "@/lib/timesheet/schedule";
import { assembleAddenda, addendaReportModel, renderAddendaReport } from "@/lib/timesheet/addenda-report";
import { buildAudit } from "../build";

// The clock addenda of this pay period, as a PDF. Gated and generated on
// request like the flagged shifts report: the document IS the addenda as they
// stand, read off the same audit build the cards read, joined to the signed
// rows themselves for who signed, who approved and what was corrected.
export async function GET(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) return new NextResponse("Forbidden", { status: 403 });

  const audit = await buildAudit(id);
  if (!audit) return new NextResponse("Not found", { status: 404 });
  const batch = audit.batch;

  const ids = [...new Set(audit.rows.flatMap((r) => [r.amendment?.id, r.pending?.id]).filter(Boolean))];
  const details = new Map(
    (ids.length
      ? await prisma.clockAmendment.findMany({ where: { id: { in: ids } }, include: { approvedBy: { select: { name: true } } } })
      : []
    ).map((a) => [a.id, a]),
  );
  // LEGAL NAMES on the documents, and the role beside each person
  const titleOf = new Map();
  for (const u of await prisma.user.findMany({ select: { name: true, title: true } })) {
    const k = scheduleKey(u.name || "");
    if (k && u.title) titleOf.set(k, u.title);
  }
  // stamps in company time wherever the server is
  const stamp = (d) => (d ? new Date(d).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit" }) : null);
  const day = (d) => (d ? new Date(d).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit", year: "2-digit" }) : null);

  const { addenda, pending } = assembleAddenda({ rows: audit.rows, details, titleOf, stamp, day });
  const bytes = await renderAddendaReport(
    addendaReportModel({
      periodFrom: batch.periodFrom,
      periodTo: batch.periodTo,
      generatedOn: new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" }),
      addenda,
      pending,
    }),
  );
  const filename = `clock-addenda-${batch.periodFrom.replaceAll("/", "-")}-to-${batch.periodTo.replaceAll("/", "-")}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
