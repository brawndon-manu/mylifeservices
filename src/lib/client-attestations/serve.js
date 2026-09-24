// SERVING A STORED ATTESTATION DOCUMENT.
//
// Same stream-it-ourselves pattern as every other stored document in the portal:
// the url never reaches the browser, so access dies with the session rather
// than living on in a link somebody pasted somewhere. (The documents sit in the
// private store now, whose urls open for nobody anyway - see src/lib/blob.js.)
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { canManageClientAttestations } from "@/lib/roles";
import { readBlob } from "@/lib/blob";

export async function requireAttestationAccess() {
  const user = await getCurrentUser();
  if (!canManageClientAttestations(user?.role)) {
    return { user: null, deny: new NextResponse("Forbidden", { status: 403 }) };
  }
  return { user, deny: null };
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
