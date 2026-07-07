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
  isAdminUp,
  isIT,
  isSuper,
} from "@/lib/roles";
import { firstNameOf, preferredName } from "@/lib/contacts";
import { ACK_EXEMPT_TITLE } from "@/lib/positions";
import { signAckToken } from "@/lib/ack-token";
import { renderMarkdown } from "@/lib/markdown";
import {
  buildAnnouncementEmailHtml,
  buildMeetingBlockHtml,
  postButton,
  EMAIL_TZ,
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
  computeMeetingLocks,
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
            // each online session can carry its own Zoom link + passcode.
            const sLink =
              online && typeof o.zoomLink === "string" && o.zoomLink.trim()
                ? o.zoomLink.trim().slice(0, 500)
                : null;
            const sCode =
              online && typeof o.zoomCode === "string" && o.zoomCode.trim()
                ? o.zoomCode.trim().slice(0, 60)
                : null;
            // series mode: an option belongs to a named series (attendees pick
            // one option from each series). null when it's a plain session list.
            const seriesId =
              typeof o.seriesId === "string" && o.seriesId
                ? o.seriesId.slice(0, 60)
                : null;
            const seriesLabel =
              seriesId && typeof o.seriesLabel === "string" && o.seriesLabel.trim()
                ? o.seriesLabel.trim().slice(0, 80)
                : null;
            return {
              id: String(o.id || `opt${i}`),
              label: o.label.trim().slice(0, 140),
              at,
              tz: at && typeof o.tz === "string" ? o.tz.slice(0, 60) : null,
              durationFromMin: posInt(o.durationFromMin),
              durationToMin: posInt(o.durationToMin),
              zoomLink: sLink,
              zoomCode: sCode,
              seriesId,
              seriesLabel,
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
  // ack/invite audience (stored, drives the roster). validate before uploading
  // the image so a rejected post doesn't orphan a blob. email is decided later,
  // at Publish time - creating just makes a draft.
  const ackAudience = parseAckAudience(
    formData,
    requireAck || isCompanyMeeting(tag),
  );
  // meetings need an invite list, and require-ack needs an ack audience - the
  // same picker drives both. empty isn't allowed for either (no silent Everyone).
  if ((requireAck || isCompanyMeeting(tag)) && ackAudienceEmpty(ackAudience)) {
    const err = isCompanyMeeting(tag) && !requireAck ? "meetingAudience" : "ackAudience";
    redirect(`/portal/announcements/new?error=${err}`);
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

  // created as a DRAFT (publishedAt stays null). it isn't in the feed and no
  // email goes out yet - the author lands on the preview and publishes from there.
  revalidatePath("/portal/announcements");
  redirect(`/portal/announcements/${post.id}`);
}

// publish a draft: stamp publishedAt (it enters the feed), and - per the publish
// dialog - email the audience now. v1 emails "same as invitees" (the invite/ack
// audience) for meetings + ack posts; a plain post can opt to email everyone.
export async function publishAnnouncement(postId, formData) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: {
      id: true,
      authorId: true,
      deletedAt: true,
      publishedAt: true,
      tag: true,
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
  if (!post || post.deletedAt) redirect("/portal/announcements");
  if (post.authorId !== user.id && !isModerator(user.role)) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }
  if (post.publishedAt) redirect(`/portal/announcements/${postId}`); // already live

  await prisma.announcement.update({
    where: { id: postId },
    data: { publishedAt: new Date() },
  });

  let res = { sent: 0 };
  if (formData?.get("doEmail") === "on") {
    const hasAudience = isCompanyMeeting(post.tag) || post.requireAck;
    // ack/meeting posts email their invited audience; a plain post emails whoever
    // the author picked in the publish dialog (Everyone or specific titles/people).
    const where = hasAudience
      ? ackAudienceWhere(post)
      : emailAudienceWhere({
          everyone: formData.get("emailEveryone") === "on",
          titles: formData.getAll("emailTitles").filter((t) => typeof t === "string" && t),
          userIds: formData.getAll("emailUserIds").filter((t) => typeof t === "string" && t),
        });
    if (where) res = await emailAnnouncement(post, where);
  }

  revalidatePath("/portal/announcements");
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(
    `/portal/announcements/${postId}?published=1${res.sent ? `&sent=${res.sent}` : ""}`,
  );
}

// discard a draft entirely (it was never published, so nothing is saved). hard
// delete; cascades take care of any rows. drafts only.
export async function discardDraft(postId) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, postedById: true, deletedAt: true, publishedAt: true, imageUrl: true },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  const canDiscard =
    post.authorId === user.id || post.postedById === user.id || isModerator(user.role);
  if (post.publishedAt || !canDiscard) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }
  await tryDeleteBlob(post.imageUrl);
  await prisma.announcement.delete({ where: { id: postId } });
  revalidatePath("/portal/announcements");
  redirect("/portal/announcements?discarded=1");
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
    select: {
      id: true,
      authorId: true,
      postedById: true,
      deletedAt: true,
      publishedAt: true,
      tag: true,
      meetingOptions: true,
      meetingAt: true,
    },
  });
  if (!post || post.deletedAt) {
    redirect("/portal/announcements");
  }
  const isDraft = !post.publishedAt;
  // the author can edit; Super can edit anyone's; for a draft posted on someone's
  // behalf, the actual poster (postedBy) can edit too.
  if (
    post.authorId !== user.id &&
    !isSuper(user.role) &&
    !(isDraft && post.postedById === user.id)
  ) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }

  // "Post as" re-attribution is allowed only while it's still a draft.
  let authorUpdate = {};
  const postAs = formData.get("postAs");
  if (isDraft && isElevated(user.role) && typeof postAs === "string" && postAs) {
    if (postAs === user.id) {
      authorUpdate = { authorId: user.id, postedById: null };
    } else {
      const target = await prisma.user.findFirst({
        where: { id: postAs, deactivatedAt: null },
        select: { id: true },
      });
      if (!target) redirect(`/portal/announcements/${postId}/edit?error=postAs`);
      authorUpdate = { authorId: target.id, postedById: user.id };
    }
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
  if ((requireAck || isCompanyMeeting(tag)) && ackAudienceEmpty(ackAudience)) {
    const err = isCompanyMeeting(tag) && !requireAck ? "meetingAudience" : "ackAudience";
    redirect(`/portal/announcements/${postId}/edit?error=${err}`);
  }
  const { ackEveryone, ackTitles, ackUserIds } = ackAudience;

  const meetingFields = parseMeetingFields(formData, tag);
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
      ...authorUpdate,
      ...meetingFields,
      editedAt: new Date(),
    },
  });

  // if this is a published meeting and any session's start time moved, reset the
  // picks for just those sessions (attendees re-RSVP) and, per the author's
  // choice, email the affected people or everyone invited about the change.
  let reset = 0;
  let emailed = 0;
  if (isCompanyMeeting(tag) && post.publishedAt) {
    const affected = await resetChangedMeetingSessions(post, meetingFields);
    reset = affected.length;
    const notify = formData.get("timeChangeNotify");
    if (affected.length && (notify === "affected" || notify === "everyone")) {
      const emailPost = await prisma.announcement.findUnique({
        where: { id: postId },
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
      const where =
        notify === "everyone"
          ? ackAudienceWhere(emailPost)
          : { id: { in: affected } };
      const res = await emailAnnouncement(emailPost, where);
      emailed = res?.sent || 0;
    }
  }

  revalidatePath("/portal/announcements");
  revalidatePath(`/portal/announcements/${postId}`);
  const q = reset
    ? `?reset=${reset}${emailed ? `&emailed=${emailed}` : ""}`
    : "";
  redirect(`/portal/announcements/${postId}${q}`);
}

// after a meeting edit, find which sessions changed start time and reset just
// those picks (attendees re-RSVP). returns the affected user ids for the optional
// notify email. compares stored vs new instants, so an unchanged session (same
// time round-tripped) isn't touched.
async function resetChangedMeetingSessions(post, newFields) {
  const oldOpts = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  const newOpts = Array.isArray(newFields.meetingOptions) ? newFields.meetingOptions : [];
  const oldById = new Map(oldOpts.filter((o) => o && o.id).map((o) => [o.id, o]));
  const instant = (v) => (v ? new Date(v).getTime() : null);

  const changedIds = [];
  for (const o of newOpts) {
    if (!o || !o.id) continue;
    const old = oldById.get(o.id);
    if (old && instant(old.at) !== instant(o.at)) changedIds.push(o.id);
  }
  const singleChanged =
    oldOpts.length === 0 &&
    newOpts.length === 0 &&
    Boolean(post.meetingAt || newFields.meetingAt) &&
    instant(post.meetingAt) !== instant(newFields.meetingAt);

  if (!changedIds.length && !singleChanged) return [];

  if (changedIds.length) {
    const choices = await prisma.announcementMeetingChoice.findMany({
      where: { announcementId: post.id, optionId: { in: changedIds } },
      select: { userId: true },
    });
    const affected = [...new Set(choices.map((c) => c.userId))];
    await prisma.announcementMeetingChoice.deleteMany({
      where: { announcementId: post.id, optionId: { in: changedIds } },
    });
    // anyone left with no real pick goes back to no-response (must re-RSVP).
    for (const uid of affected) {
      const remaining = await prisma.announcementMeetingChoice.findMany({
        where: { announcementId: post.id, userId: uid },
        select: { optionId: true },
      });
      const realLeft = remaining.filter((c) => !String(c.optionId).startsWith("cant:"));
      if (realLeft.length === 0) {
        await prisma.announcementMeetingResponse.deleteMany({
          where: { announcementId: post.id, userId: uid },
        });
        await clearMeetingResponseAck(post.id, uid);
      }
    }
    return affected;
  }
  // single-session time moved: reset everyone who was going.
  const going = await prisma.announcementMeetingResponse.findMany({
    where: { announcementId: post.id, cantMakeIt: false },
    select: { userId: true },
  });
  const affected = going.map((r) => r.userId);
  await prisma.announcementMeetingResponse.deleteMany({
    where: { announcementId: post.id, cantMakeIt: false },
  });
  for (const uid of affected) await clearMeetingResponseAck(post.id, uid);
  return affected;
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

// retracting a meeting response also clears the auto-ack that responding created
// (viaEmail=false, since for a meeting "responding counts as acknowledgment"). a
// real one-click email ack (viaEmail=true) is left intact.
async function clearMeetingResponseAck(postId, userId) {
  await prisma.announcementAck.deleteMany({
    where: { announcementId: postId, userId, viaEmail: false },
  });
}

const MEETING_RESPONSE_SELECT = {
  id: true,
  deletedAt: true,
  meetingOptions: true,
  meetingMultiPick: true,
  meetingAt: true,
  requireAck: true,
  ackEveryone: true,
  ackTitles: true,
  ackUserIds: true,
};

// the attendee's current picks + response mark, for computing what's locked.
async function loadMyMeetingState(postId, userId) {
  const [myChoices, resp] = await Promise.all([
    prisma.announcementMeetingChoice.findMany({
      where: { announcementId: postId, userId },
      select: { optionId: true, attended: true },
    }),
    prisma.announcementMeetingResponse.findUnique({
      where: { announcementId_userId: { announcementId: postId, userId } },
      select: { attended: true },
    }),
  ]);
  return { myChoices, myAttended: resp?.attended || null };
}

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
    await clearMeetingResponseAck(postId, user.id);
  }
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// set the user's whole session pick-set at once (the "Confirm attendance" flow).
// replaces any existing picks with the submitted optionIds (capped to 1 unless
// the meeting allows multi-pick), then syncs the going/no-response state.
export async function setMeetingChoices(postId, formData) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: MEETING_RESPONSE_SELECT,
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  if (!meetingInAudience(post, user)) redirect(`/portal/announcements/${postId}`);
  const opts = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  const optById = new Map(opts.map((o) => [o.id, o]));
  const isSeries = opts.some((o) => o && o.seriesId);
  const seriesIds = new Set(opts.map((o) => o && o.seriesId).filter(Boolean));
  // valid = real option ids, plus a "cant:<seriesId>" decline per series.
  const isCant = (id) => String(id).startsWith("cant:");
  const seriesOf = (id) => (isCant(id) ? id.slice(5) : optById.get(id)?.seriesId);
  const valid = (id) =>
    isCant(id) ? seriesIds.has(id.slice(5)) : optById.has(id);
  // what's already locked for this attendee (started sessions / marked picks).
  const { myChoices } = await loadMyMeetingState(postId, user.id);
  const locks = computeMeetingLocks({
    options: opts,
    myChoices,
    meetingAt: post.meetingAt,
    now: Date.now(),
  });

  let ids = [...new Set(formData.getAll("optionId").map(String))].filter(valid);
  if (isSeries) {
    const lockedSeries = new Set(locks.lockedSeriesIds);
    // one decision per series; ignore any change to a locked series.
    const bySeries = new Map();
    for (const id of ids) {
      const sid = seriesOf(id);
      if (lockedSeries.has(sid)) continue;
      bySeries.set(sid, id);
    }
    ids = [...bySeries.values()];
    // replace only the unlocked-series picks; keep the locked ones untouched.
    const toDelete = myChoices
      .map((c) => c.optionId)
      .filter((oid) => !lockedSeries.has(seriesOf(oid)));
    if (toDelete.length) {
      await prisma.announcementMeetingChoice.deleteMany({
        where: { announcementId: postId, userId: user.id, optionId: { in: toDelete } },
      });
    }
    if (ids.length) {
      await prisma.announcementMeetingChoice.createMany({
        data: ids.map((optionId) => ({ announcementId: postId, userId: user.id, optionId })),
        skipDuplicates: true,
      });
    }
  } else {
    // single / flat multi: the whole response is locked once it starts or is marked.
    if (locks.lockedAll) redirect(`/portal/announcements/${postId}?error=locked`);
    if (!post.meetingMultiPick) ids = ids.slice(0, 1);
    await prisma.announcementMeetingChoice.deleteMany({
      where: { announcementId: postId, userId: user.id },
    });
    if (ids.length) {
      await prisma.announcementMeetingChoice.createMany({
        data: ids.map((optionId) => ({ announcementId: postId, userId: user.id, optionId })),
        skipDuplicates: true,
      });
    }
  }

  // recompute the response from the FULL resulting pick set (kept + new).
  const finalChoices = await prisma.announcementMeetingChoice.findMany({
    where: { announcementId: postId, userId: user.id },
    select: { optionId: true },
  });
  const finalIds = finalChoices.map((c) => c.optionId);
  const respKey = {
    announcementId_userId: { announcementId: postId, userId: user.id },
  };
  // attending at least one real date = going; only can't-attend picks = can't make it.
  const realPicks = finalIds.filter((id) => !isCant(id));
  // a reason only applies when they declined at least one series.
  const hasCant = finalIds.some(isCant);
  const reason = hasCant
    ? (formData.get("reason") || "").toString().trim().slice(0, 300) || null
    : null;
  if (finalIds.length > 0) {
    await prisma.announcementMeetingResponse.upsert({
      where: respKey,
      create: { announcementId: postId, userId: user.id, cantMakeIt: realPicks.length === 0, reason },
      update: { cantMakeIt: realPicks.length === 0, reason },
    });
    await markMeetingAck(postId, user, post.requireAck);
  } else {
    await prisma.announcementMeetingResponse.deleteMany({
      where: { announcementId: postId, userId: user.id },
    });
    await clearMeetingResponseAck(postId, user.id);
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
  // single-session: once it starts or you're marked present/absent, it's locked.
  const locks = computeMeetingLocks({
    options: [],
    myChoices: [],
    meetingAt: post.meetingAt,
    myAttended: existing?.attended || null,
    now: Date.now(),
  });
  if (locks.lockedAll) redirect(`/portal/announcements/${postId}?error=locked`);
  if (existing && !existing.cantMakeIt) {
    await prisma.announcementMeetingResponse.delete({ where: respKey });
    await clearMeetingResponseAck(postId, user.id);
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
  // this "can't make any of these" path clears every pick, so refuse it if
  // anything is already locked (a started/marked session or series) - those can't
  // be retracted by the attendee.
  const { myChoices, myAttended } = await loadMyMeetingState(postId, user.id);
  const opts = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  const locks = computeMeetingLocks({
    options: opts,
    myChoices,
    meetingAt: post.meetingAt,
    myAttended,
    now: Date.now(),
  });
  if (locks.lockedAll || locks.lockedSeriesIds.length) {
    redirect(`/portal/announcements/${postId}?error=locked`);
  }
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
  // the Zoom link + passcode are admin-only.
  if (!isAdminUp(user.role)) {
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

// set the meeting's Zoom link(s) from the "Edit Zoom links" dialog. handles the
// "same for every session" case (one default link) and the per-session case
// (each session its own link, stored in meetingOptions). admin only.
export async function setMeetingZoomLinks(postId, formData) {
  const user = await requireUser();
  if (!isAdminUp(user.role)) redirect(`/portal/announcements/${postId}?error=forbidden`);
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, deletedAt: true, meetingFormat: true, meetingOptions: true },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  if (!formatHasOnline(post.meetingFormat)) redirect(`/portal/announcements/${postId}`);

  const clean = (v, max) => (v || "").toString().trim().slice(0, max) || null;
  const defLink = clean(formData.get("zoomLink"), 500);
  const defCode = clean(formData.get("zoomCode"), 60);
  const sameForAll = formData.get("sameForAll") === "on";

  const opts = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  let newOpts = opts;
  if (opts.length && !sameForAll) {
    // each session carries its own link/passcode; blank = fall back to default.
    newOpts = opts.map((o) =>
      o && o.id
        ? {
            ...o,
            zoomLink: clean(formData.get(`optZoomLink_${o.id}`), 500),
            zoomCode: clean(formData.get(`optZoomCode_${o.id}`), 60),
          }
        : o,
    );
  } else if (opts.length && sameForAll) {
    // "same for all": clear the per-session overrides so everyone uses default.
    newOpts = opts.map((o) => (o && o.id ? { ...o, zoomLink: null, zoomCode: null } : o));
  }

  await prisma.announcement.update({
    where: { id: postId },
    data: {
      zoomLink: defLink,
      zoomCode: defCode,
      ...(opts.length ? { meetingOptions: newOpts } : {}),
      ...(defLink ? { zoomLinkTbd: false } : {}),
    },
  });
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// write a present/absent/null mark. for a multi-session or series meeting the
// mark lives per session on the chosen option row; for a single-session meeting
// (no optionId) it stays on the response. shared by both roll-call actions.
async function writeAttendance(postId, userId, status, optionId) {
  const value = status === "present" || status === "absent" ? status : null;
  if (optionId) {
    await prisma.announcementMeetingChoice.updateMany({
      where: { announcementId: postId, userId, optionId },
      data: { attended: value },
    });
  } else {
    await prisma.announcementMeetingResponse.updateMany({
      where: { announcementId: postId, userId, cantMakeIt: false },
      data: { attended: value },
    });
  }
}

// roll-call: mark a going attendee present / absent for a session, or clear it.
// admin-and-up only. optionId set = per-session (multi/series); null = single.
export async function setAttendance(postId, userId, status, optionId = null) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, deletedAt: true },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  // roll-call (attendance) is admin-and-up only, matching who can see the roster.
  if (!isAdminUp(user.role)) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }
  await writeAttendance(postId, userId, status, optionId);
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// like setAttendance but RETURNS instead of redirecting, so the admin meeting-
// attendance card can mark roll-call inline without a full navigation (which would
// collapse the drill-down). status "" / anything else = back to neutral (unmarked).
export async function markAttendance(postId, userId, status, optionId = null) {
  const user = await requireUser();
  if (!isAdminUp(user.role)) return { ok: false };
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, deletedAt: true },
  });
  if (!post || post.deletedAt) return { ok: false };
  await writeAttendance(postId, userId, status, optionId);
  revalidatePath("/portal/admin/meeting-attendance");
  revalidatePath(`/portal/announcements/${postId}`);
  return { ok: true };
}

// ---- admin overrides on the roster (all Admin/IT/Super, all bypass locks) ----

// record an acknowledgment on someone's behalf. keeps an existing self/email ack
// as-is (only stamps recordedById when creating a fresh one).
async function recordAckFor(postId, userId, adminId) {
  await prisma.announcementAck.upsert({
    where: { announcementId_userId: { announcementId: postId, userId } },
    create: { announcementId: postId, userId, viaEmail: false, recordedById: adminId },
    update: {},
  });
}

// gate an admin roster action + load the meeting. returns the post or redirects.
async function requireAdminMeeting(postId) {
  const user = await requireUser();
  if (!isAdminUp(user.role)) redirect(`/portal/announcements/${postId}?error=forbidden`);
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: {
      id: true,
      deletedAt: true,
      meetingOptions: true,
      meetingMultiPick: true,
      requireAck: true,
    },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  return { user, post };
}

// ensure a person is "going" to optionId, clearing conflicting picks: the same
// series (series) or their single pick (single-pick meeting). shared by add +
// move. records the ack if the meeting requires one.
async function ensureGoingChoice(post, userId, optionId, adminId) {
  const opts = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  const target = opts.find((o) => o && o.id === optionId);
  if (!target) return false;
  if (target.seriesId) {
    const sameSeries = opts
      .filter((o) => o.seriesId === target.seriesId)
      .map((o) => o.id);
    await prisma.announcementMeetingChoice.deleteMany({
      where: {
        announcementId: post.id,
        userId,
        optionId: { in: [...sameSeries, `cant:${target.seriesId}`] },
      },
    });
  } else if (!post.meetingMultiPick) {
    await prisma.announcementMeetingChoice.deleteMany({
      where: { announcementId: post.id, userId },
    });
  }
  await prisma.announcementMeetingChoice.upsert({
    where: {
      announcementId_userId_optionId: { announcementId: post.id, userId, optionId },
    },
    create: { announcementId: post.id, userId, optionId },
    update: {},
  });
  await prisma.announcementMeetingResponse.upsert({
    where: { announcementId_userId: { announcementId: post.id, userId } },
    create: { announcementId: post.id, userId, cantMakeIt: false },
    update: { cantMakeIt: false, reason: null },
  });
  if (post.requireAck) await recordAckFor(post.id, userId, adminId);
  return true;
}

// record a whole response for someone (used by the series "Record response"
// picker: one date per series at once). replaces their pick-set with the
// submitted optionIds (one per series), sets going, records the ack.
export async function adminRecordChoices(postId, userId, formData) {
  const { user, post } = await requireAdminMeeting(postId);
  const opts = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  const optById = new Map(opts.filter((o) => o && o.id).map((o) => [o.id, o]));
  const isSeries = opts.some((o) => o && o.seriesId);
  const seriesIds = new Set(opts.map((o) => o && o.seriesId).filter(Boolean));
  const isCant = (id) => String(id).startsWith("cant:");
  const seriesOf = (id) => (isCant(id) ? id.slice(5) : optById.get(id)?.seriesId);
  const valid = (id) => (isCant(id) ? seriesIds.has(id.slice(5)) : optById.has(id));

  let ids = [...new Set(formData.getAll("optionId").map(String))].filter(valid);
  if (isSeries) {
    const bySeries = new Map();
    for (const id of ids) bySeries.set(seriesOf(id), id);
    ids = [...bySeries.values()];
  } else if (!post.meetingMultiPick) {
    ids = ids.slice(0, 1);
  }

  await prisma.announcementMeetingChoice.deleteMany({
    where: { announcementId: postId, userId },
  });
  if (ids.length) {
    await prisma.announcementMeetingChoice.createMany({
      data: ids.map((optionId) => ({ announcementId: postId, userId, optionId })),
      skipDuplicates: true,
    });
  }
  const realPicks = ids.filter((id) => !isCant(id));
  if (ids.length) {
    await prisma.announcementMeetingResponse.upsert({
      where: { announcementId_userId: { announcementId: postId, userId } },
      create: { announcementId: postId, userId, cantMakeIt: realPicks.length === 0 },
      update: { cantMakeIt: realPicks.length === 0, reason: null },
    });
    if (post.requireAck) await recordAckFor(postId, userId, user.id);
  } else {
    await prisma.announcementMeetingResponse.deleteMany({
      where: { announcementId: postId, userId },
    });
  }
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// walk-in / record-going: add someone to a session (used by "+ Add to this
// session" and by recording a no-response person as going).
export async function adminAddToSession(postId, userId, optionId) {
  const { user, post } = await requireAdminMeeting(postId);
  await ensureGoingChoice(post, userId, optionId, user.id);
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// move a pick from one session to another (kebab "Move to another session").
export async function adminMoveSession(postId, userId, fromOptionId, toOptionId) {
  const { user, post } = await requireAdminMeeting(postId);
  if (fromOptionId) {
    await prisma.announcementMeetingChoice.deleteMany({
      where: { announcementId: postId, userId, optionId: fromOptionId },
    });
  }
  await ensureGoingChoice(post, userId, toOptionId, user.id);
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// single-session: record a no-response person as going ("I'll be there" on their
// behalf).
export async function adminSetGoing(postId, userId) {
  const { user, post } = await requireAdminMeeting(postId);
  await prisma.announcementMeetingResponse.upsert({
    where: { announcementId_userId: { announcementId: postId, userId } },
    create: { announcementId: postId, userId, cantMakeIt: false },
    update: { cantMakeIt: false, reason: null },
  });
  if (post.requireAck) await recordAckFor(postId, userId, user.id);
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// record a person as can't-make-it (clears any picks).
export async function adminSetCantMake(postId, userId) {
  const { user, post } = await requireAdminMeeting(postId);
  await prisma.announcementMeetingChoice.deleteMany({
    where: { announcementId: postId, userId },
  });
  await prisma.announcementMeetingResponse.upsert({
    where: { announcementId_userId: { announcementId: postId, userId } },
    create: { announcementId: postId, userId, cantMakeIt: true },
    update: { cantMakeIt: true },
  });
  if (post.requireAck) await recordAckFor(postId, userId, user.id);
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// remove someone from the meeting entirely (response + picks + the auto-ack that
// responding created; a real one-click email ack is left intact).
export async function adminRemoveFromMeeting(postId, userId) {
  await requireAdminMeeting(postId);
  await prisma.announcementMeetingChoice.deleteMany({
    where: { announcementId: postId, userId },
  });
  await prisma.announcementMeetingResponse.deleteMany({
    where: { announcementId: postId, userId },
  });
  await prisma.announcementAck.deleteMany({
    where: { announcementId: postId, userId, viaEmail: false },
  });
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// add someone to the invite/ack audience without editing the whole post (appends
// to the specific-people list). optionally emails just that new person. admin
// only. works on a meeting or an ack-required announcement.
export async function adminAddInvitee(postId, userId, formData) {
  const user = await requireUser();
  if (!isAdminUp(user.role)) redirect(`/portal/announcements/${postId}?error=forbidden`);
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: {
      id: true,
      deletedAt: true,
      tag: true,
      requireAck: true,
      ackUserIds: true,
      title: true,
      content: true,
      createdAt: true,
      ackEveryone: true,
      ackTitles: true,
      ...EMAIL_MEETING_SELECT,
      author: { select: EMAIL_AUTHOR_SELECT },
    },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  if (!isCompanyMeeting(post.tag) && !post.requireAck) {
    redirect(`/portal/announcements/${postId}`);
  }
  const target = await prisma.user.findFirst({
    where: { id: userId, deactivatedAt: null },
    select: { id: true },
  });
  if (!target) redirect(`/portal/announcements/${postId}`);

  const ids = new Set(post.ackUserIds || []);
  if (!ids.has(userId)) {
    await prisma.announcement.update({
      where: { id: postId },
      data: { ackUserIds: [...ids, userId] },
    });
  }
  if (formData?.get("email") === "on") {
    await emailAnnouncement(post, { id: { in: [userId] } });
  }
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// remove an individually-added invitee (drops them from the specific-people
// list). someone invited via Everyone or a role can't be removed this way.
export async function adminRemoveInvitee(postId, userId) {
  const user = await requireUser();
  if (!isAdminUp(user.role)) redirect(`/portal/announcements/${postId}?error=forbidden`);
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, deletedAt: true, ackUserIds: true },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  await prisma.announcement.update({
    where: { id: postId },
    data: { ackUserIds: (post.ackUserIds || []).filter((id) => id !== userId) },
  });
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// mark / unmark an acknowledgment on someone's behalf. works for a plain ack
// announcement or a meeting. admin only.
export async function markAckFor(postId, userId) {
  const user = await requireUser();
  if (!isAdminUp(user.role)) redirect(`/portal/announcements/${postId}?error=forbidden`);
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, deletedAt: true },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  await recordAckFor(postId, userId, user.id);
  // no redirect - stays on whichever page called it (detail roster OR the admin
  // acknowledgments report), re-rendering with the fresh ack.
  revalidatePath(`/portal/announcements/${postId}`);
  revalidatePath("/portal/admin/acknowledgments");
}

export async function unmarkAckFor(postId, userId) {
  const user = await requireUser();
  if (!isAdminUp(user.role)) redirect(`/portal/announcements/${postId}?error=forbidden`);
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, deletedAt: true },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  await prisma.announcementAck.deleteMany({
    where: { announcementId: postId, userId },
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
    <p style="font-size: 14px; line-height: 1.6; color: #374151;">By clicking below, you acknowledge that you have read and understood the contents of this announcement.</p>
    <p style="margin: 22px 0;">
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

// meeting version of the roster nudge: email the invited people who haven't
// responded yet the meeting announcement (with the "Respond now" button).
// Supervisor+.
export async function emailMeetingNoResponse(postId) {
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
      createdAt: true,
      deletedAt: true,
      ackEveryone: true,
      ackTitles: true,
      ackUserIds: true,
      ...EMAIL_MEETING_SELECT,
      author: { select: EMAIL_AUTHOR_SELECT },
    },
  });
  if (!post || post.deletedAt || !isCompanyMeeting(post.tag)) {
    redirect(`/portal/announcements/${postId}`);
  }
  // invited people minus anyone who already responded.
  const audience = await prisma.user.findMany({
    where: ackAudienceWhere(post),
    select: { id: true },
  });
  const responders = await prisma.announcementMeetingResponse.findMany({
    where: { announcementId: postId },
    select: { userId: true },
  });
  const responded = new Set(responders.map((r) => r.userId));
  const noRespIds = audience.map((u) => u.id).filter((id) => !responded.has(id));
  if (!noRespIds.length) {
    redirect(`/portal/announcements/${postId}?sent=0`);
  }
  const res = await emailAnnouncement(post, { id: { in: noRespIds } });
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}?sent=${res?.sent || 0}`);
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
    timeZone: EMAIL_TZ,
  });
  const logoUrl = `${base}/logo/treelogo_white.png`;
  const authorName = preferredName(post.author);
  const authorTitle = post.author?.title || null;
  const meetingHtml = buildMeetingBlockHtml(post);
  // button straight to the post so they can respond / read it in the portal.
  const ctaHtml = postButton(
    `${base}/portal/announcements/${post.id}`,
    isCompanyMeeting(post.tag) ? "Respond now" : "Go to the announcement",
  );

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
      ctaHtml,
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
