import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { ackAudienceWhere, isCompanyMeeting } from "@/lib/announcements";
import { officeFromSearch } from "@/lib/positions";
import { buildRoster, meetingMeta } from "../../roster";
import { renderAttendanceReport } from "@/lib/meeting-attendance-pdf";

// the attendance board as a document. Same roster build as the page, so the
// print can never disagree with the screen; this route is the auth in front
// of the renderer.
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  // roster is sensitive - same gate as the board itself
  if (!isAdminUp(user?.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const m = await prisma.announcement.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      tag: true,
      deletedAt: true,
      publishedAt: true,
      meetingFormat: true,
      meetingMandatory: true,
      meetingAt: true,
      meetingOptions: true,
      meetingResponseDueAt: true,
      meetingResponseDueTz: true,
      ackEveryone: true,
      ackTitles: true,
      ackUserIds: true,
    },
  });
  if (!m || m.deletedAt || !m.publishedAt || !isCompanyMeeting(m.tag)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const office = officeFromSearch(
    Object.fromEntries(new URL(req.url).searchParams),
  );

  const [audienceUsers, choices, responses] = await Promise.all([
    prisma.user.findMany({
      where: {
        ...ackAudienceWhere(m),
        ...(office ? { offices: { has: office } } : {}),
      },
      select: {
        id: true,
        name: true,
        preferredFirstName: true,
        preferredLastName: true,
        title: true,
        offices: true,
      },
      orderBy: [{ preferredFirstName: "asc" }, { name: "asc" }],
    }),
    prisma.announcementMeetingChoice.findMany({
      where: { announcementId: m.id },
      select: { userId: true, optionId: true, attended: true },
    }),
    prisma.announcementMeetingResponse.findMany({
      where: { announcementId: m.id },
      select: { userId: true, cantMakeIt: true, reason: true, attended: true, viaEmail: true },
    }),
  ]);

  const r = buildRoster(m, audienceUsers, choices, responses);
  const meta = meetingMeta(m, r);
  const slimP = (p) => ({ name: p.displayName, title: p.title, attended: p.attended, reason: p.reason });

  let bytes;
  try {
    const out = await renderAttendanceReport(
      {
        meetingTitle: m.title,
        mandatory: !!m.meetingMandatory,
        metaLine: meta.metaLine,
        office: office || null,
        stats: {
          invited: r.invited,
          responded: r.responded,
          pct: meta.pct,
          going: r.goingCount,
          cantLabel: r.isSeries ? "Can't attend a series" : "Can't make it",
          cantCount: r.isSeries ? r.seriesCantCount : r.cantAll.length,
          noResponseCount: r.noResponse.length,
          present: r.present,
          absent: r.absent,
          unmarked: r.summary.unmarked,
          // marks exist or the meeting is over - matches the board's stat strip
          showRollCall: meta.isPast || r.present > 0 || r.absent > 0,
        },
        single: r.hasSessions ? null : r.singleGoing.map(slimP),
        groups: r.isSeries
          ? r.seriesGroups.map((g) => ({
              heading: g.label,
              sessions: g.sessions.map((s) => ({
                label: s.label,
                dateLabel: s.dateLabel,
                people: s.going.map(slimP),
              })),
              cant: g.cant.map(slimP),
            }))
          : r.hasSessions
            ? [
                {
                  heading: null,
                  sessions: r.sessions.map((s) => ({
                    label: s.label,
                    dateLabel: s.dateLabel,
                    people: s.going.map(slimP),
                  })),
                  cant: [],
                },
              ]
            : [],
        // a series meeting's per-series decliners already print inside their
        // series block - the flat list is for single/multi meetings
        cantAll: r.isSeries ? [] : r.cantAll.map(slimP),
        noResponse: r.noResponse.map(slimP),
      },
      {
        generatedOn: new Date().toLocaleDateString("en-US", {
          timeZone: "America/Los_Angeles",
        }),
      },
    );
    bytes = out.bytes;
  } catch (e) {
    console.error("attendance pdf failed:", e);
    return new NextResponse("Could not build the report", { status: 500 });
  }

  const slug = (m.title || "meeting")
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="meeting-attendance-${slug}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
