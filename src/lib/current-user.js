import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PREVIEW_COOKIE, resolveEffectiveRole } from "@/lib/preview";

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  preferredFirstName: true,
  preferredLastName: true,
  role: true,
  title: true,
  phone: true,
  image: true,
  workingHours: true,
  sharePhonePublicly: true,
  hideLegalName: true,
  deactivatedAt: true,
};

// applies the "view as role" preview: if an IT/SUPER user has a valid
// preview cookie set, `role` becomes the previewed (lower) role while
// `realRole` keeps their actual role. everything that reads getCurrentUser
// then renders as the previewed role. see src/lib/preview.js for the rules.
async function withPreview(user) {
  if (!user) return user;
  const store = await cookies();
  const previewValue = store.get(PREVIEW_COOKIE)?.value;
  const effectiveRole = resolveEffectiveRole(user.role, previewValue);
  return {
    ...user,
    role: effectiveRole,
    realRole: user.role,
    previewing: effectiveRole !== user.role,
  };
}

// fetch the signed-in user's FRESH record straight from the database.
// use this in portal pages instead of reading session.user.name/.role
// directly: the JWT caches those values from when you signed in, so
// they go stale the second you change your name in /portal/settings
// or get your role updated by another admin.
//
// returns null if:
//   - not signed in
//   - user record was deleted from the db while their session is alive
//   - user has been DEACTIVATED (soft-deleted). means even with a valid
//     jwt cookie they cant access portal pages anymore - the next page
//     render kicks them out.
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: USER_SELECT,
  });

  if (!user) return null;
  if (user.deactivatedAt) return null; // soft-deleted, treat as signed out

  return withPreview(user);
}

// same shape but for pages that explicitly want to see deactivated
// users (admin list, edit page). returns the row even if deactivated -
// caller has to decide what to do with the deactivatedAt field.
export async function getCurrentUserIncludingDeactivated() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: USER_SELECT,
  });

  return withPreview(user);
}
