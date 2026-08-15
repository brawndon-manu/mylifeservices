// WHAT A SHEET CALLS THE PERSON, which is not what it MATCHES them by.
//
// `sourceName` is the name QSP exported - "Uribe, Brandon" - and it is the key
// the engine matches rest report rows on, through `restKey` and `restNameFor`.
// Rewriting it to change what a page says would strand every rest row filed
// under the old spelling: the calendar draws no breaks, the questions built from
// those rows stop existing, and it fails SILENTLY. That is the exact shape of
// the "Delgado Pineda, Ruth" filed under "Angel" problem.
//
// So this decides what is DISPLAYED and nothing else. Two callers - the
// timesheet review page and the printed sheet - and neither of them touches the
// key the matching runs on.
// DEPENDENCY-FREE, deliberately. `contacts.js` would be the natural home for
// this and it imports `@/lib/positions`, which `node --test` cannot resolve -
// and `render-sheet.js` is imported directly by three test files. Same reason
// `timesheet-subjects.js` sits on its own.
//
// The only name logic reproduced here is "their first name", one expression. The
// ordinary path does not compute a name at all: it returns what the caller
// already worked out with the real `preferredName`, so there is no second
// spelling of the thing that matters.

// ON A REHEARSAL BATCH, THE FIRST NAME ALONE.
//
// `testOnly` batches exist to be recorded and shown - they email one address and
// nothing else - so the sheet says "Manu" rather than "Uribe, Brandon". On every
// ordinary batch this returns exactly what it always did, so nothing an employee
// actually signs is changed by it.
export function sheetDisplayName({ user, sourceName, batch, fallback = null }) {
  // ON A REHEARSAL BATCH, WHATEVER THE SHEET ITSELF SAYS.
  //
  // `sourceName` is the one field somebody editing a rehearsal batch actually
  // changes - it is what the printed sheet has always shown - so this reads it
  // rather than reaching for the account behind the sheet.
  //
  // IT READ `firstNameOf(user)` FIRST AND THAT WAS WRONG TWICE OVER. The review
  // page shows the ACCOUNT's name and the sheet shows `sourceName`, so pointing
  // both at the account moved the wrong one; and once `sourceName` was set to
  // "Manu" the override went on returning the account's "Brandon" and quietly
  // beat the change it was supposed to be serving.
  if (batch?.testOnly && sourceName) return sourceName;
  return fallback || sourceName || "";
}
