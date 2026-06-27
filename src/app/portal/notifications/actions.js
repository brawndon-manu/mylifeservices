"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// mark one notification read (only the owner can), then jump to its target.
export async function openNotification(formData) {
  const user = await requireUser();
  const id = formData.get("id");
  const link = formData.get("link");
  const n = await prisma.notification.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (n && n.userId === user.id) {
    await prisma.notification.update({ where: { id }, data: { read: true } });
  }
  // refresh the nav bell count (it lives in the portal layout).
  revalidatePath("/portal", "layout");
  redirect(typeof link === "string" && link.startsWith("/") ? link : "/portal/notifications");
}

// flip a single notification's read state (the dot/check toggle on each row).
export async function toggleRead(formData) {
  const user = await requireUser();
  const id = formData.get("id");
  const filter = formData.get("filter");
  const n = await prisma.notification.findUnique({
    where: { id },
    select: { userId: true, read: true },
  });
  if (n && n.userId === user.id) {
    await prisma.notification.update({ where: { id }, data: { read: !n.read } });
  }
  revalidatePath("/portal", "layout");
  redirect(filter === "unread" ? "/portal/notifications?filter=unread" : "/portal/notifications");
}

export async function markAllRead() {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  });
  // refresh both the page and the nav bell (which lives in the layout).
  revalidatePath("/portal", "layout");
  redirect("/portal/notifications");
}
