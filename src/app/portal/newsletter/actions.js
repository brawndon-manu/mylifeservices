"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated } from "@/lib/roles";
import {
  cleanBody,
  isValidCategory,
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  NL_TITLE_MAX,
  NL_BODY_MAX,
  NL_NOTE_MAX,
} from "@/lib/newsletter";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

async function requireElevated() {
  const user = await requireUser();
  if (!isElevated(user.role)) {
    redirect("/portal/newsletter?error=forbidden");
  }
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
    throw new Error("Image upload isnt configured yet.");
  }
  const ext = (file.name?.split(".").pop() || "bin").toLowerCase().slice(0, 8);
  const key = `newsletter/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
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

// ---- staff submission ----

export async function submitItem(formData) {
  const user = await requireUser();

  const title = cleanBody(formData.get("title"), NL_TITLE_MAX);
  if (!title) redirect("/portal/newsletter/new?error=title");

  const body = cleanBody(formData.get("body"), NL_BODY_MAX);
  if (!body) redirect("/portal/newsletter/new?error=body");

  const category = formData.get("category");
  if (!isValidCategory(category)) {
    redirect("/portal/newsletter/new?error=category");
  }

  const eventDate = parseDateField(formData.get("eventDate"));

  // optional image
  let imageUrl = null;
  const file = formData.get("image");
  const hasImage =
    file && typeof file === "object" && "size" in file && file.size > 0;

  // consent gate: if a photo is attached, the submitter MUST confirm
  // written consent is on file for anyone pictured. this is a public
  // page so we never let client imagery through without it.
  const consentConfirmed = formData.get("consent") === "on";
  if (hasImage && !consentConfirmed) {
    redirect("/portal/newsletter/new?error=consent");
  }

  if (hasImage) {
    if (!IMAGE_ACCEPT.includes(file.type)) {
      redirect("/portal/newsletter/new?error=imageType");
    }
    if (file.size > IMAGE_MAX_BYTES) {
      redirect("/portal/newsletter/new?error=imageSize");
    }
    try {
      imageUrl = await uploadImage(file);
    } catch {
      redirect("/portal/newsletter/new?error=imageUpload");
    }
  }

  await prisma.newsletterItem.create({
    data: {
      title,
      body,
      category,
      eventDate,
      imageUrl,
      consentConfirmed: hasImage ? true : consentConfirmed,
      submittedById: user.id,
    },
  });

  revalidatePath("/portal/newsletter");
  redirect("/portal/newsletter?submitted=1");
}

// ---- reviewer actions (elevated) ----

export async function approveItem(itemId) {
  const user = await requireElevated();
  const item = await prisma.newsletterItem.findUnique({
    where: { id: itemId },
    select: { id: true, status: true },
  });
  if (!item) redirect("/portal/newsletter/review");
  // only pending items can be approved
  if (item.status !== "SUBMITTED") {
    redirect("/portal/newsletter/review");
  }
  await prisma.newsletterItem.update({
    where: { id: itemId },
    data: {
      status: "APPROVED",
      approvedById: user.id,
      approvedAt: new Date(),
      reviewNote: null,
    },
  });
  revalidatePath("/portal/newsletter/review");
}

export async function rejectItem(itemId, formData) {
  await requireElevated();
  const item = await prisma.newsletterItem.findUnique({
    where: { id: itemId },
    select: { id: true, status: true },
  });
  if (!item) redirect("/portal/newsletter/review");
  if (item.status === "PUBLISHED") {
    // unpublish first if you want to reject a live item
    redirect("/portal/newsletter/review");
  }
  const note = cleanBody(formData.get("note"), NL_NOTE_MAX);
  await prisma.newsletterItem.update({
    where: { id: itemId },
    data: { status: "REJECTED", reviewNote: note },
  });
  revalidatePath("/portal/newsletter/review");
}

export async function publishItem(itemId) {
  const user = await requireElevated();
  const item = await prisma.newsletterItem.findUnique({
    where: { id: itemId },
    select: { id: true, status: true },
  });
  if (!item) redirect("/portal/newsletter/review");
  // only approved items can be pushed live
  if (item.status !== "APPROVED") {
    redirect("/portal/newsletter/review");
  }
  await prisma.newsletterItem.update({
    where: { id: itemId },
    data: {
      status: "PUBLISHED",
      publishedById: user.id,
      publishedAt: new Date(),
    },
  });
  revalidatePath("/portal/newsletter/review");
  revalidatePath("/this-week");
}

export async function unpublishItem(itemId) {
  await requireElevated();
  const item = await prisma.newsletterItem.findUnique({
    where: { id: itemId },
    select: { id: true, status: true },
  });
  if (!item) redirect("/portal/newsletter/review");
  if (item.status !== "PUBLISHED") {
    redirect("/portal/newsletter/review");
  }
  // pull it back to APPROVED so it leaves the public page but can be
  // re-published later.
  await prisma.newsletterItem.update({
    where: { id: itemId },
    data: { status: "APPROVED", publishedAt: null, publishedById: null },
  });
  revalidatePath("/portal/newsletter/review");
  revalidatePath("/this-week");
}

export async function deleteItem(itemId) {
  const user = await requireUser();
  const item = await prisma.newsletterItem.findUnique({
    where: { id: itemId },
    select: { id: true, submittedById: true, imageUrl: true, status: true },
  });
  if (!item) redirect("/portal/newsletter");

  // submitter can delete their own item while it isnt published.
  // elevated can delete anything.
  const ownUnpublished =
    item.submittedById === user.id && item.status !== "PUBLISHED";
  if (!ownUnpublished && !isElevated(user.role)) {
    redirect("/portal/newsletter?error=forbidden");
  }

  await prisma.newsletterItem.delete({ where: { id: itemId } });
  await tryDeleteBlob(item.imageUrl);

  revalidatePath("/portal/newsletter");
  revalidatePath("/portal/newsletter/review");
  revalidatePath("/this-week");
  redirect("/portal/newsletter?deleted=1");
}
