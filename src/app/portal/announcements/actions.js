"use server";

// Announcements actions - one-for-one with the Hub (src/app/portal/hub/
// actions.js) but on the Announcement models, and with the single caveat that
// only Supervisor+ (isSupervisorUp) can create a post. everyone can comment,
// like, edit/delete their own; moderators can delete others + pin.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isModerator, isElevated, isSupervisorUp, isIT } from "@/lib/roles";
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
  // Changelog is IT/Super only + needs a title (renders as a release note) and
  // gets a much larger content limit than a plain post.
  let title = null;
  if (isChangelog(tag)) {
    if (!isIT(user.role)) {
      redirect("/portal/announcements?error=forbidden");
    }
    title = cleanBody(formData.get("title"), ANNOUNCEMENT_TITLE_MAX);
    if (!title) {
      redirect("/portal/announcements/new?error=title");
    }
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

  const post = await prisma.announcement.create({
    data: {
      authorId,
      postedById,
      title,
      content,
      tag,
      expiresAt,
      imageUrl,
    },
  });

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
  let title = null;
  if (isChangelog(tag)) {
    if (!isIT(user.role)) {
      redirect(`/portal/announcements/${postId}?error=forbidden`);
    }
    title = cleanBody(formData.get("title"), ANNOUNCEMENT_TITLE_MAX);
    if (!title) {
      redirect(`/portal/announcements/${postId}/edit?error=title`);
    }
  }
  const content = cleanBody(
    formData.get("content"),
    isChangelog(tag) ? CHANGELOG_CONTENT_MAX : POST_CONTENT_MAX,
  );
  if (!content) {
    redirect(`/portal/announcements/${postId}/edit?error=content`);
  }
  const expiresAt = parseDateField(formData.get("expiresAt"));

  await prisma.announcement.update({
    where: { id: postId },
    data: { title, content, tag, expiresAt, editedAt: new Date() },
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
