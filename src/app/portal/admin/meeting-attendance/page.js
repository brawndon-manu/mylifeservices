import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { preferredName } from "@/lib/contacts";
import BackLink from "@/components/BackLink";
import {
  ackAudienceWhere,
  COMPANY_MEETING_TAG,
  MEETING_FORMAT_LABELS,
} from "@/lib/announcements";
import { formatInstant } from "@/lib/meeting-time";
import AttendanceBoard from "./_components/AttendanceBoard";

export const metadata = {
  title: "Meeting attendance",
  robots: { index: false, follow: false },
};

// server-rendered, so it can't know each viewer's zone like the portal does.
// pin it to Pacific - ~all staff are in CA (same call the emails make).
const PACIFIC = "America/Los_Angeles";

export const dynamic = "force-dynamic";

function meetingIsPast(latestMs) {
  return latestMs != null && latestMs < Date.now();
}

// a plain, serializable person for the client board. optionId is set for a
// per-session row (multi/series) so roll-call marks that session; null on
// single-session / can't / no-response rows.
function toPerson(u) {
  return {
    id: u.id,
    displayName: preferredName(u),
    title: u.title || "",
    image: u.image || null,
    email: u.email || null,
    phone: u.phone || null,
    attended: u.attended || null,
    optionId: u.optionId || null,
    reason: u.reason || null,
  };
}

function fmtDate(iso, tz) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz || PACIFIC,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

function fmtSession(o) {
  if (!o?.at) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(o.at));
}

// build the going/can't/no-response roster for one meeting, grouped by series ->
// session where the meeting offers a series. mirrors the meeting detail page.
function buildRoster(m, audienceUsers, choices, responses) {
  const opts = Array.isArray(m.meetingOptions) ? m.meetingOptions : [];
  const audIds = new Set(audienceUsers.map((u) => u.id));
  const userById = new Map(audienceUsers.map((u) => [u.id, u]));
  const respByUser = new Map(
    responses.filter((r) => audIds.has(r.userId)).map((r) => [r.userId, r]),
  );
  const isGoing = (uid) => respByUser.has(uid) && !respByUser.get(uid).cantMakeIt;
  const goingUser = (uid) => ({
    ...userById.get(uid),
    attended: respByUser.get(uid)?.attended || null,
  });

  const bySession = opts.map((o) => ({
    id: o.id,
    label: o.label,
    dateLabel: fmtSession(o),
    going: choices
      .filter((c) => c.optionId === o.id && audIds.has(c.userId) && isGoing(c.userId))
      // attendance is per session now, so it reads from the choice row + the row
      // carries its optionId so the board marks the right session.
      .map((c) => ({ ...userById.get(c.userId), attended: c.attended || null, optionId: o.id }))
      .filter((u) => u.id)
      .map(toPerson),
  }));
  const singleGoing = opts.length
    ? []
    : audienceUsers.filter((u) => isGoing(u.id)).map((u) => toPerson(goingUser(u.id)));
  const noResponse = audienceUsers.filter((u) => !respByUser.has(u.id)).map(toPerson);
  const cantAll = audienceUsers
    .filter((u) => respByUser.get(u.id)?.cantMakeIt)
    .map((u) => toPerson({ ...u, reason: respByUser.get(u.id)?.reason || null }));

  const isSeries = opts.some((o) => o.seriesId);
  let seriesGroups = [];
  if (isSeries) {
    const order = [];
    const map = new Map();
    for (const s of bySession) {
      const opt = opts.find((o) => o.id === s.id);
      const sid = opt?.seriesId || "_";
      if (!map.has(sid)) {
        map.set(sid, { id: sid, label: opt?.seriesLabel || "Series", sessions: [], cant: [] });
        order.push(sid);
      }
      map.get(sid).sessions.push(s);
    }
    for (const c of choices) {
      if (
        typeof c.optionId === "string" &&
        c.optionId.startsWith("cant:") &&
        audIds.has(c.userId)
      ) {
        const sid = c.optionId.slice(5);
        if (map.has(sid)) {
          map.get(sid).cant.push(
            toPerson({ ...userById.get(c.userId), reason: respByUser.get(c.userId)?.reason || null }),
          );
        }
      }
    }
    seriesGroups = order.map((sid) => map.get(sid));
  }

  const seriesDecliners = new Set(
    choices
      .filter(
        (c) =>
          typeof c.optionId === "string" &&
          c.optionId.startsWith("cant:") &&
          audIds.has(c.userId),
      )
      .map((c) => c.userId),
  );

  const goingUsers = audienceUsers.filter((u) => isGoing(u.id));
  // present/absent tally: per-session for multi/series (count marked choice rows),
  // meeting-level for single-session (the response's own mark).
  const realGoingChoices = choices.filter(
    (c) =>
      !String(c.optionId).startsWith("cant:") &&
      audIds.has(c.userId) &&
      isGoing(c.userId),
  );
  const present = opts.length
    ? realGoingChoices.filter((c) => c.attended === "present").length
    : goingUsers.filter((u) => respByUser.get(u.id)?.attended === "present").length;
  const absent = opts.length
    ? realGoingChoices.filter((c) => c.attended === "absent").length
    : goingUsers.filter((u) => respByUser.get(u.id)?.attended === "absent").length;
  return {
    opts,
    isSeries,
    sessions: bySession,
    singleGoing,
    seriesGroups,
    noResponse,
    cantAll,
    goingCount: goingUsers.length,
    seriesCantCount: seriesDecliners.size,
    present,
    absent,
    responded: respByUser.size,
    invited: audienceUsers.length,
  };
}

export default async function MeetingAttendancePage() {
  const user = await getCurrentUser();
  // roster is sensitive (who's going / who didn't show) - Admin/IT/Super only,
  // same gate as each meeting's detail-page roster.
  if (!isAdminUp(user?.role)) {
    redirect("/portal");
  }

  const meetings = await prisma.announcement.findMany({
    where: { tag: COMPANY_MEETING_TAG, deletedAt: null, publishedAt: { not: null } },
    select: {
      id: true,
      title: true,
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

  const enriched = await Promise.all(
    meetings.map(async (m) => {
      const [audienceUsers, choices, responses] = await Promise.all([
        prisma.user.findMany({
          where: ackAudienceWhere(m),
          select: {
            id: true,
            name: true,
            preferredFirstName: true,
            preferredLastName: true,
            title: true,
            image: true,
            email: true,
            phone: true,
          },
          orderBy: [{ preferredFirstName: "asc" }, { name: "asc" }],
        }),
        prisma.announcementMeetingChoice.findMany({
          where: { announcementId: m.id },
          select: { userId: true, optionId: true, attended: true },
        }),
        prisma.announcementMeetingResponse.findMany({
          where: { announcementId: m.id },
          select: { userId: true, cantMakeIt: true, reason: true, attended: true },
        }),
      ]);
      const r = buildRoster(m, audienceUsers, choices, responses);

      const times = [];
      if (m.meetingAt) times.push(new Date(m.meetingAt).getTime());
      for (const o of r.opts) {
        const t = o?.at ? new Date(o.at).getTime() : NaN;
        if (!Number.isNaN(t)) times.push(t);
      }
      const earliest = times.length ? Math.min(...times) : null;
      const latest = times.length ? Math.max(...times) : null;

      const parts = [];
      if (r.opts.length) parts.push(`${r.opts.length} session${r.opts.length > 1 ? "s" : ""}`);
      if (earliest)
        parts.push(
          (r.opts.length ? "starts " : "") +
            formatInstant(new Date(earliest).toISOString(), PACIFIC),
        );
      else if (!r.opts.length) parts.push("No date set");
      if (m.meetingFormat) parts.push(MEETING_FORMAT_LABELS[m.meetingFormat]);

      const pct = r.invited > 0 ? Math.round((r.responded / r.invited) * 100) : 0;

      return {
        id: m.id,
        title: m.title || "(untitled meeting)",
        mandatory: m.meetingMandatory,
        isSeries: r.isSeries,
        seriesGroups: r.seriesGroups,
        sessions: r.sessions,
        singleGoing: r.singleGoing,
        noResponse: r.noResponse,
        cantAll: r.cantAll,
        goingCount: r.goingCount,
        seriesCantCount: r.seriesCantCount,
        present: r.present,
        absent: r.absent,
        responded: r.responded,
        invited: r.invited,
        pct,
        metaLine: parts.join(" · "),
        dueLabel: m.meetingResponseDueAt
          ? fmtDate(m.meetingResponseDueAt, m.meetingResponseDueTz)
          : null,
        sortKey: earliest ?? Number.MAX_SAFE_INTEGER,
        isPast: meetingIsPast(latest),
      };
    }),
  );

  const upcoming = enriched.filter((r) => !r.isPast).sort((a, b) => a.sortKey - b.sortKey);
  const past = enriched.filter((r) => r.isPast).sort((a, b) => b.sortKey - a.sortKey);
  const avg = enriched.length
    ? Math.round(enriched.reduce((s, r) => s + r.pct, 0) / enriched.length)
    : 0;

  return (
    <section className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin">Back to admin dashboard</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Admin
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Meeting attendance
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
        RSVP and roll-call rollups for every Company Meeting. Expand a meeting to
        drill into its series and sessions; open the meeting to take roll-call.
        Times shown in Pacific.
      </p>

      <AttendanceBoard
        upcoming={upcoming}
        past={past}
        counts={{
          total: enriched.length,
          upcoming: upcoming.length,
          past: past.length,
          avg,
        }}
      />
    </section>
  );
}
