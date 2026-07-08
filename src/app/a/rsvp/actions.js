"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyRsvpToken } from "@/lib/rsvp-token";
import { isCompanyMeeting } from "@/lib/announcements";
import { recordEmailCant } from "@/lib/meeting-response";

// submit the "can't make it" reason / per-series decline from the /a/rsvp form.
// no login - the signed token (carried in the form) is the credential.
export async function submitRsvpCant(token, formData) {
  const parsed = verifyRsvpToken(token);
  if (!parsed) redirect(`/a/rsvp/${token}`);

  const reason = formData.get("reason");
  const cantSeriesIds = formData
    .getAll("cantSeries")
    .filter((s) => typeof s === "string" && s);

  const [post, user] = await Promise.all([
    prisma.announcement.findUnique({
      where: { id: parsed.announcementId },
      select: {
        id: true,
        tag: true,
        deletedAt: true,
        publishedAt: true,
        meetingOptions: true,
        meetingMultiPick: true,
        meetingAt: true,
        requireAck: true,
        ackEveryone: true,
        ackTitles: true,
        ackUserIds: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: parsed.userId },
      select: { id: true, title: true, deactivatedAt: true },
    }),
  ]);

  let status = "cant";
  if (
    post &&
    !post.deletedAt &&
    post.publishedAt &&
    isCompanyMeeting(post.tag) &&
    user &&
    !user.deactivatedAt
  ) {
    try {
      const r = await recordEmailCant(post, user, { reason, cantSeriesIds });
      if (r?.status) status = r.status;
    } catch (e) {
      console.error("rsvp cant via email failed:", e);
    }
  }
  redirect(`/a/rsvp/${token}?done=${status}`);
}
