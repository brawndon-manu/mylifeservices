// The documents a meeting was actually run from, loaded as bytes so the
// attendance report can carry them rather than point at them.
//
// Mánu 2026-09-14: the attendance record should hold the topics and the slides,
// the way the acknowledgment report holds the text of what was acknowledged. A
// link is not a record - the person reading the file a year from now has the
// report and not the portal.
//
// SERVER ONLY. It reads the filesystem, so nothing that renders in a browser
// may import it. `attachmentsOf` and `cleanAttachment` stay where they are, in
// the dependency-free module, because those are the trust boundary.
import { attachmentsOf } from "./announcement-attachments.js";
import { readStoredPdf } from "./stored-file.js";

// The whole library is 4.5MB and the biggest single document is 879KB, so a
// meeting carrying its five-attachment maximum cannot realistically reach this.
// It exists so that a future library of scanned decks cannot quietly produce a
// 200MB report that times out instead of downloading.
export const MATERIALS_MAX_BYTES = 24 * 1024 * 1024;

// Everything the report needs about one document: the name it prints, and the
// bytes when they could be read. A document that cannot be loaded is still
// LISTED - the meeting was run from it either way, and silently dropping it
// would make the record claim fewer materials than the meeting had.
export async function loadMeetingMaterials(post, { withBytes = true } = {}) {
  const list = attachmentsOf(post);
  if (!list.length) return [];

  const out = [];
  let total = 0;
  for (const a of list) {
    const item = { name: a.name, fromLibrary: !!a.formId, bytes: null, note: null };
    if (!withBytes) {
      out.push(item);
      continue;
    }
    let b = null;
    try {
      b = await readStoredPdf(a.url);
    } catch {
      b = null;
    }
    if (!b) {
      item.note = "could not be read";
    } else if (total + b.length > MATERIALS_MAX_BYTES) {
      item.note = "too large to include";
    } else {
      item.bytes = b;
      total += b.length;
    }
    out.push(item);
  }
  return out;
}
