// WILL POSTGRES ACCEPT THIS ROW, ASKED BEFORE ANYTHING IS WRITTEN.
//
// On 2026-08-15 a single NUL in one person's footer took four uploads down. The
// insert came back `22P05, unsupported Unicode escape sequence`, the exception
// left the upload uncaught on the 25th sheet of 60, and each attempt left a
// 24-sheet corpse that then read-onlyed the real batch. The character itself is
// stripped at the point text comes off the timesheet page now - but that is one
// of four documents, and the schedule PDF and the two .xls reports still hand
// their strings straight through to the same json column.
//
// So this asks the question up front, per person, and the answer names WHO
// rather than arriving as a database code with no row attached.
//
// IT MODELS WHAT THE DATABASE ACTUALLY REFUSES, which is narrower than what
// looks alarming. A jsonb value may hold a tab, a newline or any other C0
// character as an escape; the only two it rejects outright are a NUL and half a
// surrogate pair. Refusing more than that would fail uploads Postgres would
// have taken.
//
// Dependency-free, same as break-answers.js and announcement-attachments.js:
// the upload action and `node --test` both read it.

// What a jsonb column refuses, in the form Prisma sends it - serialized json,
// where every one of these arrives as an escape rather than a raw character.
//
//   U+0000            22P05  unsupported Unicode escape sequence
//   a lone surrogate  22P02  invalid input syntax for type json
//
// Both asked of the real database rather than assumed, along with everything it
// TAKES: U+0001, U+001F, a tab, a newline, a complete surrogate pair and an
// accented name all store fine. docs/week10/scratch/jsonb-refuses.mjs.
//
// JSON.stringify escapes control characters, so scanning its output is exactly
// what the database gets to see - scanning the original strings for a raw NUL
// would be looking at a different thing from the one that fails. That is not a
// hypothetical: written the obvious way round it finds nothing at all.
//
// ANY `\ud***` ESCAPE IS A LONE HALF, and no pairing test is needed to know it.
// JSON.stringify has been well-formed since ES2019: a complete pair comes out
// as the character itself and never as an escape, so an escape in that range is
// only ever emitted for a half with no partner. A lookahead for the other half
// would be a condition that can never fire.
//
//   "done 😀"   ->  "done 😀"        the pair, raw
//   "odd \ud83d" ->  "odd \\ud83d"   the half, escaped
const REFUSED = /\\u0000|\\ud[89a-f][0-9a-f]{2}/i;

// A short label for what was found. The character itself is zero-width, so
// printing it into an error message would be invisible in exactly the way the
// original was.
function nameOf(escape) {
  return /^\\u0000$/i.test(escape)
    ? "a NUL (U+0000)"
    : `half a surrogate pair (U+${escape.slice(2).toUpperCase()})`;
}

// null when the value can be stored. Otherwise what was found and the text
// around it, because "somewhere in 44KB of json" is not a place anyone can go
// and look.
export function unstorable(value) {
  let json;
  try {
    json = JSON.stringify(value);
  } catch {
    // circular or otherwise unserializable. not our failure to describe, and
    // it would fail on the way out long before Postgres saw it.
    return null;
  }
  if (!json) return null;
  const m = REFUSED.exec(json);
  if (!m) return null;
  return {
    escape: m[0],
    what: nameOf(m[0]),
    // the escape sits in the middle, so both sides of it are readable
    near: json.slice(Math.max(0, m.index - 60), m.index + 60),
  };
}

// The same question over a whole upload's worth of rows, returning every person
// it would refuse rather than only the first. The old failure stopped at the
// 25th of 60 and nobody found out about anyone after her.
export function unstorableRows(rows) {
  const out = [];
  for (const row of rows || []) {
    const bad = unstorable(row?.data);
    if (bad) out.push({ name: row?.sourceName || "(unknown)", ...bad });
  }
  return out;
}
