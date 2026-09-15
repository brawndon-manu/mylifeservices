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
import { attachmentsForSession } from "./announcements.js";
import { readStoredPdf } from "./stored-file.js";

// The whole library is 4.5MB and the biggest single document is 879KB, so a
// meeting carrying its five-attachment maximum cannot realistically reach this.
// It exists so that a future library of scanned decks cannot quietly produce a
// 200MB report that times out instead of downloading.
export const MATERIALS_MAX_BYTES = 24 * 1024 * 1024;

// EVERY DOCUMENT THE MEETING USES, across all of its series.
//
// A series carries its own documents now - the September zoom trainings' three
// ILS service note files belong to week one and to neither week after it - so
// the meeting's own list is no longer the whole story. This loads the union:
// the meeting's, plus anything a series names for itself, deduped by url so a
// file two series share is read and embedded once rather than twice.
//
// The order is the meeting's list first and then each series in turn, which is
// the order the report appends them in at the end.
function everyDocument(post) {
  const out = [];
  const seen = new Set();
  const add = (a) => {
    if (!a?.url || seen.has(a.url)) return;
    seen.add(a.url);
    out.push(a);
  };
  for (const a of attachmentsOf(post)) add(a);
  for (const o of (Array.isArray(post?.meetingOptions) ? post.meetingOptions : [])) {
    for (const a of attachmentsForSession(post, o)) add(a);
  }
  return out;
}

// Everything the report needs about one document: the name it prints, and the
// bytes when they could be read. A document that cannot be loaded is still
// LISTED - the meeting was run from it either way, and silently dropping it
// would make the record claim fewer materials than the meeting had.
export async function loadMeetingMaterials(post, { withBytes = true } = {}) {
  const list = everyDocument(post);
  if (!list.length) return [];

  const out = [];
  let total = 0;
  for (const a of list) {
    // `url` rides along so a section can pick out its own from this list
    const item = { name: a.name, url: a.url, fromLibrary: !!a.formId, bytes: null, note: null };
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
