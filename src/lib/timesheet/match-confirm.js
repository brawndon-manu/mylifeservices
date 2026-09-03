// WHETHER A SHEET'S MATCH STILL NEEDS A PERSON - Mánu 2026-09-03, after
// "Lines, Megan" went to Megan McAlpine's inbox: QSP had two Megans, the
// matcher best-guessed the wrong account at 50%, and nothing stood between
// the guess and a send carrying somebody else's wage data.
//
// The matcher itself says a fuzzy match "still needs eyeballing" (match.js),
// and in practice every fuzzy match ever recorded scored exactly 50 - the
// matcher is sure or it is guessing, so there is no threshold to tune. A
// guess never sends. Picking the person on the row - the very account the
// matcher guessed included - records matchMethod "manual", which is the
// confirmation.
//
// The review screen imports this; the send action enforces the same rule as
// a query filter (matchMethod not "fuzzy") because the refusal must happen in
// the database, before a row is even in the list to send. The structural test
// pins both spellings to this file so they cannot drift.
export function unconfirmedMatch(row) {
  return row?.matchMethod === "fuzzy";
}
