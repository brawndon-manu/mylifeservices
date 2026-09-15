// PDFs on an announcement, from both sources, and the store they go to.
//
// LIFTED OUT OF actions.js ON 2026-09-14 so the past-meeting sheet on the
// attendance page can attach the same documents through the same checks. It
// does NOT belong in a "use server" file once two callers want it: every
// export of one of those is a callable endpoint, and `resolveAttachments`
// takes a FormData and writes to the blob store - exactly the shape nobody
// should be able to call directly.
//
// Server only: it reaches the blob store and the database.
import { put } from "@vercel/blob";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  ATTACH_ACCEPT,
  ATTACH_MAX_BYTES,
  ATTACH_MAX_COUNT,
  cleanAttachment,
} from "@/lib/announcement-attachments";

// PDFs UPLOADED STRAIGHT ONTO A POST. Same store and same cleanup as the image,
// a different prefix so the two are tellable apart in the bucket.
export async function uploadAttachment(file) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Attachments arent configured yet. Create a Blob store in Vercel.");
  }
  const key = `announcements/docs/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.pdf`;
  const blob = await put(key, file, { access: "public", contentType: "application/pdf" });
  return blob.url;
}

// WHAT ENDS UP ON THE POST, from both sources.
//
// A library pick arrives as a Form id and is LOOKED UP - the url and the name
// come from the row, never from the posted value, or a crafted form could
// attach any url it liked under a friendly name. An upload is checked for type
// and size before it reaches the store.
//
// `redirectOn` is the page to bounce back to, so create and edit report their
// errors in the right place.
export async function resolveAttachments(formData, redirectOn) {
  const out = [];

  // ALREADY ON THE POST, and not ticked for removal. An uploaded PDF exists
  // only here, so an edit that silently dropped it would lose the file - the
  // library picks below can always be re-picked, these cannot.
  for (const raw of formData.getAll("keepAttachments")) {
    if (typeof raw !== "string" || !raw) continue;
    try {
      const a = cleanAttachment(JSON.parse(raw));
      if (a) out.push(a);
    } catch {
      // a mangled hidden field drops that one attachment rather than the post
    }
  }

  const ids = formData
    .getAll("attachFormIds")
    .filter((v) => typeof v === "string" && v);
  if (ids.length) {
    // A RESTRICTED FORM CANNOT RIDE ON A POST. An announcement's attachments
    // are rendered on a page staff read and emailed to every one of them, and
    // the stored url of a restricted form is a blob address that works for
    // whoever holds it - so attaching one would undo the role floor in the one
    // place nobody would think to look. The pickers already leave them out;
    // this is the lock on the id itself, which is what actually arrives.
    const rows = await prisma.form.findMany({
      where: { id: { in: ids.slice(0, ATTACH_MAX_COUNT) }, minRole: null },
      select: { id: true, title: true, fileUrl: true },
    });
    // keep the order the picker showed them in rather than the database's
    for (const id of ids) {
      const f = rows.find((r) => r.id === id);
      if (f) out.push({ name: f.title, url: f.fileUrl, formId: f.id, bytes: null });
    }
  }

  const files = formData
    .getAll("attachments")
    .filter((f) => f && typeof f === "object" && "size" in f && f.size > 0);
  for (const file of files) {
    if (!ATTACH_ACCEPT.includes(file.type)) redirect(`${redirectOn}?error=attachType`);
    if (file.size > ATTACH_MAX_BYTES) redirect(`${redirectOn}?error=attachSize`);
    if (out.length >= ATTACH_MAX_COUNT) redirect(`${redirectOn}?error=attachCount`);
    let url;
    try {
      url = await uploadAttachment(file);
    } catch {
      redirect(`${redirectOn}?error=attachUpload`);
    }
    out.push({
      name: (file.name || "Document").replace(/\.pdf$/i, "").slice(0, 120),
      url,
      formId: null,
      bytes: file.size,
    });
  }

  if (out.length > ATTACH_MAX_COUNT) redirect(`${redirectOn}?error=attachCount`);
  return out.length ? out.map(cleanAttachment).filter(Boolean) : null;
}
