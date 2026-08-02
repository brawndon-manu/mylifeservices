"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import { recordAnnouncementAck } from "@/lib/announcement-ack";

async function requireRecordsAccess() {
  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) redirect("/portal");
  return user;
}

// attribute a no-login submission to a real person - the reconciliation step for
// everything that landed "unassigned" (or an "email-match" guess that needs a
// correction). if the submission completes an announcement's acknowledgment,
// this is also the point that writes it - the person really did submit the form,
// we just needed a human to confirm who they are.
export async function assignFormSubmission(submissionId, userId) {
  await requireRecordsAccess();

  const target = await prisma.user.findFirst({
    where: { id: userId, deactivatedAt: null },
    select: { id: true },
  });
  if (!target) redirect("/portal/admin/forms?error=assign");

  const submission = await prisma.formSubmission.update({
    where: { id: submissionId },
    data: { userId: target.id, attribution: "assigned" },
    select: { announcementId: true },
  });

  if (submission.announcementId) {
    await recordAnnouncementAck({ announcementId: submission.announcementId, userId: target.id });
  }

  revalidatePath("/portal/admin/forms");
}

// undo a bad assign/email-match - back to "needs assignment". doesn't touch any
// AnnouncementAck already written for the old person (the form was genuinely
// submitted; if the ack itself needs correcting too, use the Acknowledgments
// admin page's mark/unmark override).
export async function unassignFormSubmission(submissionId) {
  await requireRecordsAccess();
  await prisma.formSubmission.update({
    where: { id: submissionId },
    data: { userId: null, attribution: "unassigned" },
  });
  revalidatePath("/portal/admin/forms");
}
