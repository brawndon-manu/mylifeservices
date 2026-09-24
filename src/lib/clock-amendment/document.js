// THE DOCUMENT, BUILT FROM THE RECORD: fetches what the renderer needs (the
// logo off disk, the two signatures and the note's pages out of the store) and
// hands back the bytes and their hash. Server only.
//
// the hash is of the bytes as stored, so a copy filed anywhere else can be
// checked against the record by hashing it again
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { preferredName } from "@/lib/contacts";
import { renderAmendmentPdf } from "./pdf.js";
import { fetchBlob } from "@/lib/blob";

const LOGO_PATH = path.join(process.cwd(), "public", "logo", "MLSlogo.png");

const NAMES = { select: { id: true, name: true, email: true, preferredFirstName: true, preferredLastName: true } };

export const shownName = (u) => preferredName(u) || u?.name || u?.email || "";

// one amendment with every name the screens and the document print
export async function loadAmendment(id) {
  if (!id) return null;
  return prisma.clockAmendment.findUnique({
    where: { id: String(id) },
    include: { staff: NAMES, recipient: NAMES, createdBy: NAMES, approvedBy: NAMES },
  });
}

// the names the renderer prints, read off the relations once
export function withNames(a, extra = {}) {
  return {
    ...a,
    staffName: shownName(a.staff),
    createdByName: shownName(a.createdBy),
    approvedByName: shownName(a.approvedBy),
    ...extra,
  };
}

// a signature or a page set lives at a url in the store, or inline as a data
// url on a laptop with no store. either way, bytes.
async function bytesFrom(url) {
  if (!url) return null;
  const m = /^data:[a-z/+.-]+;base64,(.+)$/i.exec(url);
  if (m) return Buffer.from(m[1], "base64");
  if (!/^https?:\/\//.test(url)) return null;
  try {
    const r = await fetchBlob(url);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

export async function buildAmendmentDocument(a) {
  let logoBytes = null;
  try { logoBytes = fs.readFileSync(LOGO_PATH); } catch { logoBytes = null; }
  const [staffSignaturePng, clientSignaturePng, dsnPdfBytes] = await Promise.all([
    bytesFrom(a.staffSignatureUrl),
    bytesFrom(a.clientSignatureUrl),
    bytesFrom(a.dsnPdfUrl),
  ]);
  const bytes = Buffer.from(await renderAmendmentPdf(a, { logoBytes, staffSignaturePng, clientSignaturePng, dsnPdfBytes }));
  const hash = createHash("sha256").update(bytes).digest("hex");
  return { bytes, hash };
}
