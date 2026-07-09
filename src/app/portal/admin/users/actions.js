"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { notifyOversight } from "@/lib/notify";
import { cleanEmail, cleanDisplayName, isLockedSuperEmail } from "@/lib/security";
import {
  ROLE_LABELS,
  isElevated,
  isIT,
  isManagerUp,
  isSuper,
  isValidRole,
  canAssignRole,
  canManageUser,
} from "@/lib/roles";
import { resolveTitle, OFFICES } from "@/lib/positions";
import { preferredName } from "@/lib/contacts";
import { formatUSPhone, WORKING_HOURS_MAX } from "@/lib/contacts";

const NAME_MAX_LEN = 30;

// only keep office codes we know about (MLS / DP / any future ones).
function cleanOffices(formData) {
  return [...new Set(formData.getAll("offices").filter((o) => OFFICES.includes(o)))];
}

// gate the action behind the oversight tier + load the target + enforce the
// "can't act on yourself" + authority rules. mirrors the old edit page.
async function loadActionTarget(userId) {
  const current = await getCurrentUser();
  if (!isElevated(current?.role)) redirect("/portal");
  if (userId === current.id && !isSuper(current.role)) {
    redirect("/portal/admin/users?error=self");
  }
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, hireDate: true, deactivatedAt: true },
  });
  if (!target) redirect("/portal/admin/users?error=notfound");
  if (!canManageUser(current.role, target.role)) {
    redirect("/portal/admin/users?error=forbidden");
  }
  return { current, target };
}

export async function updateUser(userId, formData) {
  const { current, target } = await loadActionTarget(userId);

  const name = cleanDisplayName(formData.get("name"), NAME_MAX_LEN);
  if (!name) redirect("/portal/admin/users?error=name");

  const preferredFirstName = cleanDisplayName(formData.get("preferredFirstName"), NAME_MAX_LEN);
  const preferredLastName = cleanDisplayName(formData.get("preferredLastName"), NAME_MAX_LEN);
  const title = resolveTitle(formData.getAll("titlePositions"), formData.get("titleCustom"));
  const offices = cleanOffices(formData);

  // hire date is Manager-and-up only; preserve otherwise.
  let hireDate = target.hireDate;
  if (isManagerUp(current.role)) {
    hireDate = null;
    const raw = formData.get("hireDate");
    if (typeof raw === "string" && raw.length > 0) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) hireDate = parsed;
    }
  }

  // privilege role: IT/Super only; preserve otherwise. locked supers stay SUPER.
  let role = target.role;
  if (isIT(current.role)) {
    const submitted = formData.get("role");
    if (!isValidRole(submitted) || !canAssignRole(current.role, submitted)) {
      redirect("/portal/admin/users?error=role");
    }
    role = submitted;
  }
  if (isLockedSuperEmail(target.email)) role = "SUPER";

  const phone = formatUSPhone(formData.get("phone"));
  const workingHours = cleanDisplayName(formData.get("workingHours"), WORKING_HOURS_MAX);

  await prisma.user.update({
    where: { id: userId },
    data: { name, preferredFirstName, preferredLastName, title, offices, hireDate, phone, workingHours, role },
  });
  // no redirect - the client closes the drawer + refreshes in place so the
  // viewer's search / filter / group stays put.
  revalidatePath("/portal/admin/users");
  return { ok: true };
}

export async function deactivateUser(userId) {
  const { target } = await loadActionTarget(userId);
  if (isLockedSuperEmail(target.email)) return { ok: false, error: "locked" };
  if (!target.deactivatedAt) {
    await prisma.user.update({ where: { id: userId }, data: { deactivatedAt: new Date() } });
  }
  revalidatePath("/portal/admin/users");
  return { ok: true, email: target.email };
}

export async function reactivateUser(userId) {
  const { target } = await loadActionTarget(userId);
  await prisma.user.update({ where: { id: userId }, data: { deactivatedAt: null } });
  revalidatePath("/portal/admin/users");
  return { ok: true, email: target.email };
}

export async function inviteUser(formData) {
  const current = await getCurrentUser();
  if (!isElevated(current?.role)) redirect("/portal");

  const email = cleanEmail(formData.get("email"));
  if (!email) redirect("/portal/admin/users?error=email");

  const rawName = formData.get("name");
  let name;
  if (typeof rawName === "string" && rawName.trim().length > 0) {
    name = cleanDisplayName(rawName, NAME_MAX_LEN);
    if (!name) redirect("/portal/admin/users?error=name");
  } else {
    name = email.split("@")[0];
  }

  const title = resolveTitle(formData.getAll("titlePositions"), formData.get("titleCustom"));
  const offices = cleanOffices(formData);

  let hireDate = null;
  if (isManagerUp(current.role)) {
    const raw = formData.get("hireDate");
    if (typeof raw === "string" && raw.length > 0) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) hireDate = parsed;
    }
  }

  let role = "STAFF";
  if (isIT(current.role)) {
    const submitted = formData.get("role");
    if (!isValidRole(submitted) || !canAssignRole(current.role, submitted)) {
      redirect("/portal/admin/users?error=role");
    }
    role = submitted;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) redirect("/portal/admin/users?error=exists");

  const preferredFirstName = cleanDisplayName(formData.get("preferredFirstName"), NAME_MAX_LEN);
  const preferredLastName = cleanDisplayName(formData.get("preferredLastName"), NAME_MAX_LEN);

  await prisma.user.create({
    data: { email, name, preferredFirstName, preferredLastName, role, title, offices, hireDate },
  });
  await notifyOversight({
    type: "USER_ADDED",
    title: "New user invited",
    body: `${preferredName(current)} invited ${email} (${ROLE_LABELS[role] ?? role}).`,
    link: "/portal/admin/users",
    exceptUserId: current.id,
  });
  revalidatePath("/portal/admin/users");
  return { ok: true, email };
}
