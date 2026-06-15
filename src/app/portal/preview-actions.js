"use server";

// set / clear the "view as role" preview cookie. the guard here reads the
// REAL role straight from the db (not getCurrentUser, which would already
// have the preview applied) so preview can only be toggled by an actual
// IT/SUPER account, and canPreviewRole stops it from ever stepping up.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isIT } from "@/lib/roles";
import { PREVIEW_COOKIE, canPreviewRole } from "@/lib/preview";

async function realRole() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const u = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, deactivatedAt: true },
  });
  if (!u || u.deactivatedAt) return null;
  return u.role;
}

export async function setPreviewRole(formData) {
  const target = formData.get("role");
  const real = await realRole();
  if (!isIT(real)) return; // only IT/SUPER may preview

  const store = await cookies();
  if (target === real || !canPreviewRole(real, target)) {
    // picking your own role (or anything not allowed) just clears preview
    store.delete(PREVIEW_COOKIE);
  } else {
    store.set(PREVIEW_COOKIE, target, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8, // auto-expires after 8h so preview can't linger forever
    });
  }
  revalidatePath("/portal", "layout");
}

export async function clearPreviewRole() {
  const store = await cookies();
  store.delete(PREVIEW_COOKIE);
  revalidatePath("/portal", "layout");
}
