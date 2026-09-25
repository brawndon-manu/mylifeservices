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
// THE NAME THEY GO BY, BESIDE QSP'S "Last, First" ON THE PAY PERIOD LIST.
//
// The list is ordered by QSP's spelling, so it leads with that; the portal name
// sits next to it only where it says something the export doesn't. Same
// surname: just the first name they go by ("Rivera, Anabel" + "Annie"). A
// different surname: the whole portal name. Case, accents and a trailing
// middle name or initial on either side are not a difference.
const fold = (s) => String(s || "")
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

export function portalNameBeside(sourceName, portalName) {
  const portal = String(portalName || "").trim().replace(/\s+/g, " ");
  if (!portal) return null;
  const s = String(sourceName || "");
  const comma = s.indexOf(",");
  const last = (comma < 0 ? s : s.slice(0, comma)).trim();
  const first = comma < 0 ? "" : s.slice(comma + 1).trim();
  const words = portal.split(" ");
  const lastLen = fold(last).split(" ").filter(Boolean).length;
  const sameLast = lastLen > 0 && words.length > lastLen
    && fold(words.slice(words.length - lastLen).join(" ")) === fold(last);
  if (!sameLast) {
    // an account with no name set falls back to its email, which is not a name
    if (portal.includes("@")) return null;
    const whole = fold(portal);
    return whole === fold(`${first} ${last}`) || whole === fold(first) ? null : portal;
  }
  const given = words.slice(0, words.length - lastLen).join(" ");
  const g = fold(given).split(" ").filter(Boolean);
  const q = fold(first).split(" ").filter(Boolean);
  // one reads as the start of the other: "Joseph" and "Joseph A" are one name
  const agrees = g.every((t, i) => q[i] === t) || q.every((t, i) => g[i] === t);
  return agrees ? null : given;
}

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
