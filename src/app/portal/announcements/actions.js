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
  mustAcknowledge,
  EXPECTED_ACK_ROLES,
} from "@/lib/roles";
import { firstNameOf, preferredName } from "@/lib/contacts";
import { signAckToken } from "@/lib/ack-token";
import { renderMarkdown } from "@/lib/markdown";
import { buildAnnouncementEmailHtml } from "@/lib/announcement-email";
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
  ANNOUNCEMENT_TITLE_MAX,
  CHANGELOG_CONTENT_MAX,
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
// staff set) or a list of job titles. only meaningful when requireAck; falls
// back to Everyone if nothing specific is picked so the roster is never empty.
function parseAckAudience(formData, requireAck) {
  if (!requireAck) return { ackEveryone: true, ackTitles: [], ackUserIds: [] };
  const everyone = formData.get("ackEveryone") === "on";
  const titles = formData
    .getAll("ackTitles")
    .filter((t) => typeof t === "string" && t);
  const userIds = formData
    .getAll("ackUserIds")
    .filter((t) => typeof t === "string" && t);
  if (everyone || (titles.length === 0 && userIds.length === 0)) {
    return { ackEveryone: true, ackTitles: [], ackUserIds: [] };
  }
  return { ackEveryone: false, ackTitles: titles, ackUserIds: userIds };
}

// the "send as email" audience on the create form - its own picker, separate
// from the ack audience. not stored (the email goes out at post time).
function parseEmailAudience(formData) {
  const everyone = formData.get("emailEveryone") === "on";
  const titles = formData
    .getAll("emailTitles")
    .filter((t) => typeof t === "string" && t);
  const userIds = formData
    .getAll("emailUserIds")
    .filter((t) => typeof t === "string" && t);
  if (everyone || (titles.length === 0 && userIds.length === 0)) {
    return { everyone: true, titles: [], userIds: [] };
  }
  return { everyone: false, titles, userIds };
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

  const requireAck = formData.get("requireAck") === "on";
  const sendEmail = formData.get("sendEmail") === "on";
  // ack audience (stored, drives the roster) and the email audience (its own
  // picker, used to send now) are independent.
  const { ackEveryone, ackTitles, ackUserIds } = parseAckAudience(
    formData,
    requireAck,
  );

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
        author: { select: EMAIL_AUTHOR_SELECT },
      },
    });
    const res = await emailAnnouncement(full, parseEmailAudience(formData));
    revalidatePath("/portal/announcements");
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
  const { ackEveryone, ackTitles, ackUserIds } = parseAckAudience(
    formData,
    requireAck,
  );

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
  if (mustAcknowledge(user.role)) {
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

  const recipients = await prisma.user.findMany({
    where: {
      role: { in: EXPECTED_ACK_ROLES },
      deactivatedAt: null,
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

// core email send, shared by the "Send by email" dialog AND the "send as email
// now" option on the create form. emails the changelog-style email to an
// audience (Everyone = all active, or anyone whose job title matches). when the
// announcement requires ack, each email carries that person's one-click ack
// link. best-effort; stamps ackEmailSentAt when any go out. returns { ok, sent,
// reason }. `post` must include id/title/content/requireAck/createdAt + author.
async function emailAnnouncement(post, { everyone, titles, userIds = [] }) {
  const from = process.env.ANNOUNCEMENTS_FROM || process.env.AUTH_RESEND_FROM;
  const base = (process.env.AUTH_URL || "").replace(/\/$/, "");
  if (!from || !base || !process.env.RESEND_API_KEY) {
    console.error("announcement email misconfigured - missing from/base/key");
    return { ok: false, reason: "config", sent: 0 };
  }
  const where = { deactivatedAt: null };
  if (!everyone) {
    if (!titles?.length && !userIds?.length) {
      return { ok: false, reason: "recipients", sent: 0 };
    }
    where.OR = [
      ...titles.map((t) => ({ title: { contains: t, mode: "insensitive" } })),
      ...(userIds.length ? [{ id: { in: userIds } }] : []),
    ];
  }
  const recipients = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      preferredFirstName: true,
      preferredLastName: true,
    },
  });
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
  const res = await emailAnnouncement(post, { everyone, titles, userIds });
  if (!res.ok && res.reason === "config") {
    redirect(`/portal/announcements/${postId}?error=emailConfig`);
  }
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}?sent=${res.sent}`);
}
