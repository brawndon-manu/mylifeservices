// WHAT SOMEBODY WORKED OUT ABOUT ONE FINDING, written down beside it.
//
// Mánu 2026-09-15: "can you make it so we can add notes that can be edited for
// the data checks page".
//
// The status chip says where a person has got to and the contact log says what
// was done to get them there. Neither can hold "travel block was typed in by
// hand, I will trim the booking before the next export" - that is a sentence
// about this finding, and it is the thing the next person to open the row needs.
//
// ONE NOTE PER ROW, EDITED IN PLACE, rather than the thread the people page
// carries. His pick, and it is the right shape for a screen sixty rows long: a
// thread grows down the page and has to be read in order, a note is the current
// answer and can be corrected when it stops being true.
//
// SHARED, LIKE THE MARK AND UNLIKE THE COMMENT. Anybody who may manage
// timesheets can edit anybody's note, and the row records who last touched it.
// The comment on the people page is somebody's own sentence and only its author
// may take it down; this is one line of shared working state, and a note nobody
// but its author can fix is a note that goes stale on the list.
//
// INTERNAL. It lives behind `canManageTimesheets`, moves no figure, reaches no
// sheet and no employee ever sees it.
import { markKey } from "./mark-key.js";

// Long enough for a paragraph off a phone call, short enough that the column it
// sits in stays a column. The same cap the people page's comments use.
export const NOTE_MAX = 2000;

// Trimmed and capped in one place, because the client and the server both have
// to agree on what counts as empty: an empty note is not a row, it is the
// absence of one, and that is also how the note is deleted.
export function cleanNoteBody(body) {
  return String(body ?? "").trim().slice(0, NOTE_MAX);
}

// KEYED ON WHAT THE FINDING IS, NOT ON THE UPLOAD IT WAS WRITTEN ON - see
// mark-key.js, which is where this key comes from and why it is shaped that way.
// The four notes ever written on the people page are keyed on a batch, and one
// of the four is already invisible because a later export replaced the batch
// under it. The period is re-uploaded several times a day while the corrections
// go back into QuickSolve, so a note that cannot survive that cannot be written
// at all.
export const noteKeyOf = (e) => markKey(e?.personKey, e?.findingKey);

// the notes for one period, as a Map the rows can look themselves up in. One row
// per key is a database constraint here rather than a hope, so the last write
// simply wins and there is no tie to break.
export function notesByKey(rows = []) {
  const m = new Map();
  for (const r of rows) m.set(markKey(r.personKey, r.findingKey), r);
  return m;
}

// A NOTE NEEDS BOTH HALVES OF ITS KEY. A row that matched nobody on the
// timesheet has no person behind it, and a note on one would key as "-|..." and
// be shared with every other unmatched row carrying that finding. The screen
// already tells you those rows matched nobody; this is why they get no note.
export const canHoldNote = (e) => !!e?.personKey && !!e?.findingKey;
