import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets, canSeeEveryAttestation, isElevated } from "@/lib/roles";
import { withinWindow } from "@/lib/link-window";

// EVERY EMAILED LINK ANSWERS TO TWO RULES before it shows or takes anything:
// the account it was sent to is still active, and the task it was sent about
// moved less than 30 days ago (link-window.js). false means the link is done -
// the page shows LinkExpired, a route answers 410, an action says "expired".
//
// the office is not held to it: someone signed in who manages that kind of
// record opens these links to review them (a timesheet in preview), and that
// is their job, not a key in an old email. a record that is not there answers
// true, so the caller's own not-found handling still speaks.
async function office(can) {
  const viewer = await getCurrentUser();
  return !!viewer && can(viewer.role);
}

export async function timesheetLinkOpen(id) {
  if (await office(canManageTimesheets)) return true;
  const t = await prisma.timesheet.findUnique({
    where: { id },
    select: {
      sentAt: true, dueAt: true, signedAt: true, approvedAt: true, disputedAt: true, createdAt: true,
      user: { select: { deactivatedAt: true } },
    },
  });
  if (!t) return true;
  if (t.user?.deactivatedAt) return false;
  // createdAt is the floor: a rebuild clears sentAt, and a link already in an
  // inbox must not be left with nothing to count from
  return withinWindow([t.sentAt, t.dueAt, t.signedAt, t.approvedAt, t.disputedAt, t.createdAt]);
}

export async function amendmentLinkOpen(id) {
  if (await office(canManageTimesheets)) return true;
  const a = await prisma.clockAmendment.findUnique({
    where: { id },
    select: {
      createdAt: true, sentAt: true, chasedAt: true, filledAt: true, clientSignedAt: true,
      approvedAt: true, mailedAt: true,
      staff: { select: { deactivatedAt: true } },
    },
  });
  if (!a) return true;
  if (a.staff?.deactivatedAt) return false;
  return withinWindow([a.createdAt, a.sentAt, a.chasedAt, a.filledAt, a.clientSignedAt, a.approvedAt, a.mailedAt]);
}

// the client's own link has no account behind it; the staff and supervisor
// links do
export async function attestationLinkOpen(attestationId, audience) {
  if (await office(canSeeEveryAttestation)) return true;
  const r = await prisma.clientAttestation.findUnique({
    where: { id: attestationId },
    select: {
      sentAt: true, dueAt: true, signedAt: true, clientSignedAt: true, createdAt: true,
      staffUser: { select: { deactivatedAt: true } },
      supervisor: { select: { deactivatedAt: true } },
    },
  });
  if (!r) return true;
  if (audience === "staff" && r.staffUser?.deactivatedAt) return false;
  if (audience === "supervisor" && r.supervisor?.deactivatedAt) return false;
  return withinWindow([r.sentAt, r.dueAt, r.signedAt, r.clientSignedAt, r.createdAt]);
}

// an announcement's links - sign, attest, acknowledge, rsvp, its documents -
// last 30 days past the newest of its own dates or this person's answer
export async function announcementLinkOpen(announcementId, userId) {
  if (await office(isElevated)) return true;
  const [post, user, ack] = await Promise.all([
    prisma.announcement.findUnique({
      where: { id: announcementId },
      select: {
        publishedAt: true, ackReminderSentAt: true, ackEmailSentAt: true, deadlineNoticedAt: true,
        expiresAt: true, meetingAt: true, meetingResponseDueAt: true, meetingResponseNoticeSentAt: true,
        meetingConcludedAt: true, meetingAttestationSentAt: true, eventEndAt: true, createdAt: true,
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { deactivatedAt: true } }),
    prisma.announcementAck.findUnique({
      where: { announcementId_userId: { announcementId, userId } },
      select: { createdAt: true },
    }),
  ]);
  if (!post) return true;
  if (user?.deactivatedAt) return false;
  // every send and notice counts (a reminder carries the link again), and so
  // does a deadline still ahead: the links hold until it, then 30 days more
  return withinWindow([
    post.publishedAt, post.ackReminderSentAt, post.ackEmailSentAt, post.deadlineNoticedAt,
    post.expiresAt, post.meetingAt, post.meetingResponseDueAt, post.meetingResponseNoticeSentAt,
    post.meetingConcludedAt, post.meetingAttestationSentAt, post.eventEndAt, post.createdAt, ack?.createdAt,
  ]);
}
