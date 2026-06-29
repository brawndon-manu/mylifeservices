// server helper: active staff grouped by job title, for the announcement
// audience picker (so a title role can be narrowed to specific people). a person
// with multiple titles shows under each. returns { [title]: [{ id, name }] }.
import { prisma } from "@/lib/prisma";
import { preferredName } from "@/lib/contacts";
import { POSITIONS, ACK_EXEMPT_TITLE, titleHasSegment } from "@/lib/positions";
import { titleSegmentMatch } from "@/lib/announcements";

// the two "Everyone" totals the audience picker shows: ackEveryone = all active
// except the ack-exempt Owner/Director (the ack/meeting "Everyone"); allActive =
// all active users (the email "Everyone").
export async function getAudienceTotals() {
  const [ackEveryone, allActive] = await Promise.all([
    prisma.user.count({
      where: { deactivatedAt: null, NOT: titleSegmentMatch(ACK_EXEMPT_TITLE) },
    }),
    prisma.user.count({ where: { deactivatedAt: null } }),
  ]);
  return { ackEveryone, allActive };
}

// the ack / meeting picker's staff list: everyone except the Owner/Director, so
// the list lines up with the "Everyone" total + the roster.
export function getAckStaffByTitle() {
  return getStaffByTitle({ excludeTitle: ACK_EXEMPT_TITLE });
}

// staff grouped by title. pass `excludeTitle` to drop holders of that title (the
// ack/meeting picker drops the Owner/Director); omit it for the email picker
// (all active, every title).
export async function getStaffByTitle({ excludeTitle } = {}) {
  const where = { deactivatedAt: null };
  if (excludeTitle) where.NOT = titleSegmentMatch(excludeTitle);
  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      preferredFirstName: true,
      preferredLastName: true,
      title: true,
    },
    orderBy: [{ preferredFirstName: "asc" }, { name: "asc" }],
  });
  const byTitle = {};
  for (const t of POSITIONS) byTitle[t] = [];
  for (const u of users) {
    // whole-segment match (handles titles that contain " / ", and avoids
    // "Assistant Program Manager" matching "Program Manager").
    for (const t of POSITIONS) {
      if (titleHasSegment(u.title, t)) {
        byTitle[t].push({ id: u.id, name: preferredName(u) });
      }
    }
  }
  return byTitle;
}
