"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyRsvpToken } from "@/lib/rsvp-token";
import { isCompanyMeeting } from "@/lib/announcements";
import { recordEmailPicks } from "@/lib/meeting-response";

// submit the whole-meeting picker from /a/rsvp (a date per series and/or a
// "can't attend this series" per series, or a pick / "can't make any" for a flat
// meeting). no login - the signed token carried in the form is the credential.
export async function submitRsvpPicks(token, formData) {
  const parsed = verifyRsvpToken(token);
  if (!parsed) redirect(`/a/rsvp/${token}`);

  // series: a chosen date posts as `series:<seriesId>` = optionId; the can't-attend
  // checklist posts each declined series as `cantSeries` = seriesId.
  const seriesPick = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v !== "string" || !v) continue;
    if (k.startsWith("series:")) seriesPick[k.slice("series:".length)] = v;
  }
  const cantSeriesIds = formData.getAll("cantSeries").filter((x) => typeof x === "string" && x);
  // flat meeting: `flat` (single-pick) = optionId; `flatPick` (multi-pick) = optionIds;
  // `flatCant` = can't make any.
  const flatPicks = formData.getAll("flatPick").filter((x) => typeof x === "string" && x);
  const flat = formData.get("flat");
  const flatCant = formData.get("flatCant") != null;
  if (typeof flat === "string" && flat) flatPicks.push(flat);
  // single-session: `single` = "going"; `singleCant` = can't make it.
  const single = typeof formData.get("single") === "string" ? formData.get("single") : null;
  const singleCant = formData.get("singleCant") != null;
  const reason = formData.get("reason");

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

  let status = "invalid";
  if (
    post &&
    !post.deletedAt &&
    post.publishedAt &&
    isCompanyMeeting(post.tag) &&
    user &&
    !user.deactivatedAt
  ) {
    try {
      const r = await recordEmailPicks(post, user, {
        seriesPick,
        cantSeriesIds,
        flatPicks,
        flatCant,
        single,
        singleCant,
        reason,
      });
      if (r?.status) status = r.status;
    } catch (e) {
      console.error("rsvp picks via email failed:", e);
    }
  }
  redirect(`/a/rsvp/${token}?done=${status}`);
}
