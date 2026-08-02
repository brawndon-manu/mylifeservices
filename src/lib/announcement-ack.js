import { prisma } from "@/lib/prisma";

// the one place an AnnouncementAck row gets written, no matter how the person
// acknowledged: the in-portal checkbox, a meeting response, a one-click email
// link, an admin marking it on someone's behalf, or completing an attached
// form. idempotent upsert on the composite PK, so calling it again (e.g. a
// form gets reconciled after the fact) is always safe.
export async function recordAnnouncementAck({
  announcementId,
  userId,
  viaEmail = false,
  recordedById = null,
}) {
  await prisma.announcementAck.upsert({
    where: { announcementId_userId: { announcementId, userId } },
    create: { announcementId, userId, viaEmail, recordedById },
    update: {},
  });
}
