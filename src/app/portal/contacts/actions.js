"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated } from "@/lib/roles";
import { cleanBody } from "@/lib/hub";
import {
  formatUSPhone,
  isValidResourceCategory,
  RESOURCE_NAME_MAX,
  RESOURCE_NOTES_MAX,
  RESOURCE_URL_MAX,
} from "@/lib/contacts";
import { cleanEmail } from "@/lib/security";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

async function requireElevated() {
  const user = await requireUser();
  if (!isElevated(user.role)) {
    redirect("/portal/contacts?error=forbidden");
  }
  return user;
}

// light url cleaner - prepend https:// if no scheme, cap length.
function cleanUrl(raw) {
  if (typeof raw !== "string") return null;
  let v = raw.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  return v.slice(0, RESOURCE_URL_MAX);
}

export async function submitResource(formData) {
  const user = await requireUser();

  const name = cleanBody(formData.get("name"), RESOURCE_NAME_MAX);
  if (!name) redirect("/portal/contacts/resources/new?error=name");

  // category must be one of the predefined buckets; anything else falls
  // back to "Other" so every resource groups cleanly.
  const rawCategory = formData.get("category");
  const category = isValidResourceCategory(rawCategory) ? rawCategory : "Other";

  // org phone auto-formats too, e.g. +17149952542 -> +1 (714) 995-2542
  const phone = formatUSPhone(formData.get("phone"));
  const emailRaw = formData.get("email");
  const email =
    typeof emailRaw === "string" && emailRaw.trim()
      ? cleanEmail(emailRaw) || null
      : null;
  const website = cleanUrl(formData.get("website"));
  const notes = cleanBody(formData.get("notes"), RESOURCE_NOTES_MAX);

  // elevated submissions are auto-approved (they're the approvers
  // anyway). everyone else lands in the pending queue.
  const elevated = isElevated(user.role);

  await prisma.resource.create({
    data: {
      name,
      category,
      phone,
      email,
      website,
      notes,
      submittedById: user.id,
      status: elevated ? "APPROVED" : "PENDING",
      approvedById: elevated ? user.id : null,
      approvedAt: elevated ? new Date() : null,
    },
  });

  revalidatePath("/portal/contacts");
  redirect(elevated ? "/portal/contacts?added=1" : "/portal/contacts?submitted=1");
}

export async function approveResource(resourceId) {
  const user = await requireElevated();
  const r = await prisma.resource.findUnique({
    where: { id: resourceId },
    select: { id: true },
  });
  if (!r) redirect("/portal/contacts/resources/review");
  await prisma.resource.update({
    where: { id: resourceId },
    data: {
      status: "APPROVED",
      approvedById: user.id,
      approvedAt: new Date(),
      reviewNote: null,
    },
  });
  revalidatePath("/portal/contacts");
  revalidatePath("/portal/contacts/resources/review");
}

export async function rejectResource(resourceId, formData) {
  await requireElevated();
  const note = cleanBody(formData.get("note"), RESOURCE_NOTES_MAX);
  await prisma.resource.update({
    where: { id: resourceId },
    data: { status: "REJECTED", reviewNote: note },
  });
  revalidatePath("/portal/contacts/resources/review");
}

export async function deleteResource(resourceId) {
  const user = await requireUser();
  const r = await prisma.resource.findUnique({
    where: { id: resourceId },
    select: { id: true, submittedById: true, status: true },
  });
  if (!r) redirect("/portal/contacts");

  // submitter can delete their own while it's still pending; elevated
  // can delete anything.
  const ownPending = r.submittedById === user.id && r.status === "PENDING";
  if (!ownPending && !isElevated(user.role)) {
    redirect("/portal/contacts?error=forbidden");
  }
  await prisma.resource.delete({ where: { id: resourceId } });
  revalidatePath("/portal/contacts");
  revalidatePath("/portal/contacts/resources/review");
  redirect("/portal/contacts?deleted=1");
}
