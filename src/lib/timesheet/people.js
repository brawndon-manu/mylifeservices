// ONE PERSON, WHATEVER THE DOCUMENT CALLS THEM.
//
// Four documents name the same staff member and they do not agree:
//
//   the timesheet     the LEGAL name, "Delgado Pineda, Ruth"
//   the clock export  the name they go by, "Delgado Pineda, Angel"
//   the service note  the name they go by, written out, "Joseph Hernandez"
//   the portal        both, on the account
//
// Reconciled here so every screen answers the same way. Left alone, a person's
// clock rows simply never reach their shifts: Ruth/Angel and Francisco/Frank
// between them had 13 rows that found nothing, and ten of those became phantom
// bookings built out of a clock row that matched no roster.

import { scheduleKey } from "./schedule.js";

// SPELLINGS THAT ARE THE SAME PERSON, PENDING A FIX AT SOURCE.
//
// Not a fuzzy matcher. Every entry is a specific mistake somebody found in a
// specific document, listed so it can be read, argued with and deleted once the
// source is corrected. A rule that guessed which near-identical names are the
// same person would eventually merge two real people, which on a screen that
// reports who billed what is the worst thing it could do.
//
// Mánu 2026-08-27: "tell me which reports have those name errors then ammend
// those names to match until we get that sorted."
export const NAME_FIXES = [
  {
    // ONE MISSING "n", AND THE DOCUMENTS THAT STILL CARRY IT ARE FROZEN.
    //
    // QSP was corrected somewhere between the 08/01 and 08/16 exports: the
    // clock exports, the service notes and the 08/16 timesheet all spell it
    // Hernandez. The portal account was corrected on 2026-08-27.
    //
    // What CANNOT be corrected is the 08/01 and 07/16 timesheet exports already
    // in the database - `sourceName` is what QSP printed at the time and this
    // codebase keeps it verbatim on purpose, so somebody can check our reading
    // against the document. So this entry stays until those periods are
    // re-uploaded from a corrected export, and can be deleted then.
    canonical: "Hernandez, Joseph",
    also: ["Hernadez, Joseph"],
    why: "the 08/01 and 07/16 timesheet exports drop an n; the portal account was fixed 2026-08-27",
  },
];

// Build the resolver from the portal's own accounts. Both the legal name and
// the name somebody goes by land on ONE key, and the legal spelling is the
// canonical side because that is what the timesheet - the document that pays -
// calls them.
export function buildWhoKey(users = []) {
  const alias = new Map();

  for (const u of users) {
    const legal = scheduleKey(u?.name || "");
    if (!legal) continue;
    alias.set(legal, legal);
    const first = u.preferredFirstName || String(u.name || "").split(" ")[0];
    const last = u.preferredLastName || String(u.name || "").split(" ").slice(1).join(" ");
    const goesBy = scheduleKey([first, last].filter(Boolean).join(" "));
    if (goesBy && goesBy !== legal) alias.set(goesBy, legal);
  }

  // the corrections go on last so they win, and they point at whatever the
  // canonical spelling already resolves to rather than at themselves
  for (const fix of NAME_FIXES) {
    const to = scheduleKey(fix.canonical);
    const target = alias.get(to) || to;
    alias.set(to, target);
    for (const wrong of fix.also) {
      const from = scheduleKey(wrong);
      if (from) alias.set(from, target);
    }
  }

  return (name) => {
    const k = scheduleKey(name);
    return alias.get(k) || k;
  };
}
