"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { cleanBody } from "@/lib/hub";
import {
  isValidSection,
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  SITE_PHOTO_CAPTION_MAX,
  SITE_PHOTO_ALT_MAX,
} from "@/lib/site-photos";

// site photos drive public-facing imagery, so managing them is Admin/IT/Super
// only (same tier that edits resources). every action re-checks server-side.
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdminUp(user.role)) redirect("/portal?error=forbidden");
  return user;
}

async function uploadImage(file, section) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Image upload isnt configured yet.");
  }
  const ext = (file.name?.split(".").pop() || "bin").toLowerCase().slice(0, 8);
  const key = `site/${section}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.${ext}`;
  const blob = await put(key, file, { access: "public", contentType: file.type });
  return blob.url;
}

async function tryDeleteBlob(url) {
  if (!url || !process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    await del(url);
  } catch {
    // ignore - orphaned blob is harmless
  }
}

function revalidate() {
  revalidatePath("/portal/site-photos");
  revalidatePath("/about");
}

export async function addPhoto(formData) {
  const user = await requireAdmin();

  const section = formData.get("section");
  if (!isValidSection(section)) {
    redirect("/portal/site-photos?error=section");
  }

  const file = formData.get("image");
  const hasImage =
    file && typeof file === "object" && "size" in file && file.size > 0;
  if (!hasImage) redirect("/portal/site-photos?error=noImage");

  // consent gate - these go on the public site, so a signed release must
  // be on file for anyone pictured. no exceptions.
  if (formData.get("consent") !== "on") {
    redirect("/portal/site-photos?error=consent");
  }

  if (!IMAGE_ACCEPT.includes(file.type)) {
    redirect("/portal/site-photos?error=imageType");
  }
  if (file.size > IMAGE_MAX_BYTES) {
    redirect("/portal/site-photos?error=imageSize");
  }

  const caption = cleanBody(formData.get("caption"), SITE_PHOTO_CAPTION_MAX);
  const alt = cleanBody(formData.get("alt"), SITE_PHOTO_ALT_MAX);

  let url;
  try {
    url = await uploadImage(file, section);
  } catch {
    redirect("/portal/site-photos?error=imageUpload");
  }

  // new photo goes to the end of its section.
  const last = await prisma.sitePhoto.findFirst({
    where: { section },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  await prisma.sitePhoto.create({
    data: {
      url,
      section,
      caption: caption || null,
      alt: alt || null,
      sortOrder,
      consentConfirmed: true,
      uploadedById: user.id,
    },
  });

  revalidate();
  redirect("/portal/site-photos?added=1");
}

export async function updatePhoto(id, formData) {
  await requireAdmin();
  const photo = await prisma.sitePhoto.findUnique({ where: { id } });
  if (!photo) redirect("/portal/site-photos");

  const caption = cleanBody(formData.get("caption"), SITE_PHOTO_CAPTION_MAX);
  const alt = cleanBody(formData.get("alt"), SITE_PHOTO_ALT_MAX);

  await prisma.sitePhoto.update({
    where: { id },
    data: { caption: caption || null, alt: alt || null },
  });

  revalidate();
  redirect("/portal/site-photos?saved=1");
}

export async function toggleActive(id) {
  await requireAdmin();
  const photo = await prisma.sitePhoto.findUnique({
    where: { id },
    select: { active: true },
  });
  if (!photo) redirect("/portal/site-photos");
  await prisma.sitePhoto.update({
    where: { id },
    data: { active: !photo.active },
  });
  revalidate();
}

// move a photo up or down within its section by swapping sortOrder with
// the adjacent neighbor. dir = "up" | "down".
export async function movePhoto(id, dir) {
  await requireAdmin();
  const photo = await prisma.sitePhoto.findUnique({ where: { id } });
  if (!photo) redirect("/portal/site-photos");

  const neighbor = await prisma.sitePhoto.findFirst({
    where: {
      section: photo.section,
      sortOrder: dir === "up" ? { lt: photo.sortOrder } : { gt: photo.sortOrder },
    },
    orderBy: { sortOrder: dir === "up" ? "desc" : "asc" },
  });
  if (!neighbor) {
    // already at the end in that direction - nothing to do.
    revalidate();
    return;
  }

  // swap the two sortOrders in one transaction.
  await prisma.$transaction([
    prisma.sitePhoto.update({
      where: { id: photo.id },
      data: { sortOrder: neighbor.sortOrder },
    }),
    prisma.sitePhoto.update({
      where: { id: neighbor.id },
      data: { sortOrder: photo.sortOrder },
    }),
  ]);
  revalidate();
}

export async function deletePhoto(id) {
  await requireAdmin();
  const photo = await prisma.sitePhoto.findUnique({ where: { id } });
  if (!photo) redirect("/portal/site-photos");
  await prisma.sitePhoto.delete({ where: { id } });
  await tryDeleteBlob(photo.url);
  revalidate();
  redirect("/portal/site-photos?deleted=1");
}
