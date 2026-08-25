// row builder for the acknowledgment audit CSVs. one row per person the
// announcement expected an acknowledgment from, plus rows for anyone who acked
// but has since left the audience (deactivated, or the audience was edited) -
// an audit trail keeps those, even though the on-screen roster drops them.
import { prisma } from "@/lib/prisma";
import { preferredName } from "@/lib/contacts";
import { ackAudienceWhere } from "@/lib/announcements";
import { OFFICES } from "@/lib/positions";
import { PACIFIC, fmtPosted } from "./roster";

// office filter for the rosters and their files. most ack posts are for the
// MLS office, so the pages let you look at one office's staff at a time.
export const OFFICE_LABELS = { MLS: "MLS office", DP: "Day program" };

export function officeFromSearch(sp) {
  return OFFICES.includes(sp?.office) ? sp.office : "";
}

const stampFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
export function fmtStamp(d) {
  return stampFmt.format(new Date(d));
}

export const AUDIT_COLUMNS = [
  "Employee",
  "Job title",
  "Email",
  "Status",
  "How",
  "Acknowledged",
  "Form",
  "Signed",
  "Note",
];

const USER_SELECT = {
  id: true,
  name: true,
  preferredFirstName: true,
  preferredLastName: true,
  title: true,
  email: true,
};

// `p` needs id, formId, ackEveryone, ackTitles, ackUserIds, and acks rows
// carrying userId / viaEmail / recordedById / createdAt. returns one object
// per person - the audience first, then anyone who acked but has since left
// it. the CSV and the PDF report both build from these. `office` narrows every
// part of the roster to that office's staff.
export async function ackAuditPeople(p, { office = "" } = {}) {
  const [audienceUsers, submissions] = await Promise.all([
    prisma.user.findMany({
      where: {
        ...ackAudienceWhere(p),
        ...(office ? { offices: { has: office } } : {}),
      },
      select: USER_SELECT,
      orderBy: [{ preferredFirstName: "asc" }, { name: "asc" }],
    }),
    p.formId
      ? prisma.formSubmission.findMany({
          where: { announcementId: p.id },
          select: { userId: true, createdAt: true },
        })
      : [],
  ]);

  const audIds = new Set(audienceUsers.map((u) => u.id));
  const outsideIds = (p.acks || [])
    .map((a) => a.userId)
    .filter((id) => !audIds.has(id));
  const recorderIds = [
    ...new Set((p.acks || []).map((a) => a.recordedById).filter(Boolean)),
  ];
  const [outsideUsers, recorders] = await Promise.all([
    outsideIds.length
      ? prisma.user.findMany({
          // the same office narrowing - otherwise filtering to one office
          // would relabel the whole other office's ackers as "no longer in
          // audience"
          where: {
            id: { in: outsideIds },
            ...(office ? { offices: { has: office } } : {}),
          },
          select: { ...USER_SELECT, deactivatedAt: true },
          orderBy: [{ preferredFirstName: "asc" }, { name: "asc" }],
        })
      : [],
    recorderIds.length
      ? prisma.user.findMany({
          where: { id: { in: recorderIds } },
          select: {
            id: true,
            name: true,
            preferredFirstName: true,
            preferredLastName: true,
          },
        })
      : [],
  ]);
  const recorderName = new Map(recorders.map((u) => [u.id, preferredName(u)]));

  const ackByUser = new Map((p.acks || []).map((a) => [a.userId, a]));
  const signedByUser = new Map(
    submissions.filter((s) => s.userId).map((s) => [s.userId, s]),
  );
  const person = (u, note) => {
    const a = ackByUser.get(u.id);
    const sub = signedByUser.get(u.id);
    return {
      who: preferredName(u),
      title: u.title || "",
      email: u.email || "",
      acked: !!a,
      how: !a
        ? ""
        : a.recordedById
          ? `logged by ${recorderName.get(a.recordedById) || "an admin"}`
          : a.viaEmail
            ? "email link"
            : "in portal",
      when: a ? fmtStamp(a.createdAt) : "",
      signed: !!sub,
      signedWhen: sub ? fmtStamp(sub.createdAt) : "",
      signedDay: sub ? fmtPosted(sub.createdAt) : "",
      note,
    };
  };

  return [
    ...audienceUsers.map((u) => person(u, "")),
    ...outsideUsers.map((u) =>
      person(u, u.deactivatedAt ? "deactivated" : "no longer in audience"),
    ),
  ];
}

// roster arithmetic over the audit people. only the still-expected audience
// counts toward the denominator - people who acked and then left it appear in
// the rows but not in these numbers, same as the on-screen roster.
export function ackStats(people) {
  const audience = people.filter((r) => !r.note);
  const acked = audience.filter((r) => r.acked);
  const viaEmail = acked.filter((r) => r.how === "email link").length;
  const expected = audience.length;
  return {
    expected,
    acked: acked.length,
    inPortal: acked.length - viaEmail,
    viaEmail,
    notYet: expected - acked.length,
    pct: expected ? Math.round((acked.length / expected) * 100) : 0,
  };
}

// the same people as arrays of plain strings in AUDIT_COLUMNS order, for the CSVs
export async function ackAuditRows(p, opts = {}) {
  const hasForm = !!p.formId;
  return (await ackAuditPeople(p, opts)).map((r) => [
    r.who,
    r.title,
    r.email,
    r.acked ? "acknowledged" : "not yet",
    r.how,
    r.when,
    hasForm ? (r.signed ? "signed" : "not signed") : "",
    r.signedWhen,
    r.note,
  ]);
}

// YYYY-MM-DD in Pacific, for filenames
export function fileDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
