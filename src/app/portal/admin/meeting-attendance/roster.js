// shared roster logic for the meeting-attendance report (summary cards) and the
// per-meeting dedicated page (full drill-down). server-only helpers - no client
// imports. mirrors the meeting detail page's roster.
import { preferredName } from "@/lib/contacts";
import { MEETING_FORMAT_LABELS } from "@/lib/announcements";
import { formatInstant } from "@/lib/meeting-time";

// server-rendered, so it can't know each viewer's zone like the portal does.
// pin it to Pacific - ~all staff are in CA (same call the emails make).
export const PACIFIC = "America/Los_Angeles";

export function meetingIsPast(latestMs) {
  return latestMs != null && latestMs < Date.now();
}

// a plain, serializable person for the client board. optionId is set for a
// per-session row (multi/series) so roll-call marks that session; null on
// single-session / can't / no-response rows.
export function toPerson(u) {
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

// just the bits an avatar face needs (main-card summary stacks).
const slim = (p) => ({ id: p.id, displayName: p.displayName, image: p.image || null });

export function fmtDate(iso, tz) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz || PACIFIC,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function fmtSession(o) {
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
export function buildRoster(m, audienceUsers, choices, responses) {
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

  // ---- summary for the main report card (avatar-stack rollups) ----
  // distinct attending people (a series attendee shows once per session in
  // bySession, so dedupe for the face stack + count).
  const attendingSeen = new Set();
  const attendingPeople = [];
  for (const p of [...bySession.flatMap((s) => s.going), ...singleGoing]) {
    if (!attendingSeen.has(p.id)) {
      attendingSeen.add(p.id);
      attendingPeople.push(slim(p));
    }
  }
  // per-session going rows drive the present/absent/unmarked bar (roll-call is
  // per session), so a 3-session attendee counts three times toward the bar.
  const attendingSessions =
    bySession.reduce((n, s) => n + s.going.length, 0) + singleGoing.length;
  const cantPeople = isSeries
    ? [...seriesDecliners]
        .map((uid) => userById.get(uid))
        .filter(Boolean)
        .map((u) => ({ id: u.id, displayName: preferredName(u), image: u.image || null }))
    : cantAll.map(slim);

  const summary = {
    attendingCount: goingUsers.length,
    attendingPeople,
    attendingSessions,
    present,
    absent,
    unmarked: Math.max(0, attendingSessions - present - absent),
    noResponseCount: noResponse.length,
    noResponsePeople: noResponse.map(slim),
    cantLabel: isSeries ? "Can't attend a series" : "Can't make it",
    cantCount: isSeries ? seriesDecliners.size : cantAll.length,
    cantPeople,
  };

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
    summary,
    // for the admin override toolkit: a slim invited-audience list (walk-in
    // picker), the real sessions (move / record targets), and whether the meeting
    // offers session options at all.
    audience: audienceUsers.map((u) => ({
      id: u.id,
      displayName: preferredName(u),
      title: u.title || "",
      image: u.image || null,
    })),
    toolSessions: opts.map((o) => ({
      id: o.id,
      label: o.label,
      seriesLabel: o.seriesLabel || null,
    })),
    hasSessions: opts.length > 0,
  };
}

// title/meta/stats line for a meeting (shared by the card + the dedicated page).
export function meetingMeta(m, r) {
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

  return {
    metaLine: parts.join(" · "),
    pct: r.invited > 0 ? Math.round((r.responded / r.invited) * 100) : 0,
    dueLabel: m.meetingResponseDueAt
      ? fmtDate(m.meetingResponseDueAt, m.meetingResponseDueTz)
      : null,
    earliest,
    latest,
    sortKey: earliest ?? Number.MAX_SAFE_INTEGER,
    isPast: meetingIsPast(latest),
  };
}
