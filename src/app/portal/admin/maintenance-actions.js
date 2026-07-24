"use server";

// flips maintenance mode on/off. IT / SUPER only, re-checked here against the
// REAL role read straight from the db (not getCurrentUser, which could carry a
// "view as role" preview). the switch itself lives in upstash redis so it takes
// effect across the site within a few seconds, no redeploy.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isIT } from "@/lib/roles";
import { setMaintenance } from "@/lib/maintenance";

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

export async function toggleMaintenance(formData) {
  const real = await realRole();
  if (!isIT(real)) return; // IT / SUPER only

  const next = formData.get("next") === "on";
  await setMaintenance(next);
  revalidatePath("/portal/admin");
}
