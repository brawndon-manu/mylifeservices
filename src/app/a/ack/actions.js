"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyAckToken } from "@/lib/ack-token";
import { recordAnnouncementAck } from "@/lib/announcement-ack";

// THE PRESS THAT RECORDS THE ACK. The landing page used to record on view, and
// mail scanners view everything: Gmail and Outlook fetch every link in a
// message to check it, so people were being recorded as having acknowledged
// policies their inbox had merely scanned. HR freezes QSP accounts off these
// records, so a record has to mean a person pressed a button.
//
// The token is the credential, verified here again rather than trusted from
// the page - this is a public endpoint and the page's checks are not ours.
export async function acknowledgeFromEmail(token) {
  const parsed = verifyAckToken(String(token || ""));
  if (!parsed) redirect("/portal/announcements");

  const [announcement, user] = await Promise.all([
    prisma.announcement.findUnique({
      where: { id: parsed.announcementId },
      select: {
        id: true,
        requireAck: true,
        deletedAt: true,
        formId: true,
        form: { select: { fillable: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: parsed.userId },
      select: { id: true, deactivatedAt: true },
    }),
  ]);
  if (
    !announcement ||
    announcement.deletedAt ||
    !announcement.requireAck ||
    !user ||
    user.deactivatedAt
  ) {
    redirect(`/a/ack/${token}`);
  }

  await recordAnnouncementAck({
    announcementId: announcement.id,
    userId: user.id,
    viaEmail: true,
  });

  // OPENED IS NOT SIGNED, AND BOTH ARE WORTH KNOWING - Mánu 2026-08-10. A post
  // with a fillable form is finished by signing it, so the press records the
  // opened-ack and hands them straight to the document, exactly as the old
  // on-view flow did. The roster keeps showing the two states apart.
  if (announcement.formId && announcement.form?.fillable) {
    redirect(`/a/sign/${token}`);
  }
  redirect(`/a/ack/${token}?done=1`);
}
