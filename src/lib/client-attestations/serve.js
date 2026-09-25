// SERVING A STORED ATTESTATION DOCUMENT.
//
// Same stream-it-ourselves pattern as every other stored document in the portal:
// the url never reaches the browser, so access dies with the session rather
// than living on in a link somebody pasted somewhere. (The documents sit in the
// private store now, whose urls open for nobody anyway - see src/lib/blob.js.)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageClientAttestations, canSeeEveryAttestation } from "@/lib/roles";
import { titleHasSegment } from "@/lib/positions";
import { readBlob } from "@/lib/blob";
import { attestationIsTheirs } from "./routing";

// who is on the desk at all, and whether they see the whole month. `wholeMonth`
// is for what carries every client at once (the QSP source, the zip, the one
// pdf): the office only. the user comes back either way, so a refusal can be
// written down.
export async function requireAttestationAccess({ wholeMonth = false } = {}) {
  const user = await getCurrentUser();
  const office = canSeeEveryAttestation(user?.role);
  const ok = wholeMonth ? office : canManageClientAttestations(user?.role);
  if (!ok) return { user, office: false, deny: new NextResponse("Forbidden", { status: 403 }) };
  return { user, office, deny: null };
}

// the same definition the review screen and the caseloads page use
export const isFieldSupervisor = (u) => titleHasSegment(u?.title, "Field Supervisor");

// the rows a desk user is shown: all of them for the office. for a field
// supervisor, the ones set to them plus the unset ones they staff themselves -
// attestationIsTheirs then settles those, so filter with it too.
export function attestationScope(user, office) {
  if (office) return {};
  return { OR: [{ supervisorUserId: user.id }, { supervisorUserId: null, staffUserId: user.id }] };
}

// what attestationIsTheirs reads off a row
export const OWNER_SELECT = {
  supervisor: { select: { id: true } },
  staffUser: { select: { id: true, title: true } },
};

// one form: the office may act on any; a field supervisor on their own only
export async function attestationOpenTo(user, office, attestationId) {
  if (office) return true;
  if (!user?.id) return false;
  const row = await prisma.clientAttestation.findUnique({ where: { id: attestationId }, select: OWNER_SELECT });
  return attestationIsTheirs(row, user.id, isFieldSupervisor);
}

// the bytes of a stored file, from whichever store holds it
export async function fetchStored(url) {
  if (!url) return null;
  const file = await readBlob(url);
  return file ? Buffer.from(file.bytes) : null;
}

// a filename somebody can find again in a folder of 252 of them
export function formFileName(clientName, monthLabel) {
  const safe = (s) => String(s || "").replace(/[^\w.\- ]/g, "_").trim();
  return `${safe(clientName)} - ${safe(monthLabel)}.pdf`;
}
