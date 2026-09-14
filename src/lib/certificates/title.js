// WHAT A CERTIFICATE RUN IS CALLED, cleaned in one place.
//
// The title is the heading on the batch, the row in the Certificates list, and
// the name every download is built from - the single PDF and the zip slug it,
// and the whole-run zip uses it as a folder. Two writers set it (the builder
// when a run is made, and a rename afterwards), so the rule lives here rather
// than at each of them.
//
// A blank one is NOT substituted for: the caller refuses it, because a batch
// with no name loses its heading and its downloads fall back to a generic file
// name that says nothing about what is in it.

export const MAX_TITLE = 200;

export function cleanTitle(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITLE)
    .trim();
}
