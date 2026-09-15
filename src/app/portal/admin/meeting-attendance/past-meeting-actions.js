"use server";

// ADDING A MEETING THAT ALREADY HAPPENED.
//
// Mánu 2026-09-14: the meetings before the portal were kept on paper or in a
// Google Doc, and their attendance has to come in somewhere. Attendance only
// ever exists against an announcement - `AnnouncementMeetingResponse.attended`
// and `AnnouncementMeetingChoice.attended` are the only places a present/absent
// mark lives - so a record has to BE one.
//
// It is not created through the announcement form on purpose. That form
// hard-rejects a meeting with no body and no audience, wants a format and a
// kind, and then the attendance is two writes per person afterwards. Somebody
// typing up an old sign-in sheet is already on the attendance page, so the
// whole record is made here in one submit.
//
// SERIES ARE THE NORMAL CASE, not the exception. Both real multi-date meetings
// are built this way: "Scheduling, Attendance & QSP Documentation Retraining"
// is 2 series ("Week 1", "Week 2") of 2 sessions each, and staff pick one of
// the two. The old ones were run the same way, with a sign-in sheet per date.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { COMPANY_MEETING_TAG, isValidMeetingKind } from "@/lib/announcements";
import { sortSessionOptions } from "@/lib/meeting-slots";
import { zonedToInstant } from "@/lib/meeting-time";
import { resolveAttachments } from "@/lib/announcement-attach-server";

const BACK = "/portal/admin/meeting-attendance";
const PACIFIC = "America/Los_Angeles";

// NOON, AND THE SCREENS PRINT THE DATE ONLY. The old record says which day, it
// almost never says which hour, and midnight would print "12:00 AM" as though
// somebody had held a meeting then. Noon is a placeholder the reader never
// sees, because meetingMeta drops the time for a backfill.
const RECORDED_AT_HOUR = "12:00";

// a record of a handful of dates, not a booking calendar. The signing meeting
// has 100 slots because staff were picking from a month of half hours; nobody
// is typing that up from paper.
const MAX_SERIES = 12;
const MAX_SESSIONS = 40;

const clean = (v, max) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : "";
};

const parseJson = (raw, fallback) => {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch {
    return fallback;
  }
};

// THE SESSIONS, AS THE REST OF THE SITE ALREADY STORES THEM. Same option shape
// the announcement form writes, so buildRoster, the scheduling view, the board
// and the report all read a backfilled series exactly as they read a live one -
// no second code path anywhere.
//
// A series carries a label; a bare list of dates does not. `isSeries` is
// `opts.some(o => o.seriesId)`, so leaving seriesId null on an unnamed group is
// what keeps a plain two-date meeting from rendering as a one-series meeting
// with no name.
function buildOptions(rawSeries) {
  const out = [];
  const groups = Array.isArray(rawSeries) ? rawSeries.slice(0, MAX_SERIES) : [];
  for (const g of groups) {
    const label = clean(g?.label, 80);
    const seriesId = label ? randomUUID() : null;
    const dates = Array.isArray(g?.sessions) ? g.sessions : [];
    let n = 0;
    for (const sRaw of dates) {
      const date = clean(sRaw?.date, 10);
      const at = zonedToInstant(date, RECORDED_AT_HOUR, PACIFIC);
      if (!at) continue;
      n += 1;
      out.push({
        // ids are minted HERE, never taken off the form. The client's own ids
        // only ever key the attendance map it posts alongside; letting one
        // through would put a value somebody typed into a stored record.
        id: randomUUID(),
        clientId: String(sRaw?.id || ""),
        at,
        tz: PACIFIC,
        label: `Session ${n}`,
        capacity: null,
        seriesId,
        seriesLabel: label || null,
        zoomLink: null,
        zoomCode: null,
        durationFromMin: null,
        durationToMin: null,
      });
      if (out.length >= MAX_SESSIONS) return out;
    }
  }
  return out;
}

export async function createPastMeeting(formData) {
  const user = await getCurrentUser();
  // the same gate the attendance board itself has - a roster is sensitive
  if (!isAdminUp(user?.role)) redirect("/portal");

  const title = clean(formData.get("title"), 200);
  if (!title) redirect(`${BACK}?error=title`);

  const withIds = buildOptions(parseJson(formData.get("sessions"), []));
  if (!withIds.length) redirect(`${BACK}?error=date`);

  // a meeting being RECORDED is a meeting that already happened. A future date
  // is a typo, and it would land the record in Upcoming where somebody waits
  // for it.
  if (withIds.some((o) => new Date(o.at).getTime() > Date.now())) {
    redirect(`${BACK}?error=future`);
  }

  // the client keyed its marks by its own session ids; map them onto ours
  const idFor = new Map(withIds.map((o) => [o.clientId, o.id]));
  const options = sortSessionOptions(withIds.map(({ clientId, ...rest }) => rest));
  const single = options.length === 1;

  // { <client session id>: { <userId>: "present" | "absent" } }
  const rawMarks = parseJson(formData.get("attendance"), {});
  const marks = [];
  for (const [clientId, perPerson] of Object.entries(rawMarks || {})) {
    const optionId = idFor.get(clientId);
    if (!optionId || !perPerson || typeof perPerson !== "object") continue;
    for (const [userId, status] of Object.entries(perPerson)) {
      if (status !== "present" && status !== "absent") continue;
      marks.push({ optionId, userId: String(userId), status });
    }
  }

  // EVERY NAME ON THE RECORD, AND THERE HAS TO BE ONE.
  //
  // Not a nicety. ackAudienceWhere reads an EMPTY ackUserIds as "everyone" -
  // `post.ackEveryone || (!ackTitles.length && !ackUserIds.length)` - so a
  // record saved with nobody on it would not show an empty roster, it would
  // show all active staff as the meeting's audience. That is the exact thing
  // this feature is built not to claim: nobody knows who was invited to a
  // meeting that ran on paper, only who the sheet says turned up.
  const wanted = [...new Set(marks.map((m) => m.userId))];
  if (!wanted.length) redirect(`${BACK}?error=nobody`);

  // THE IDS HAVE TO BE REAL, BUT NOT NECESSARILY STILL HERE. Never trusted off
  // the form - but a record of a June meeting names people who have since left,
  // and five of them are on these lists. Dropping a departed person would make
  // the record quietly disagree with the email it was typed from. The roster
  // reads them back the same way, through ackAudienceWhere's includeInactive.
  const found = await prisma.user.findMany({
    where: { id: { in: wanted } },
    select: { id: true },
  });
  const valid = new Set(found.map((u) => u.id));
  const kept = marks.filter((m) => valid.has(m.userId));
  if (!kept.length) redirect(`${BACK}?error=nobody`);

  const attachments = await resolveAttachments(formData, BACK);
  const kindRaw = clean(formData.get("meetingKind"), 40);

  const topics = clean(formData.get("meetingTopics"), 8000)
    .split(/\r?\n/)
    .map((t) => t.trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 40);

  const people = [...new Set(kept.map((m) => m.userId))];

  const post = await prisma.announcement.create({
    data: {
      authorId: user.id,
      title,
      // NO BODY. The column is not nullable and there is nothing to put in it:
      // a record has topics and a roster, not prose. Staff never read it.
      content: "",
      tag: COMPANY_MEETING_TAG,
      meetingKind: isValidMeetingKind(kindRaw) ? kindRaw : "Other",
      // ONE DATE STAYS ONE DATE. A lone session is stored as meetingAt with no
      // options, exactly as the announcement form stores it, so a simple record
      // does not render as a one-session series.
      meetingAt: single ? new Date(options[0].at) : null,
      meetingTimezone: PACIFIC,
      meetingOptions: single ? null : options,
      meetingTopics: topics,
      attachments,
      meetingBackfilled: true,
      meetingRecordSource: clean(formData.get("meetingRecordSource"), 120) || null,
      // THE AUDIENCE IS THE PEOPLE ON THE RECORD, which is the only thing the
      // old sheet knows. ackEveryone false so the ids above are what counts.
      ackEveryone: false,
      ackUserIds: people,
      // PUBLISHED AS IT IS CREATED, because the attendance report reads
      // `publishedAt: { not: null }` and a draft would be absent from the one
      // screen this record exists for. Nothing emails: publishing here never
      // touches the publish dialog, and the cron skips backfilled meetings.
      publishedAt: new Date(),
    },
    select: { id: true },
  });

  // ONE RESPONSE PER PERSON, AND WHERE THE MARK LIVES DEPENDS ON THE SHAPE.
  // buildRoster reads a single-session meeting's attendance off the response
  // and a multi-session one's off each choice row, so writing it in the wrong
  // place would produce a roster that counts nobody. cantMakeIt stays false on
  // both: an absence recorded afterwards is not somebody having declined
  // beforehand, and the roll call is what carries that meaning.
  const singleStatus = new Map(single ? kept.map((m) => [m.userId, m.status]) : []);
  await prisma.announcementMeetingResponse.createMany({
    data: people.map((userId) => ({
      announcementId: post.id,
      userId,
      cantMakeIt: false,
      attended: single ? singleStatus.get(userId) || null : null,
    })),
    skipDuplicates: true,
  });

  if (!single) {
    await prisma.announcementMeetingChoice.createMany({
      data: kept.map((m) => ({
        announcementId: post.id,
        userId: m.userId,
        optionId: m.optionId,
        attended: m.status,
      })),
      skipDuplicates: true,
    });
  }

  revalidatePath(BACK);
  redirect(`${BACK}/${post.id}`);
}
