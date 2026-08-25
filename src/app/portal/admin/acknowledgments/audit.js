// row builder for the acknowledgment audit CSVs. one row per person the
// announcement expected an acknowledgment from, plus rows for anyone who acked
// but has since left the audience (deactivated, or the audience was edited) -
// an audit trail keeps those, even though the on-screen roster drops them.
import { prisma } from "@/lib/prisma";
import { preferredName } from "@/lib/contacts";
import { ackAudienceWhere } from "@/lib/announcements";
import { PACIFIC } from "./roster";

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
// carrying userId / viaEmail / recordedById / createdAt. returns arrays of
// plain strings, one per person, in AUDIT_COLUMNS order.
export async function ackAuditRows(p) {
  const [audienceUsers, submissions] = await Promise.all([
    prisma.user.findMany({
      where: ackAudienceWhere(p),
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
          where: { id: { in: outsideIds } },
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
  const hasForm = !!p.formId;

  const row = (u, note) => {
    const a = ackByUser.get(u.id);
    const sub = signedByUser.get(u.id);
    const how = !a
      ? ""
      : a.recordedById
        ? `logged by ${recorderName.get(a.recordedById) || "an admin"}`
        : a.viaEmail
          ? "email link"
          : "in portal";
    return [
      preferredName(u),
      u.title || "",
      u.email || "",
      a ? "acknowledged" : "not yet",
      how,
      a ? fmtStamp(a.createdAt) : "",
      hasForm ? (sub ? "signed" : "not signed") : "",
      sub ? fmtStamp(sub.createdAt) : "",
      note,
    ];
  };

  return [
    ...audienceUsers.map((u) => row(u, "")),
    ...outsideUsers.map((u) =>
      row(u, u.deactivatedAt ? "deactivated" : "no longer in audience"),
    ),
  ];
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
