"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isModerator } from "@/lib/roles";
import {
  cleanBody,
  isValidTag,
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  POST_CONTENT_MAX,
  COMMENT_CONTENT_MAX,
} from "@/lib/hub";

// helper: get the signed-in user or bounce. every action calls this so
// we re-check auth on every mutation (defense in depth - proxy.js
// already gates /portal/* but JWT could be stale).
async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// helper: parse <input type="date"> ("YYYY-MM-DD") into a Date or null.
function parseDateField(raw) {
  if (typeof raw !== "string" || !raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// helper: upload a File to Vercel Blob, return the public URL. throws
// with a clean message if BLOB_READ_WRITE_TOKEN isnt configured yet.
async function uploadImage(file) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "Image upload isnt configured yet. Create a Blob store in Vercel.",
    );
  }
  // randomize filename to avoid collisions + keep originals private.
  // path: hub/<timestamp>-<random>.<ext>
  const ext = (file.name?.split(".").pop() || "bin").toLowerCase().slice(0, 8);
  const key = `hub/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const blob = await put(key, file, {
    access: "public",
    contentType: file.type,
  });
  return blob.url;
}

// helper: best-effort delete a blob by URL. used when a post with an
// image is hard-deleted. swallow errors - we never want a missing blob
// to block the rest of the cleanup.
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

  const content = cleanBody(formData.get("content"), POST_CONTENT_MAX);
  if (!content) {
    redirect("/portal/hub/new?error=content");
  }

  const tag = formData.get("tag");
  if (!isValidTag(tag)) {
    redirect("/portal/hub/new?error=tag");
  }

  const expiresAt = parseDateField(formData.get("expiresAt"));

  // optional image. File object from FormData. size 0 = no file picked.
  let imageUrl = null;
  const file = formData.get("image");
  if (file && typeof file === "object" && "size" in file && file.size > 0) {
    if (!IMAGE_ACCEPT.includes(file.type)) {
      redirect("/portal/hub/new?error=imageType");
    }
    if (file.size > IMAGE_MAX_BYTES) {
      redirect("/portal/hub/new?error=imageSize");
    }
    try {
      imageUrl = await uploadImage(file);
    } catch {
      redirect("/portal/hub/new?error=imageUpload");
    }
  }

  const post = await prisma.post.create({
    data: {
      authorId: user.id,
      content,
      tag,
      expiresAt,
      imageUrl,
    },
  });

  revalidatePath("/portal/hub");
  redirect(`/portal/hub/${post.id}`);
}

export async function deletePost(postId) {
  const user = await requireUser();
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, imageUrl: true, deletedAt: true },
  });
  if (!post || post.deletedAt) {
    redirect("/portal/hub");
  }

  const canDelete = post.authorId === user.id || isModerator(user.role);
  if (!canDelete) {
    redirect(`/portal/hub/${postId}?error=forbidden`);
  }

  // soft delete (preserve comment thread). blob is cleaned up since
  // it wont be referenced anymore.
  await prisma.post.update({
    where: { id: postId },
    data: { deletedAt: new Date(), imageUrl: null },
  });
  await tryDeleteBlob(post.imageUrl);

  revalidatePath("/portal/hub");
  redirect("/portal/hub?deleted=1");
}

export async function editPost(postId, formData) {
  const user = await requireUser();
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, deletedAt: true },
  });
  if (!post || post.deletedAt) {
    redirect("/portal/hub");
  }
  // only the original author can edit. moderators can delete but
  // shouldnt rewrite someone elses words.
  if (post.authorId !== user.id) {
    redirect(`/portal/hub/${postId}?error=forbidden`);
  }

  const content = cleanBody(formData.get("content"), POST_CONTENT_MAX);
  if (!content) {
    redirect(`/portal/hub/${postId}/edit?error=content`);
  }
  const tag = formData.get("tag");
  if (!isValidTag(tag)) {
    redirect(`/portal/hub/${postId}/edit?error=tag`);
  }
  const expiresAt = parseDateField(formData.get("expiresAt"));

  await prisma.post.update({
    where: { id: postId },
    data: { content, tag, expiresAt, editedAt: new Date() },
  });

  revalidatePath("/portal/hub");
  revalidatePath(`/portal/hub/${postId}`);
  redirect(`/portal/hub/${postId}`);
}

export async function togglePin(postId) {
  const user = await requireUser();
  // only moderators can pin / unpin
  if (!isModerator(user.role)) {
    redirect(`/portal/hub/${postId}?error=forbidden`);
  }
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, pinnedAt: true, deletedAt: true },
  });
  if (!post || post.deletedAt) {
    redirect("/portal/hub");
  }

  if (post.pinnedAt) {
    await prisma.post.update({
      where: { id: postId },
      data: { pinnedAt: null, pinnedById: null },
    });
  } else {
    await prisma.post.update({
      where: { id: postId },
      data: { pinnedAt: new Date(), pinnedById: user.id },
    });
  }

  revalidatePath("/portal/hub");
  revalidatePath(`/portal/hub/${postId}`);
}

export async function toggleLike(postId) {
  const user = await requireUser();
  const existing = await prisma.postLike.findUnique({
    where: { postId_userId: { postId, userId: user.id } },
  });
  if (existing) {
    await prisma.postLike.delete({
      where: { postId_userId: { postId, userId: user.id } },
    });
  } else {
    // verify post exists + not soft-deleted before creating like
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, deletedAt: true },
    });
    if (!post || post.deletedAt) {
      redirect("/portal/hub");
    }
    await prisma.postLike.create({
      data: { postId, userId: user.id },
    });
  }
  revalidatePath("/portal/hub");
  revalidatePath(`/portal/hub/${postId}`);
}

// ----------- COMMENTS -----------

export async function addComment(postId, formData) {
  const user = await requireUser();
  const content = cleanBody(formData.get("content"), COMMENT_CONTENT_MAX);
  if (!content) {
    redirect(`/portal/hub/${postId}?error=comment`);
  }
  // verify post exists + isnt deleted
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, deletedAt: true },
  });
  if (!post || post.deletedAt) {
    redirect("/portal/hub");
  }

  await prisma.comment.create({
    data: { postId, authorId: user.id, content },
  });
  revalidatePath(`/portal/hub/${postId}`);
  revalidatePath("/portal/hub");
}

export async function editComment(commentId, formData) {
  const user = await requireUser();
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, postId: true, authorId: true, deletedAt: true },
  });
  if (!comment || comment.deletedAt) {
    redirect("/portal/hub");
  }
  if (comment.authorId !== user.id) {
    redirect(`/portal/hub/${comment.postId}?error=forbidden`);
  }
  const content = cleanBody(formData.get("content"), COMMENT_CONTENT_MAX);
  if (!content) {
    redirect(`/portal/hub/${comment.postId}?error=comment`);
  }
  await prisma.comment.update({
    where: { id: commentId },
    data: { content, editedAt: new Date() },
  });
  revalidatePath(`/portal/hub/${comment.postId}`);
}

export async function deleteComment(commentId) {
  const user = await requireUser();
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, postId: true, authorId: true, deletedAt: true },
  });
  if (!comment || comment.deletedAt) {
    redirect("/portal/hub");
  }
  const canDelete =
    comment.authorId === user.id || isModerator(user.role);
  if (!canDelete) {
    redirect(`/portal/hub/${comment.postId}?error=forbidden`);
  }
  await prisma.comment.update({
    where: { id: commentId },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/portal/hub/${comment.postId}`);
}
