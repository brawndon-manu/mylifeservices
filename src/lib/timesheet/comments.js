// THE COMMENTS BLOCK, SPLIT BACK INTO THE DAYS IT IS ABOUT.
//
// Every Simple Timesheet ends with "Comments Details:" and a numbered list, and
// `parsePage` has captured it verbatim since the first upload - `data.comments`,
// one string per printed LINE. 45 of the 61 people on 08/16-08/31 have one.
//
// Each note names its own day and the block it belongs to:
//
//   1) 08/16/26 2:45p-5:34p: Reason given: Client ended early due to being tired
//
// so the list is already per-shift; nothing but the split was missing. A line
// that does not start "N)" is the previous note wrapping, which is the only
// reason this cannot be a `.map()`.
//
// Mánu 2026-08-26: "is there a way to show those notes next to the shifts in the
// admin day by day view only?" - so this exists to be read beside a day, and
// `notesFor` is what a screen calls. Nothing here reaches an employee surface.
//
// Dependency-free on purpose, like `timesheet-subjects.js`: it is string work on
// stored text and node --test runs it directly.

// "1) 08/16/26 2:45p-5:34p: the rest of it"
const HEAD = /^(\d+)\)\s*(\d{2}\/\d{2}\/\d{2})\s+(\d{1,2}(?::\d{2})?[ap])\s*-\s*(\d{1,2}(?::\d{2})?[ap]):\s*(.*)$/i;

// QSP writes every one of them "Reason given: ...", which is the same three
// words at the front of every note on the screen. The label is the column, so
// the words are noise - taken off here rather than in the component, so the
// stored text is untouched and one reader cannot show them while another hides
// them.
const PREFIX = /^Reason\s+given:\s*/i;

// -> [{ n, date, from, to, text }] in the order they were printed.
export function parseComments(lines) {
  const out = [];
  for (const raw of lines || []) {
    const line = String(raw ?? "").trim();
    if (!line) continue;
    const m = HEAD.exec(line);
    if (m) {
      out.push({
        n: Number(m[1]),
        date: m[2],
        from: m[3].toLowerCase(),
        to: m[4].toLowerCase(),
        text: m[5].replace(PREFIX, "").trim(),
      });
      continue;
    }
    // a wrapped line belongs to the note above it. With no note above it there
    // is nothing to attach to and it is dropped rather than guessed at.
    if (out.length) {
      const prev = out[out.length - 1];
      prev.text = `${prev.text} ${line}`.trim();
    }
  }
  return out.filter((c) => c.text);
}

// the notes for ONE day, ready to print beside its calendar.
export function notesFor(comments, date) {
  if (!date) return [];
  return parseComments(comments).filter((c) => c.date === date);
}

// every day that has one, as a Set - so a list of days can mark the ones worth
// opening without parsing the block once per row.
export function datesWithNotes(comments) {
  return new Set(parseComments(comments).map((c) => c.date));
}
