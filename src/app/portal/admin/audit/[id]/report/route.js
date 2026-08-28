import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { scheduleKey } from "@/lib/timesheet/schedule";
import { flagReportModel, renderFlagReport } from "@/lib/timesheet/flag-report";

// The flagged shifts of this pay period, as a PDF. Gated and generated on
// request like the other document routes - nothing is stored, because the
// report IS the current decisions and a stored copy would go stale the moment
// one changed.
export async function GET(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    select: { periodFrom: true, periodTo: true },
  });
  if (!batch) return new NextResponse("Not found", { status: 404 });

  // THE DECISIONS ARE KEYED TO SHIFTS, NOT TO THIS BATCH, so the period's
  // flags are the flagged rows whose day falls inside it - the same rule the
  // audit page reads them by.
  const dayKey = (d) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(d || "");
    return m ? Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]) : 0;
  };
  const from = dayKey(batch.periodFrom);
  const to = dayKey(batch.periodTo);
  const decisions = (await prisma.shiftReview.findMany({
    include: { decidedBy: { select: { name: true, preferredFirstName: true, preferredLastName: true } } },
  })).filter((r) => dayKey(r.date) >= from && dayKey(r.date) <= to);
  const flagged = decisions.filter((r) => r.decision === "flagged");
  const approved = decisions.filter((r) => r.decision === "approved");

  // the stored employeeKey is the normalised legal spelling; the report prints
  // the name the portal calls them
  const staff = await prisma.user.findMany({
    select: { name: true, preferredFirstName: true, preferredLastName: true },
  });
  const nameOf = new Map();
  for (const u of staff) {
    const k = scheduleKey(u.name || "");
    if (k) nameOf.set(k, preferredName(u));
  }

  const day = (dt) => {
    const d = new Date(dt);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  };

  const model = flagReportModel({
    periodFrom: batch.periodFrom,
    periodTo: batch.periodTo,
    generatedOn: day(new Date()),
    // the approved carry only what their compact section prints
    approved: approved.map((r) => ({
      who: nameOf.get(r.employeeKey) || r.employeeKey,
      billedMin: r.billedMin,
    })),
    flags: flagged.map((r) => ({
      who: nameOf.get(r.employeeKey) || r.employeeKey,
      date: r.date,
      startMin: r.startMin,
      client: r.client,
      service: r.service,
      billedMin: r.billedMin,
      clockedMin: r.clockedMin,
      reason: r.reason,
      decidedByName: r.decidedBy ? preferredName(r.decidedBy) : null,
      decidedOn: day(r.updatedAt),
    })),
  });

  const bytes = await renderFlagReport(model);
  const filename = `flagged-shifts-${batch.periodFrom.replaceAll("/", "-")}-to-${batch.periodTo.replaceAll("/", "-")}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
