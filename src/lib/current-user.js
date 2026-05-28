import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// fetch the signed-in user's FRESH record straight from the database.
// use this in portal pages instead of reading session.user.name/.role
// directly — the JWT caches those values from when you signed in, so
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
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      title: true,
      phone: true,
      image: true,
      deactivatedAt: true,
    },
  });

  if (!user) return null;
  if (user.deactivatedAt) return null; // soft-deleted, treat as signed out

  return user;
}

// same shape but for pages that explicitly want to see deactivated
// users (admin list, edit page). returns the row even if deactivated -
// caller has to decide what to do with the deactivatedAt field.
export async function getCurrentUserIncludingDeactivated() {
  const session = await auth();
  if (!session?.user?.id) return null;

  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      title: true,
      phone: true,
      image: true,
      deactivatedAt: true,
    },
  });
}
