// records a Company Meeting RSVP made through a one-click email link (no login).
// mirrors the in-portal actions (attend / chooseMeetingOption / cantMake) but
// takes a userId from the signed token instead of the session, and stamps
// viaEmail on the response. respects session locks + records the ack (responding
// counts as acknowledgment). used by /a/rsvp/[token].
import { prisma } from "@/lib/prisma";
import { computeMeetingLocks, isAckExempt } from "@/lib/announcements";
import { titleHasSegment } from "@/lib/positions";
import { formatInstant } from "@/lib/meeting-time";

const TZ = "America/Los_Angeles";

// same rule as ackAudienceWhere: Everyone (minus the ack-exempt Owner) or the
// picked job titles / specific people.
function inAudience(post, user) {
  if (post.ackEveryone || (!post.ackTitles?.length && !post.ackUserIds?.length)) {
    return !isAckExempt(user);
  }
  return (
    (post.ackTitles || []).some((t) => titleHasSegment(user.title, t)) ||
    (post.ackUserIds || []).includes(user.id)
  );
}

function optLabel(o) {
  const bits = [];
  if (o.seriesLabel) bits.push(o.seriesLabel);
  if (o.label) bits.push(o.label);
  const head = bits.join(" · ");
  const when = o.at ? formatInstant(o.at, TZ) : "";
  return [head, when].filter(Boolean).join(" · ");
}

async function markAck(post, user) {
  // a meeting response records the acknowledgment. keep the derived ack
  // viaEmail:false so the existing retract-cleanup (which deletes viaEmail:false
  // acks) still applies; the response's own viaEmail flag carries the channel.
  if (post.requireAck && !isAckExempt(user)) {
    await prisma.announcementAck.upsert({
      where: { announcementId_userId: { announcementId: post.id, userId: user.id } },
      create: { announcementId: post.id, userId: user.id, viaEmail: false },
      update: {},
    });
  }
}

// records the RSVP. returns { status, label, series }, where status is one of
// "going" | "cant" | "locked" | "notInvited" | "invalid".
export async function recordEmailRsvp(post, user, choice) {
  const opts = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  if (!inAudience(post, user)) return { status: "notInvited" };

  const isCant = choice === "cant";
  const isGoing = choice === "going";
  const opt = !isCant && !isGoing ? opts.find((o) => o && o.id === choice) : null;

  // shape checks: single-session takes going/cant; a meeting with options takes
  // an option id (or cant).
  if (!isCant && !isGoing && !opt) return { status: "invalid" };
  if (opts.length === 0 && opt) return { status: "invalid" };
  if (opts.length > 0 && isGoing) return { status: "invalid" };

  const [myChoices, resp] = await Promise.all([
    prisma.announcementMeetingChoice.findMany({
      where: { announcementId: post.id, userId: user.id },
      select: { optionId: true, attended: true },
    }),
    prisma.announcementMeetingResponse.findUnique({
      where: { announcementId_userId: { announcementId: post.id, userId: user.id } },
      select: { attended: true },
    }),
  ]);
  const locks = computeMeetingLocks({
    options: opts,
    myChoices,
    meetingAt: post.meetingAt,
    myAttended: resp?.attended || null,
    now: Date.now(),
  });

  // lock checks
  if (isCant && (locks.lockedAll || locks.lockedSeriesIds.length)) return { status: "locked" };
  if (isGoing && locks.lockedAll) return { status: "locked" };
  if (opt) {
    if (opt.seriesId ? locks.lockedSeriesIds.includes(opt.seriesId) : locks.lockedAll) {
      return { status: "locked" };
    }
  }

  const respKey = { announcementId_userId: { announcementId: post.id, userId: user.id } };

  if (isCant) {
    await prisma.announcementMeetingChoice.deleteMany({
      where: { announcementId: post.id, userId: user.id },
    });
    await prisma.announcementMeetingResponse.upsert({
      where: respKey,
      create: { announcementId: post.id, userId: user.id, cantMakeIt: true, viaEmail: true },
      update: { cantMakeIt: true, viaEmail: true, reason: null },
    });
    await markAck(post, user);
    return { status: "cant" };
  }

  if (isGoing) {
    await prisma.announcementMeetingResponse.upsert({
      where: respKey,
      create: { announcementId: post.id, userId: user.id, cantMakeIt: false, viaEmail: true },
      update: { cantMakeIt: false, viaEmail: true, reason: null },
    });
    await markAck(post, user);
    const when = post.meetingAt
      ? formatInstant(post.meetingAt instanceof Date ? post.meetingAt.toISOString() : post.meetingAt, TZ)
      : "";
    return { status: "going", label: when };
  }

  // a specific session
  if (opt.seriesId) {
    const sameSeries = opts.filter((o) => o.seriesId === opt.seriesId).map((o) => o.id);
    await prisma.announcementMeetingChoice.deleteMany({
      where: {
        announcementId: post.id,
        userId: user.id,
        optionId: { in: [...sameSeries, `cant:${opt.seriesId}`] },
      },
    });
  } else if (!post.meetingMultiPick) {
    await prisma.announcementMeetingChoice.deleteMany({
      where: { announcementId: post.id, userId: user.id },
    });
  }
  await prisma.announcementMeetingChoice.upsert({
    where: {
      announcementId_userId_optionId: { announcementId: post.id, userId: user.id, optionId: opt.id },
    },
    create: { announcementId: post.id, userId: user.id, optionId: opt.id },
    update: {},
  });
  await prisma.announcementMeetingResponse.upsert({
    where: respKey,
    create: { announcementId: post.id, userId: user.id, cantMakeIt: false, viaEmail: true },
    update: { cantMakeIt: false, viaEmail: true, reason: null },
  });
  await markAck(post, user);
  return { status: "going", label: optLabel(opt), series: opts.some((o) => o && o.seriesId) };
}

// records a "can't make it" with a reason (single/flat) or a per-series decline
// with a reason (series). from the /a/rsvp cant form. `cantSeriesIds` is the
// series the person checked "can't attend"; ignored for non-series meetings.
export async function recordEmailCant(post, user, { reason, cantSeriesIds } = {}) {
  const opts = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  if (!inAudience(post, user)) return { status: "notInvited" };
  const isSeries = opts.some((o) => o && o.seriesId);
  const cleanReason = (reason || "").toString().trim().slice(0, 300) || null;

  const [myChoices, resp] = await Promise.all([
    prisma.announcementMeetingChoice.findMany({
      where: { announcementId: post.id, userId: user.id },
      select: { optionId: true, attended: true },
    }),
    prisma.announcementMeetingResponse.findUnique({
      where: { announcementId_userId: { announcementId: post.id, userId: user.id } },
      select: { attended: true },
    }),
  ]);
  const locks = computeMeetingLocks({
    options: opts,
    myChoices,
    meetingAt: post.meetingAt,
    myAttended: resp?.attended || null,
    now: Date.now(),
  });
  const respKey = { announcementId_userId: { announcementId: post.id, userId: user.id } };

  if (isSeries) {
    const seriesIds = new Set(opts.map((o) => o && o.seriesId).filter(Boolean));
    const targets = [...new Set((cantSeriesIds || []).filter((s) => seriesIds.has(s)))];
    if (!targets.length) return { status: "invalid" };
    if (targets.some((s) => locks.lockedSeriesIds.includes(s))) return { status: "locked" };
    for (const sid of targets) {
      const sameSeries = opts.filter((o) => o.seriesId === sid).map((o) => o.id);
      await prisma.announcementMeetingChoice.deleteMany({
        where: { announcementId: post.id, userId: user.id, optionId: { in: sameSeries } },
      });
      await prisma.announcementMeetingChoice.upsert({
        where: {
          announcementId_userId_optionId: {
            announcementId: post.id,
            userId: user.id,
            optionId: `cant:${sid}`,
          },
        },
        create: { announcementId: post.id, userId: user.id, optionId: `cant:${sid}` },
        update: {},
      });
    }
    const final = await prisma.announcementMeetingChoice.findMany({
      where: { announcementId: post.id, userId: user.id },
      select: { optionId: true },
    });
    const realPicks = final.filter((c) => !String(c.optionId).startsWith("cant:"));
    await prisma.announcementMeetingResponse.upsert({
      where: respKey,
      create: {
        announcementId: post.id,
        userId: user.id,
        cantMakeIt: realPicks.length === 0,
        reason: cleanReason,
        viaEmail: true,
      },
      update: { cantMakeIt: realPicks.length === 0, reason: cleanReason, viaEmail: true },
    });
    await markAck(post, user);
    return { status: realPicks.length === 0 ? "cant" : "partial", declined: targets.length };
  }

  // single-session or flat multi: a full "can't make it"
  if (locks.lockedAll) return { status: "locked" };
  await prisma.announcementMeetingChoice.deleteMany({
    where: { announcementId: post.id, userId: user.id },
  });
  await prisma.announcementMeetingResponse.upsert({
    where: respKey,
    create: {
      announcementId: post.id,
      userId: user.id,
      cantMakeIt: true,
      reason: cleanReason,
      viaEmail: true,
    },
    update: { cantMakeIt: true, reason: cleanReason, viaEmail: true },
  });
  await markAck(post, user);
  return { status: "cant" };
}
