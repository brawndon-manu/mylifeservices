// server helpers for the "submit a form by email" recipient picker. a form's
// route (src/lib/forms.js) names a `recipientTitle` (e.g. "Field Supervisor")
// and the submitter picks one of its holders for the TO line. looked up live so
// it tracks whoever holds that title - nothing hardcoded.
import { prisma } from "@/lib/prisma";
import { preferredName } from "@/lib/contacts";
import { titleSegmentMatch } from "@/lib/announcements";
import { titleHasSegment } from "@/lib/positions";

// active staff holding `title` (as a whole segment, so someone with extra titles
// like "Field Supervisor / Lead Staff" still counts), as { id, name } for the
// dropdown. we never hand emails to the client - the send action resolves those.
export async function getRecipientOptions(title) {
  if (!title) return [];
  const users = await prisma.user.findMany({
    where: { deactivatedAt: null, ...titleSegmentMatch(title) },
    select: {
      id: true,
      name: true,
      preferredFirstName: true,
      preferredLastName: true,
    },
    orderBy: [{ preferredFirstName: "asc" }, { name: "asc" }],
  });
  return users.map((u) => ({ id: u.id, name: preferredName(u) }));
}

// THE RECIPIENT WHEN NOBODY PICKED ONE. Signing from an emailed link has no
// reviewer dropdown on purpose - the document goes back to whoever issued it -
// but nothing ever resolved that, so `submitSignedByToken` asked for a
// recipientId the sign page never sends and refused every submission with
// "norecipient". Mánu 2026-08-10 hit it the first time the error was visible.
//
// Deterministic on purpose: same ordering as the dropdown, so a title with
// several holders always resolves to the same person rather than whichever row
// the database felt like returning first.
export async function resolveDefaultRecipient(title) {
  if (!title) return null;
  const u = await prisma.user.findFirst({
    where: { deactivatedAt: null, ...titleSegmentMatch(title) },
    select: {
      id: true,
      name: true,
      preferredFirstName: true,
      preferredLastName: true,
      email: true,
    },
    orderBy: [{ preferredFirstName: "asc" }, { name: "asc" }],
  });
  if (!u?.email) return null;
  return { name: preferredName(u), email: u.email };
}

// resolve a picked recipient by id, re-checking they're active and STILL hold the
// title, so the client can't slip in an arbitrary address. returns { name, email }
// or null.
export async function resolveRecipient(title, userId) {
  if (!title || typeof userId !== "string" || !userId) return null;
  const u = await prisma.user.findFirst({
    where: { id: userId, deactivatedAt: null },
    select: {
      id: true,
      name: true,
      preferredFirstName: true,
      preferredLastName: true,
      title: true,
      email: true,
    },
  });
  if (!u || !u.email) return null;
  if (!titleHasSegment(u.title, title)) return null;
  return { name: preferredName(u), email: u.email };
}
