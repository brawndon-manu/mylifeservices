"use server";

// Announcements actions - one-for-one with the Hub (src/app/portal/hub/
// actions.js) but on the Announcement models, and with the single caveat that
// only Supervisor+ (isSupervisorUp) can create a post. everyone can comment,
// like, edit/delete their own; moderators can delete others + pin.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import {
  isModerator,
  isElevated,
  isSupervisorUp,
  isIT,
} from "@/lib/roles";
import { firstNameOf, preferredName } from "@/lib/contacts";
import { ACK_EXEMPT_TITLE } from "@/lib/positions";
import { signAckToken } from "@/lib/ack-token";
import { renderMarkdown } from "@/lib/markdown";
import {
  buildAnnouncementEmailHtml,
  buildMeetingBlockHtml,
} from "@/lib/announcement-email";
import {
  cleanBody,
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  POST_CONTENT_MAX,
  COMMENT_CONTENT_MAX,
} from "@/lib/hub";
import {
  isValidAnnouncementTag,
  isChangelog,
  isCompanyMeeting,
  isValidMeetingKind,
  isValidMeetingFormat,
  formatHasOnline,
  formatHasAddress,
  ANNOUNCEMENT_TITLE_MAX,
  CHANGELOG_CONTENT_MAX,
  ackAudienceWhere,
  titleSegmentMatch,
  isAckExempt,
} from "@/lib/announcements";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

function parseDateField(raw) {
  if (typeof raw !== "string" || !raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// the acknowledgment audience from the form: Everyone (the whole expected-ack
// staff set) or a list of job titles / specific people. only meaningful when
// active (requireAck or a meeting). NO empty-fallback to Everyone anymore - an
// empty pick stays empty so the action can reject it (the author must choose).
function parseAckAudience(formData, active) {
  if (!active) return { ackEveryone: true, ackTitles: [], ackUserIds: [] };
  const everyone = formData.get("ackEveryone") === "on";
  if (everyone) return { ackEveryone: true, ackTitles: [], ackUserIds: [] };
  const titles = formData
    .getAll("ackTitles")
    .filter((t) => typeof t === "string" && t);
  const userIds = formData
    .getAll("ackUserIds")
    .filter((t) => typeof t === "string" && t);
  return { ackEveryone: false, ackTitles: titles, ackUserIds: userIds };
}

// true when an ack audience came back empty (nobody chosen). used to block a
// post that requires acknowledgment but didn't pick who.
function ackAudienceEmpty({ ackEveryone, ackTitles, ackUserIds }) {
  return !ackEveryone && !ackTitles.length && !ackUserIds.length;
}

// the "send as email" audience on the create form - its own picker, separate
// from the ack audience. not stored (the email goes out at post time).
// IMPORTANT: an empty pick means send to NOBODY, not everyone. only an explicit
// "Everyone" check blasts all staff. (this used to default empty -> everyone,
// which accidentally emailed the whole company.)
function parseEmailAudience(formData) {
  const everyone = formData.get("emailEveryone") === "on";
  if (everyone) return { everyone: true, titles: [], userIds: [] };
  const titles = formData
    .getAll("emailTitles")
    .filter((t) => typeof t === "string" && t);
  const userIds = formData
    .getAll("emailUserIds")
    .filter((t) => typeof t === "string" && t);
  return { everyone: false, titles, userIds };
}

// the Company Meeting fields. only meaningful when tag = "Company Meeting";
// other types store nulls/defaults so the columns stay clean.
function parseMeetingFields(formData, tag) {
  const blank = {
    meetingKind: null,
    meetingFormat: null,
    meetingMandatory: false,
    zoomLink: null,
    zoomCode: null,
    meetingAddress: null,
    meetingOptions: null,
    meetingMultiPick: false,
    meetingAt: null,
    meetingTimezone: null,
    meetingDurationFromMin: null,
    meetingDurationToMin: null,
    meetingResponseDueAt: null,
    meetingResponseDueTz: null,
    zoomLinkTbd: false,
    meetingNightBefore: true,
    meetingReminderLeadMin: 10,
  };
  if (!isCompanyMeeting(tag)) return blank;

  const trim = (s, max) => {
    const v = typeof s === "string" ? s.trim() : "";
    return v ? v.slice(0, max) : null;
  };
  const kind = formData.get("meetingKind");
  const format = formData.get("meetingFormat");
  const online = formatHasOnline(format);
  const addr = formatHasAddress(format);

  let meetingOptions = null;
  let meetingMultiPick = false;
  const raw = formData.get("meetingOptions");
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const posInt = (v) => {
          const n = parseInt(v, 10);
          return Number.isFinite(n) && n > 0 ? n : null;
        };
        const opts = arr
          .filter((o) => o && typeof o.label === "string" && o.label.trim())
          .map((o, i) => {
            // each session carries its own absolute start + timezone + duration.
            let at = null;
            if (typeof o.at === "string" && o.at) {
              const dt = new Date(o.at);
              if (!Number.isNaN(dt.getTime())) at = dt.toISOString();
            }
            return {
              id: String(o.id || `opt${i}`),
              label: o.label.trim().slice(0, 140),
              at,
              tz: at && typeof o.tz === "string" ? o.tz.slice(0, 60) : null,
              durationFromMin: posInt(o.durationFromMin),
              durationToMin: posInt(o.durationToMin),
            };
          });
        if (opts.length) {
          meetingOptions = opts;
          meetingMultiPick = formData.get("meetingMultiPick") === "on";
        }
      }
    } catch {
      // ignore bad json - just no options
    }
  }

  // single-meeting start instant (only when not offering session options).
  let meetingAt = null;
  const meetingAtRaw = formData.get("meetingAt");
  if (!meetingOptions && typeof meetingAtRaw === "string" && meetingAtRaw) {
    const dt = new Date(meetingAtRaw);
    if (!Number.isNaN(dt.getTime())) meetingAt = dt;
  }
  const durMin = (hKey, mKey) => {
    const h = parseInt(formData.get(hKey) || "0", 10) || 0;
    const m = parseInt(formData.get(mKey) || "0", 10) || 0;
    const t = h * 60 + m;
    return t > 0 ? t : null;
  };

  return {
    meetingKind: isValidMeetingKind(kind) ? kind : "Other",
    meetingFormat: isValidMeetingFormat(format) ? format : "zoom",
    meetingMandatory: formData.get("meetingMandatory") === "on",
    zoomLink: online ? trim(formData.get("zoomLink"), 500) : null,
    zoomCode: online ? trim(formData.get("zoomCode"), 60) : null,
    meetingAddress: addr ? trim(formData.get("meetingAddress"), 300) : null,
    meetingOptions,
    meetingMultiPick,
    meetingAt,
    meetingTimezone: meetingAt ? trim(formData.get("meetingTimezone"), 60) : null,
    meetingDurationFromMin: durMin("meetingDurFromHrs", "meetingDurFromMin"),
    meetingDurationToMin: durMin("meetingDurToHrs", "meetingDurToMin"),
    meetingResponseDueAt: parseDateField(formData.get("meetingResponseDueAt")),
    meetingResponseDueTz:
      trim(formData.get("meetingResponseDueTz"), 60) || null,
    zoomLinkTbd: online ? formData.get("zoomLinkTbd") === "on" : false,
    meetingNightBefore: formData.get("meetingNightBefore") === "on",
    meetingReminderLeadMin: (() => {
      const n = parseInt(formData.get("meetingReminderLeadMin"), 10);
      return Number.isFinite(n) && n >= 0 && n <= 1440 ? n : 10;
    })(),
  };
}

async function uploadImage(file) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "Image upload isnt configured yet. Create a Blob store in Vercel.",
    );
  }
  const ext = (file.name?.split(".").pop() || "bin").toLowerCase().slice(0, 8);
  const key = `announcements/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const blob = await put(key, file, {
    access: "public",
    contentType: file.type,
  });
  return blob.url;
}

async function tryDeleteBlob(url) {
  if (!url) return;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    await del(url);
  } catch {
    // ignore - blob may already be gone or token missing in dev
  }
}

// ----------- POSTS -----------

export async function createPost(formData) {
  const user = await requireUser();
  // the one caveat vs the Hub: only Supervisor+ may post an announcement.
  if (!isSupervisorUp(user.role)) {
    redirect("/portal/announcements?error=forbidden");
  }

  const tag = formData.get("tag");
  if (!isValidAnnouncementTag(tag)) {
    redirect("/portal/announcements/new?error=tag");
  }
  // every type needs a title now (the new layout is built around it).
  const title = cleanBody(formData.get("title"), ANNOUNCEMENT_TITLE_MAX);
  if (!title) {
    redirect("/portal/announcements/new?error=title");
  }
  // Changelog stays IT/Super only + gets a much larger content limit.
  if (isChangelog(tag) && !isIT(user.role)) {
    redirect("/portal/announcements?error=forbidden");
  }

  const content = cleanBody(
    formData.get("content"),
    isChangelog(tag) ? CHANGELOG_CONTENT_MAX : POST_CONTENT_MAX,
  );
  if (!content) {
    redirect("/portal/announcements/new?error=content");
  }

  const expiresAt = parseDateField(formData.get("expiresAt"));

  // proxy posting: an IT/admin can post on behalf of another employee.
  let authorId = user.id;
  let postedById = null;
  const postAs = formData.get("postAs");
  if (
    typeof postAs === "string" &&
    postAs &&
    postAs !== user.id &&
    isElevated(user.role)
  ) {
    const target = await prisma.user.findFirst({
      where: { id: postAs, deactivatedAt: null },
      select: { id: true },
    });
    if (!target) {
      redirect("/portal/announcements/new?error=postAs");
    }
    authorId = target.id;
    postedById = user.id;
  }

  const requireAck = formData.get("requireAck") === "on";
  const sendEmail = formData.get("sendEmail") === "on";
  // ack audience (stored, drives the roster) and the email audience (its own
  // picker, used to send now) are independent. validate before uploading the
  // image so a rejected post doesn't orphan a blob.
  const ackAudience = parseAckAudience(
    formData,
    requireAck || isCompanyMeeting(tag),
  );
  if (requireAck && ackAudienceEmpty(ackAudience)) {
    redirect("/portal/announcements/new?error=ackAudience");
  }
  const { ackEveryone, ackTitles, ackUserIds } = ackAudience;

  let imageUrl = null;
  const file = formData.get("image");
  if (file && typeof file === "object" && "size" in file && file.size > 0) {
    if (!IMAGE_ACCEPT.includes(file.type)) {
      redirect("/portal/announcements/new?error=imageType");
    }
    if (file.size > IMAGE_MAX_BYTES) {
      redirect("/portal/announcements/new?error=imageSize");
    }
    try {
      imageUrl = await uploadImage(file);
    } catch {
      redirect("/portal/announcements/new?error=imageUpload");
    }
  }

  const post = await prisma.announcement.create({
    data: {
      authorId,
      postedById,
      title,
      content,
      tag,
      expiresAt,
      imageUrl,
      requireAck,
      ackEveryone,
      ackTitles,
      ackUserIds,
      ...parseMeetingFields(formData, tag),
    },
  });

  if (sendEmail) {
    const full = await prisma.announcement.findUnique({
      where: { id: post.id },
      select: {
        id: true,
        title: true,
        content: true,
        requireAck: true,
        createdAt: true,
        ackEveryone: true,
        ackTitles: true,
        ackUserIds: true,
        ...EMAIL_MEETING_SELECT,
        author: { select: EMAIL_AUTHOR_SELECT },
      },
    });
    // "same as who needs to ack / who's invited" reuses the ack audience (with an
    // optional add for the Program Director); otherwise use the email picker.
    const sameAsAck = formData.get("emailSameAsAck") === "on";
    const res = sameAsAck
      ? await emailAnnouncement(full, ackAudienceWhere(full), {
          includeDirector: formData.get("emailIncludeDirector") === "on",
        })
      : await emailAnnouncement(full, emailAudienceWhere(parseEmailAudience(formData)));
    revalidatePath("/portal/announcements");
    // post still got created; only the email could no-op. flag why so the user
    // knows nothing went out (no audience picked, or email not configured).
    if (!res.ok && res.reason === "config") {
      redirect(`/portal/announcements/${post.id}?error=emailConfig`);
    }
    if (!res.ok && res.reason === "recipients") {
      redirect(`/portal/announcements/${post.id}?error=recipients`);
    }
    redirect(`/portal/announcements/${post.id}?sent=${res.sent}`);
  }

  revalidatePath("/portal/announcements");
  redirect(`/portal/announcements/${post.id}`);
}

export async function deletePost(postId) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, imageUrl: true, deletedAt: true },
  });
  if (!post || post.deletedAt) {
    redirect("/portal/announcements");
  }

  const canDelete = post.authorId === user.id || isModerator(user.role);
  if (!canDelete) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }

  await prisma.announcement.update({
    where: { id: postId },
    data: { deletedAt: new Date(), imageUrl: null },
  });
  await tryDeleteBlob(post.imageUrl);

  revalidatePath("/portal/announcements");
  redirect("/portal/announcements?deleted=1");
}

export async function editPost(postId, formData) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, deletedAt: true },
  });
  if (!post || post.deletedAt) {
    redirect("/portal/announcements");
  }
  if (post.authorId !== user.id) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }

  const tag = formData.get("tag");
  if (!isValidAnnouncementTag(tag)) {
    redirect(`/portal/announcements/${postId}/edit?error=tag`);
  }
  const title = cleanBody(formData.get("title"), ANNOUNCEMENT_TITLE_MAX);
  if (!title) {
    redirect(`/portal/announcements/${postId}/edit?error=title`);
  }
  if (isChangelog(tag) && !isIT(user.role)) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }
  const content = cleanBody(
    formData.get("content"),
    isChangelog(tag) ? CHANGELOG_CONTENT_MAX : POST_CONTENT_MAX,
  );
  if (!content) {
    redirect(`/portal/announcements/${postId}/edit?error=content`);
  }
  const expiresAt = parseDateField(formData.get("expiresAt"));
  const requireAck = formData.get("requireAck") === "on";
  const ackAudience = parseAckAudience(
    formData,
    requireAck || isCompanyMeeting(tag),
  );
  if (requireAck && ackAudienceEmpty(ackAudience)) {
    redirect(`/portal/announcements/${postId}/edit?error=ackAudience`);
  }
  const { ackEveryone, ackTitles, ackUserIds } = ackAudience;

  await prisma.announcement.update({
    where: { id: postId },
    data: {
      title,
      content,
      tag,
      expiresAt,
      requireAck,
      ackEveryone,
      ackTitles,
      ackUserIds,
      ...parseMeetingFields(formData, tag),
      editedAt: new Date(),
    },
  });

  revalidatePath("/portal/announcements");
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

export async function togglePin(postId) {
  const user = await requireUser();
  if (!isModerator(user.role)) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, pinnedAt: true, deletedAt: true },
  });
  if (!post || post.deletedAt) {
    redirect("/portal/announcements");
  }

  if (post.pinnedAt) {
    await prisma.announcement.update({
      where: { id: postId },
      data: { pinnedAt: null, pinnedById: null },
    });
  } else {
    await prisma.announcement.update({
      where: { id: postId },
      data: { pinnedAt: new Date(), pinnedById: user.id },
    });
  }

  revalidatePath("/portal/announcements");
  revalidatePath(`/portal/announcements/${postId}`);
}

export async function toggleLike(postId) {
  const user = await requireUser();
  const existing = await prisma.announcementLike.findUnique({
    where: { announcementId_userId: { announcementId: postId, userId: user.id } },
  });
  if (existing) {
    await prisma.announcementLike.delete({
      where: { announcementId_userId: { announcementId: postId, userId: user.id } },
    });
  } else {
    const post = await prisma.announcement.findUnique({
      where: { id: postId },
      select: { id: true, deletedAt: true },
    });
    if (!post || post.deletedAt) {
      redirect("/portal/announcements");
    }
    await prisma.announcementLike.create({
      data: { announcementId: postId, userId: user.id },
    });
  }
  revalidatePath("/portal/announcements");
  revalidatePath(`/portal/announcements/${postId}`);
}

// ----------- COMMENTS -----------

export async function addComment(postId, formData) {
  const user = await requireUser();
  const content = cleanBody(formData.get("content"), COMMENT_CONTENT_MAX);
  if (!content) {
    redirect(`/portal/announcements/${postId}?error=comment`);
  }
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, deletedAt: true },
  });
  if (!post || post.deletedAt) {
    redirect("/portal/announcements");
  }

  await prisma.announcementComment.create({
    data: { announcementId: postId, authorId: user.id, content },
  });
  revalidatePath(`/portal/announcements/${postId}`);
  revalidatePath("/portal/announcements");
}

export async function editComment(commentId, formData) {
  const user = await requireUser();
  const comment = await prisma.announcementComment.findUnique({
    where: { id: commentId },
    select: { id: true, announcementId: true, authorId: true, deletedAt: true },
  });
  if (!comment || comment.deletedAt) {
    redirect("/portal/announcements");
  }
  if (comment.authorId !== user.id) {
    redirect(`/portal/announcements/${comment.announcementId}?error=forbidden`);
  }
  const content = cleanBody(formData.get("content"), COMMENT_CONTENT_MAX);
  if (!content) {
    redirect(`/portal/announcements/${comment.announcementId}?error=comment`);
  }
  await prisma.announcementComment.update({
    where: { id: commentId },
    data: { content, editedAt: new Date() },
  });
  revalidatePath(`/portal/announcements/${comment.announcementId}`);
}

export async function deleteComment(commentId) {
  const user = await requireUser();
  const comment = await prisma.announcementComment.findUnique({
    where: { id: commentId },
    select: { id: true, announcementId: true, authorId: true, deletedAt: true },
  });
  if (!comment || comment.deletedAt) {
    redirect("/portal/announcements");
  }
  const canDelete = comment.authorId === user.id || isModerator(user.role);
  if (!canDelete) {
    redirect(`/portal/announcements/${comment.announcementId}?error=forbidden`);
  }
  await prisma.announcementComment.update({
    where: { id: commentId },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/portal/announcements/${comment.announcementId}`);
}

// ----------- ACKNOWLEDGMENTS -----------

// staff "I read this" from inside the portal. idempotent (upsert on the
// composite PK). only people on the expected list (mustAcknowledge) can ack -
// managers+ dont get a box.
export async function acknowledge(postId) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, requireAck: true, deletedAt: true },
  });
  if (!post || post.deletedAt || !post.requireAck) {
    redirect(`/portal/announcements/${postId}`);
  }
  if (!isAckExempt(user)) {
    await prisma.announcementAck.upsert({
      where: {
        announcementId_userId: { announcementId: postId, userId: user.id },
      },
      create: { announcementId: postId, userId: user.id, viaEmail: false },
      update: {},
    });
  }
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// is this user in the meeting's audience (who's invited)?
function meetingInAudience(post, user) {
  return post.ackEveryone
    ? !isAckExempt(user)
    : (post.ackTitles || []).some((t) =>
        (user.title || "").toLowerCase().includes(t.toLowerCase()),
      ) || (post.ackUserIds || []).includes(user.id);
}

// a meeting response (going or cant make it) also records the acknowledgment,
// so a meeting that requires ack is satisfied by responding.
async function markMeetingAck(postId, user, requireAck) {
  if (requireAck && !isAckExempt(user)) {
    await prisma.announcementAck.upsert({
      where: {
        announcementId_userId: { announcementId: postId, userId: user.id },
      },
      create: { announcementId: postId, userId: user.id, viaEmail: false },
      update: {},
    });
  }
}

const MEETING_RESPONSE_SELECT = {
  id: true,
  deletedAt: true,
  meetingOptions: true,
  meetingMultiPick: true,
  requireAck: true,
  ackEveryone: true,
  ackTitles: true,
  ackUserIds: true,
};

// pick or unpick a meeting session option. single-pick replaces any prior
// choice (clicking the same one clears it); multi-pick toggles just that one.
// only people in the meeting audience may pick. picking marks them "going"
// (clears any "cant make it"); unpicking the last one drops the response.
export async function chooseMeetingOption(postId, optionId) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: MEETING_RESPONSE_SELECT,
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  const opts = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  if (!opts.some((o) => o && o.id === optionId)) {
    redirect(`/portal/announcements/${postId}`);
  }
  if (!meetingInAudience(post, user)) redirect(`/portal/announcements/${postId}`);

  const key = {
    announcementId_userId_optionId: {
      announcementId: postId,
      userId: user.id,
      optionId,
    },
  };
  const existing = await prisma.announcementMeetingChoice.findUnique({ where: key });
  if (post.meetingMultiPick) {
    if (existing) {
      await prisma.announcementMeetingChoice.delete({ where: key });
    } else {
      await prisma.announcementMeetingChoice.create({
        data: { announcementId: postId, userId: user.id, optionId },
      });
    }
  } else {
    await prisma.announcementMeetingChoice.deleteMany({
      where: { announcementId: postId, userId: user.id },
    });
    if (!existing) {
      await prisma.announcementMeetingChoice.create({
        data: { announcementId: postId, userId: user.id, optionId },
      });
    }
  }

  // sync the response: going if any pick remains, otherwise back to no-response.
  const respKey = {
    announcementId_userId: { announcementId: postId, userId: user.id },
  };
  const remaining = await prisma.announcementMeetingChoice.count({
    where: { announcementId: postId, userId: user.id },
  });
  if (remaining > 0) {
    await prisma.announcementMeetingResponse.upsert({
      where: respKey,
      create: { announcementId: postId, userId: user.id, cantMakeIt: false },
      update: { cantMakeIt: false, reason: null },
    });
    await markMeetingAck(postId, user, post.requireAck);
  } else {
    await prisma.announcementMeetingResponse.deleteMany({
      where: { announcementId: postId, userId: user.id },
    });
  }
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// single-session "I'll be there" toggle (no session options to pick). sets the
// response to going, or clears it if they were already going.
export async function attendMeeting(postId) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: MEETING_RESPONSE_SELECT,
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  if (!meetingInAudience(post, user)) redirect(`/portal/announcements/${postId}`);
  const respKey = {
    announcementId_userId: { announcementId: postId, userId: user.id },
  };
  const existing = await prisma.announcementMeetingResponse.findUnique({
    where: respKey,
  });
  if (existing && !existing.cantMakeIt) {
    await prisma.announcementMeetingResponse.delete({ where: respKey });
  } else {
    await prisma.announcementMeetingResponse.upsert({
      where: respKey,
      create: { announcementId: postId, userId: user.id, cantMakeIt: false },
      update: { cantMakeIt: false, reason: null },
    });
    await markMeetingAck(postId, user, post.requireAck);
  }
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// "I can't make it / can't make any of these" + an optional reason. clears any
// session picks and marks the response as cant make it.
export async function cantMakeMeeting(postId, formData) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: MEETING_RESPONSE_SELECT,
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  if (!meetingInAudience(post, user)) redirect(`/portal/announcements/${postId}`);
  const reason =
    (formData.get("reason") || "").toString().trim().slice(0, 300) || null;
  await prisma.announcementMeetingChoice.deleteMany({
    where: { announcementId: postId, userId: user.id },
  });
  await prisma.announcementMeetingResponse.upsert({
    where: {
      announcementId_userId: { announcementId: postId, userId: user.id },
    },
    create: { announcementId: postId, userId: user.id, cantMakeIt: true, reason },
    update: { cantMakeIt: true, reason },
  });
  await markMeetingAck(postId, user, post.requireAck);
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// add / update the Zoom link + passcode on an existing meeting (e.g. it was
// created "link provided later"). author or a moderator. adding a link clears
// the "provided later" flag; clearing the link leaves that flag as-is.
export async function setMeetingLink(postId, formData) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, deletedAt: true, meetingFormat: true },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  if (post.authorId !== user.id && !isModerator(user.role)) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }
  if (!formatHasOnline(post.meetingFormat)) {
    redirect(`/portal/announcements/${postId}`);
  }
  const link =
    (formData.get("zoomLink") || "").toString().trim().slice(0, 500) || null;
  const code =
    (formData.get("zoomCode") || "").toString().trim().slice(0, 60) || null;
  await prisma.announcement.update({
    where: { id: postId },
    data: { zoomLink: link, zoomCode: code, ...(link ? { zoomLinkTbd: false } : {}) },
  });
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// roll-call (Phase B): mark a going attendee present / absent, or clear it.
// Supervisor+ or the author. only touches "going" responses.
export async function setAttendance(postId, userId, status) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, deletedAt: true },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  if (!isSupervisorUp(user.role) && post.authorId !== user.id) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }
  const value = status === "present" || status === "absent" ? status : null;
  await prisma.announcementMeetingResponse.updateMany({
    where: { announcementId: postId, userId, cantMakeIt: false },
    data: { attended: value },
  });
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ackEmailHtml({ firstName, title, snippet, url }) {
  // simple inline-styled email - trusted internal content, but escaped anyway.
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1f2937;">
    <p style="font-size: 15px;">Hi ${escapeHtml(firstName)},</p>
    <p style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">${escapeHtml(title)}</p>
    <p style="font-size: 14px; line-height: 1.6; color: #4b5563; white-space: pre-wrap;">${escapeHtml(snippet)}</p>
    <p style="margin: 26px 0;">
      <a href="${url}" style="display: inline-block; background: #2f6f4f; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-size: 15px; font-weight: 600;">Acknowledge that I've read this</a>
    </p>
    <p style="font-size: 12px; color: #6b7280;">One click confirms it, no login needed. If the button doesnt work, paste this into your browser:<br /><a href="${url}" style="color: #2f6f4f;">${url}</a></p>
  </div>`;
}

// "Send to staff by email" - emails an individualized one-click ack link to
// every active person on the expected list who hasnt acknowledged yet (so a
// re-send only nudges the stragglers). Supervisor+ only. best-effort: a send
// failure is logged, not fatal. stamps ackEmailSentAt when at least one went.
export async function sendAckEmails(postId) {
  const user = await requireUser();
  if (!isSupervisorUp(user.role)) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: {
      id: true,
      title: true,
      content: true,
      requireAck: true,
      deletedAt: true,
      ackEveryone: true,
      ackTitles: true,
      ackUserIds: true,
    },
  });
  if (!post || post.deletedAt || !post.requireAck) {
    redirect(`/portal/announcements/${postId}`);
  }

  const from = process.env.ANNOUNCEMENTS_FROM || process.env.AUTH_RESEND_FROM;
  const base = (process.env.AUTH_URL || "").replace(/\/$/, "");
  if (!from || !base || !process.env.RESEND_API_KEY) {
    console.error(
      "ack email misconfigured - missing ANNOUNCEMENTS_FROM/AUTH_RESEND_FROM, AUTH_URL, or RESEND_API_KEY",
    );
    redirect(`/portal/announcements/${postId}?error=emailConfig`);
  }

  // recipients = this announcement's audience (NOT every staffer) who hasn't
  // acked yet, so the roster button can only nudge the people it's actually for.
  const recipients = await prisma.user.findMany({
    where: {
      ...ackAudienceWhere(post),
      announcementAcks: { none: { announcementId: postId } },
    },
    select: {
      id: true,
      email: true,
      name: true,
      preferredFirstName: true,
      preferredLastName: true,
    },
  });

  if (!recipients.length) {
    redirect(`/portal/announcements/${postId}?sent=0`);
  }

  const title = post.title || "New announcement";
  const snippet = (post.content || "").slice(0, 240);
  const subject = `Please acknowledge: ${title}`;
  const messages = recipients.map((r) => {
    const url = `${base}/a/ack/${signAckToken(postId, r.id)}`;
    const firstName = firstNameOf(r) || "there";
    return {
      from,
      to: [r.email],
      subject,
      html: ackEmailHtml({ firstName, title, snippet, url }),
      text: `Hi ${firstName},\n\n${snippet}\n\nAcknowledge that you've read this: ${url}\n\nOne click confirms it, no login needed.`,
    };
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;
  try {
    // resend.batch.send takes up to 100 messages per call; chunk for safety.
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const { error } = await resend.batch.send(chunk);
      if (error) {
        console.error("ack email batch error:", error);
      } else {
        sent += chunk.length;
      }
    }
  } catch (e) {
    console.error("ack email send threw:", e);
  }

  if (sent > 0) {
    await prisma.announcement.update({
      where: { id: postId },
      data: { ackEmailSentAt: new Date() },
    });
  }

  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}?sent=${sent}`);
}

// the prisma `where` for the "Who gets the email?" picker: Everyone = all active
// (incl. the Owner/Director), else the picked titles/people. null = nobody.
function emailAudienceWhere({ everyone, titles, userIds = [] }) {
  if (everyone) return { deactivatedAt: null };
  if (!titles?.length && !userIds?.length) return null;
  return {
    deactivatedAt: null,
    OR: [
      ...titles.map((t) => titleSegmentMatch(t)),
      ...(userIds.length ? [{ id: { in: userIds } }] : []),
    ],
  };
}

// core email send, shared by the dialog AND the create form. `where` is the
// recipient query (null = nobody). `includeDirector` also adds the Owner/
// Director (used by "same as ack" where they're otherwise excluded). when the
// announcement requires ack, each email carries that person's one-click link.
// best-effort; stamps ackEmailSentAt when any go out. returns { ok, sent,
// reason }. `post` must include id/title/content/requireAck/createdAt + author.
async function emailAnnouncement(post, where, { includeDirector = false } = {}) {
  const from = process.env.ANNOUNCEMENTS_FROM || process.env.AUTH_RESEND_FROM;
  const base = (process.env.AUTH_URL || "").replace(/\/$/, "");
  if (!from || !base || !process.env.RESEND_API_KEY) {
    console.error("announcement email misconfigured - missing from/base/key");
    return { ok: false, reason: "config", sent: 0 };
  }
  if (!where) return { ok: false, reason: "recipients", sent: 0 };
  const select = {
    id: true,
    email: true,
    name: true,
    preferredFirstName: true,
    preferredLastName: true,
  };
  const recipients = await prisma.user.findMany({ where, select });
  if (includeDirector) {
    const director = await prisma.user.findFirst({
      where: { deactivatedAt: null, OR: titleSegmentMatch(ACK_EXEMPT_TITLE).OR },
      select,
    });
    if (director && !recipients.some((r) => r.id === director.id)) {
      recipients.push(director);
    }
  }
  if (!recipients.length) return { ok: true, sent: 0 };

  const title = post.title || "Announcement";
  const subject = post.requireAck ? `Acknowledgment required: ${title}` : title;
  const bodyHtml = renderMarkdown(post.content);
  const dateStr = new Date(post.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const logoUrl = `${base}/logo/treelogo_white.png`;
  const authorName = preferredName(post.author);
  const authorTitle = post.author?.title || null;
  const meetingHtml = buildMeetingBlockHtml(post);

  const messages = recipients.map((r) => {
    const ackUrl = post.requireAck
      ? `${base}/a/ack/${signAckToken(post.id, r.id)}`
      : null;
    const html = buildAnnouncementEmailHtml({
      logoUrl,
      title,
      authorName,
      authorTitle,
      dateStr,
      requireAck: post.requireAck,
      bodyHtml,
      ackUrl,
      meetingHtml,
    });
    const firstName = firstNameOf(r) || "there";
    const text =
      post.requireAck && ackUrl
        ? `${title}\n\nHi ${firstName}, please read this announcement and acknowledge: ${ackUrl}`
        : `${title}\n\nHi ${firstName}, a new announcement was posted. View it in the portal.`;
    return { from, to: [r.email], subject, html, text };
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;
  try {
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const { error } = await resend.batch.send(chunk);
      if (error) console.error("announcement email batch error:", error);
      else sent += chunk.length;
    }
  } catch (e) {
    console.error("announcement email send threw:", e);
  }

  if (sent > 0) {
    await prisma.announcement.update({
      where: { id: post.id },
      data: { ackEmailSentAt: new Date() },
    });
  }
  return { ok: true, sent };
}

const EMAIL_AUTHOR_SELECT = {
  name: true,
  preferredFirstName: true,
  preferredLastName: true,
  title: true,
};

// meeting fields the email needs to render the access block.
const EMAIL_MEETING_SELECT = {
  tag: true,
  meetingFormat: true,
  zoomLink: true,
  zoomCode: true,
  meetingAddress: true,
  meetingAt: true,
  meetingTimezone: true,
  meetingDurationFromMin: true,
  meetingDurationToMin: true,
  meetingOptions: true,
};

// "Send by email" dialog action. Supervisor+ only.
export async function sendAnnouncementEmail(postId, formData) {
  const user = await requireUser();
  if (!isSupervisorUp(user.role)) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: {
      id: true,
      title: true,
      content: true,
      requireAck: true,
      deletedAt: true,
      createdAt: true,
      ...EMAIL_MEETING_SELECT,
      author: { select: EMAIL_AUTHOR_SELECT },
    },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");

  const everyone = formData.get("everyone") === "on";
  const titles = formData
    .getAll("titles")
    .filter((t) => typeof t === "string" && t);
  const userIds = formData
    .getAll("userIds")
    .filter((t) => typeof t === "string" && t);
  if (!everyone && titles.length === 0 && userIds.length === 0) {
    redirect(`/portal/announcements/${postId}?error=recipients`);
  }
  const res = await emailAnnouncement(
    post,
    emailAudienceWhere({ everyone, titles, userIds }),
  );
  if (!res.ok && res.reason === "config") {
    redirect(`/portal/announcements/${postId}?error=emailConfig`);
  }
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}?sent=${res.sent}`);
}
