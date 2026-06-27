"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { notifyOversight } from "@/lib/notify";
import { isElevated, isIT } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import {
  cleanBody,
  isValidType,
  isValidStatus,
  isClosedStatus,
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  FB_TITLE_MAX,
  FB_BODY_MAX,
} from "@/lib/feedback";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

async function uploadImage(file) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Image upload isnt configured yet.");
  }
  const ext = (file.name?.split(".").pop() || "bin").toLowerCase().slice(0, 8);
  const key = `feedback/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const blob = await put(key, file, { access: "public", contentType: file.type });
  return blob.url;
}

async function tryDeleteBlob(url) {
  if (!url || !process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    await del(url);
  } catch {
    // ignore
  }
}

export async function submitFeedback(formData) {
  const user = await requireUser();

  const type = formData.get("type");
  if (!isValidType(type)) redirect("/portal/feedback/new?error=type");

  const title = cleanBody(formData.get("title"), FB_TITLE_MAX);
  if (!title) redirect("/portal/feedback/new?error=title");

  const body = cleanBody(formData.get("body"), FB_BODY_MAX);
  if (!body) redirect("/portal/feedback/new?error=body");

  let imageUrl = null;
  const file = formData.get("image");
  if (file && typeof file === "object" && "size" in file && file.size > 0) {
    if (!IMAGE_ACCEPT.includes(file.type)) {
      redirect("/portal/feedback/new?error=imageType");
    }
    if (file.size > IMAGE_MAX_BYTES) {
      redirect("/portal/feedback/new?error=imageSize");
    }
    try {
      imageUrl = await uploadImage(file);
    } catch {
      redirect("/portal/feedback/new?error=imageUpload");
    }
  }

  await prisma.feedbackItem.create({
    data: { type, title, body, imageUrl, authorId: user.id },
  });

  await notifyOversight({
    type: "FEEDBACK_NEW",
    title: type === "BUG" ? "New bug report" : "New suggestion",
    body: `${preferredName(user)} submitted "${title}".`,
    link: "/portal/feedback",
    exceptUserId: user.id,
  });

  revalidatePath("/portal/feedback");
  redirect("/portal/feedback?submitted=1");
}

// move an item through its lifecycle. In progress / Complete / Reopen
// are management actions (any elevated role). Discard (DECLINED) is
// IT-only since it hides the item from everyone else's board.
export async function setFeedbackStatus(itemId, status) {
  const user = await requireUser();
  if (!isValidStatus(status)) {
    redirect("/portal/feedback");
  }
  const allowed =
    status === "DECLINED" ? isIT(user.role) : isElevated(user.role);
  if (!allowed) {
    redirect("/portal/feedback?error=forbidden");
  }
  const item = await prisma.feedbackItem.findUnique({
    where: { id: itemId },
    select: { id: true },
  });
  if (!item) redirect("/portal/feedback");

  const closing = isClosedStatus(status);
  await prisma.feedbackItem.update({
    where: { id: itemId },
    data: {
      status,
      resolvedById: closing ? user.id : null,
      resolvedAt: closing ? new Date() : null,
    },
  });
  revalidatePath("/portal/feedback");
}

export async function deleteFeedback(itemId) {
  const user = await requireUser();
  const item = await prisma.feedbackItem.findUnique({
    where: { id: itemId },
    select: { id: true, authorId: true, imageUrl: true },
  });
  if (!item) redirect("/portal/feedback");

  // author can delete their own; elevated can delete anything.
  if (item.authorId !== user.id && !isElevated(user.role)) {
    redirect("/portal/feedback?error=forbidden");
  }

  await prisma.feedbackItem.delete({ where: { id: itemId } });
  await tryDeleteBlob(item.imageUrl);

  revalidatePath("/portal/feedback");
  redirect("/portal/feedback?deleted=1");
}
