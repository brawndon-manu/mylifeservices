// server helper: active staff grouped by job title, for the announcement
// audience picker (so a title role can be narrowed to specific people). a person
// with multiple titles shows under each. returns { [title]: [{ id, name }] }.
import { prisma } from "@/lib/prisma";
import { preferredName } from "@/lib/contacts";
import { POSITIONS } from "@/lib/positions";

export async function getStaffByTitle() {
  const users = await prisma.user.findMany({
    where: { deactivatedAt: null },
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
    const ut = (u.title || "").toLowerCase();
    for (const t of POSITIONS) {
      if (ut.includes(t.toLowerCase())) {
        byTitle[t].push({ id: u.id, name: preferredName(u) });
      }
    }
  }
  return byTitle;
}
