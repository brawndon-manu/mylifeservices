// SERVING A STORED ATTESTATION DOCUMENT.
//
// Same stream-it-ourselves pattern as every other stored document in the portal:
// Blob is a PUBLIC store, so its url never reaches the browser and access dies
// with the session rather than living on in a link somebody pasted somewhere.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { canManageClientAttestations } from "@/lib/roles";

export async function requireAttestationAccess() {
  const user = await getCurrentUser();
  if (!canManageClientAttestations(user?.role)) {
    return { user: null, deny: new NextResponse("Forbidden", { status: 403 }) };
  }
  return { user, deny: null };
}

export async function fetchStored(url) {
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

// a filename somebody can find again in a folder of 252 of them
export function formFileName(clientName, monthLabel) {
  const safe = (s) => String(s || "").replace(/[^\w.\- ]/g, "_").trim();
  return `${safe(clientName)} - ${safe(monthLabel)}.pdf`;
}
