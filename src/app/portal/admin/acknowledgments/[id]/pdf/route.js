import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { isCompanyMeeting } from "@/lib/announcements";
import { renderAckReport } from "@/lib/ack-report-pdf";
import { audienceLabel, firstLine, fmtPosted } from "../../roster";
import { ackAuditPeople, ackStats, fileDate } from "../../audit";

// one announcement's acknowledgment record as a document: the post itself,
// then who acknowledged it - in portal or by email link - and when. built on
// demand so it can never disagree with the screen.
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const user = await getCurrentUser();
  // read-receipts are sensitive - Admin/IT/Super only, same gate as the page.
  if (!isAdminUp(user?.role)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { id } = await params;
  const p = await prisma.announcement.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      content: true,
      tag: true,
      deletedAt: true,
      publishedAt: true,
      requireAck: true,
      formId: true,
      ackEveryone: true,
      ackTitles: true,
      ackUserIds: true,
      acks: {
        select: {
          userId: true,
          viaEmail: true,
          recordedById: true,
          createdAt: true,
        },
      },
    },
  });
  if (!p || p.deletedAt || !p.publishedAt || !p.requireAck || isCompanyMeeting(p.tag)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const people = await ackAuditPeople(p);
  const stats = ackStats(people);
  const title = p.title || firstLine(p.content);

  let bytes;
  try {
    const out = await renderAckReport(
      {
        title,
        tag: p.tag,
        postedLabel: fmtPosted(p.publishedAt),
        audLabel: audienceLabel(p, stats.expected),
        content: p.content,
        hasForm: !!p.formId,
        stats,
        rows: people,
      },
      {
        generatedOn: new Date().toLocaleDateString("en-US", {
          timeZone: "America/Los_Angeles",
        }),
      },
    );
    bytes = out.bytes;
  } catch (e) {
    console.error("acknowledgment report pdf failed:", e);
    return new NextResponse("Could not build the report", { status: 500 });
  }

  const slug = title
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "announcement";
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="acknowledgments-${slug}-${fileDate()}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
