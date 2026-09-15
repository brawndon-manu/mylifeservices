// WHICH DAYS A PERSON ATTESTED TO, read off the signed Daily Service Notes.
//
// This is the evidence half of the rest-break rule. rest-attestation.js holds
// the rule itself and stays free of imports so the browser can have it; this
// file does the joining, which needs the accounts and therefore the server.
//
// A NOTE ATTESTS WHEN IT CAME OFF THE PDF AND CARRIES A SIGNATURE. Both halves
// matter. The Employee Service Notes .xls sets signedBy, signedDate and
// signedAt to null outright, so the signature check alone would already exclude
// it - but the source check is the one that says WHY, because the attestation
// is a question answered at DSN clock out and a Field Supervisor writing in the
// .xls never answered it. On 09/01-09/15 all 586 PDF notes carry a signature
// and none of the 321 .xls ones do.
//
// THE DAY IT COVERS IS THE DAY WORKED, not the day it was signed. A note filed
// late still attests the shift it describes, which is `note.date`. `signedDate`
// is only ever evidence that a signature happened at all.
//
// NAMES ARE THE WHOLE DIFFICULTY and joining them raw returns zero for
// everybody. The timesheets print "Aranda, Jennifer" and the notes print
// "Jennifer Aranda", which looks exactly like nobody being attested rather than
// like a bug - it cost a measurement pass here already. `buildWhoKey` is the
// resolver the audit already joins these same notes with, so both screens agree
// about who somebody is, and it carries the preferred names and the known
// misspellings on top. Against the live period it resolves 54 of 62 people to
// at least one signed note where a naive first-last flip resolves 52.
const SIGNED_SOURCE = "dsn";

// CAN THIS NOTE ATTEST? One predicate, because the answer is asked in three
// places - here, the upload, and the re-analysis - and three copies of it is
// how they start disagreeing.
//
// A NOTE WRITTEN BEFORE THE TAG EXISTED STILL COUNTS, and that is not
// generosity, it is the only correct reading. `parseServiceNotesPdf` did not
// set `source` until 205688d, so every note stored before then carries none -
// 270 of them on the day program batch alone. And the .xls reader has always
// set `source: "xls"` and `signedAt: null` in the same object literal,
// unconditionally, so a note that is SIGNED AND UNTAGGED can only have come
// off the PDF. There is nothing else it could be.
//
// WITHOUT THIS, RECALCULATE CANNOT HELP THOSE BATCHES. It rebuilds from the
// notes already stored rather than re-reading the document, so an untagged set
// would re-analyse to the same nothing and only a fresh upload would fix it -
// which is exactly the case the button exists for.
export function isSignedDsn(note) {
  if (!note?.signedAt || !note?.signedDate) return false;
  return note.source === SIGNED_SOURCE || !note.source;
}

// -> Map<whoKey, Set<"MM/DD/YY">>
export function signedDsnDates(notes, whoKey) {
  const out = new Map();
  for (const n of notes || []) {
    if (!isSignedDsn(n) || !n.date) continue;
    const key = whoKey(n.employee);
    if (!key) continue;
    if (!out.has(key)) out.set(key, new Set());
    out.get(key).add(n.date);
  }
  return out;
}

// the per-person lookup the engine injects, bound once per sheet:
// `const signed = dsnSignedFor(map, whoKey, sheet.sourceName)` then
// `signed(date)`.
export function dsnSignedFor(map, whoKey, personName) {
  const dates = map?.get(whoKey(personName)) || null;
  return (date) => !!dates && dates.has(date);
}

// HOW MANY PEOPLE THE EVIDENCE ACTUALLY REACHES, so a join that silently
// resolves nobody is visible instead of reading as a period where nobody
// attested. The upload logs it and a test refuses a zero on a batch that has
// notes - see the note above about what a broken join looks like.
export function attestationReach(map, whoKey, personNames) {
  const names = personNames || [];
  const matched = names.filter((n) => (map?.get(whoKey(n))?.size || 0) > 0).length;
  return { matched, of: names.length, days: [...(map?.values() || [])].reduce((n, s) => n + s.size, 0) };
}
