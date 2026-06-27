// server-side notification creation. fans an event out to every active
// oversight-tier user (one Notification row each, so each tracks its own
// read state). call this from server actions after the triggering write.
import { prisma } from "@/lib/prisma";
import { ROLES, isElevated } from "@/lib/roles";

// the oversight tier (HR/Manager/Admin/IT/Super), derived from roles.js so
// there's one source of truth.
const OVERSIGHT_ROLES = ROLES.filter(isElevated);

// create a notification for each active oversight user. `exceptUserId` skips
// the person who triggered it (no need to notify yourself). best-effort:
// notification failures never block the underlying action.
export async function notifyOversight({ type, title, body, link = null, exceptUserId = null }) {
  try {
    const recipients = await prisma.user.findMany({
      where: {
        role: { in: OVERSIGHT_ROLES },
        deactivatedAt: null,
        ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
      },
      select: { id: true },
    });
    if (!recipients.length) return;
    await prisma.notification.createMany({
      data: recipients.map((u) => ({ type, title, body, link, userId: u.id })),
    });
  } catch (e) {
    console.error("notifyOversight failed:", e);
  }
}
