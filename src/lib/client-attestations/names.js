// PUTTING TWO SPELLINGS OF THE SAME PERSON TOGETHER.
//
// Three documents describe this work and none of them spell a name the same
// way:
//
//   the schedule export  "Jacob Acuna"        first name first
//   HR's client roster   "Acuna, Jacob"       surname first
//   the schedule again   "Solorzano, I"       staff, surname and an initial
//
// So the join is by TOKENS, not by string. Order carries no information once
// two documents disagree about it, and every real difference between them is
// punctuation: brackets around a chosen name ("Acuna, Jose ( Angel)"), quotes
// around a nickname ('Sherwold, Abigail "Abbie"'), a stray full stop ("Elder.
// Morton, Susan").
//
// Pure - no prisma, no pdf - so the tests can run it over the real roster.

// every word in a name, lowercased, accents folded, punctuation gone. Accents
// are folded because the same person is "Ureña" on one export and "Urena" on
// the next, and neither document is wrong.
function tokens(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// A CLIENT'S IDENTITY ACROSS THE TWO DOCUMENTS. Sorted, so "Jacob Acuna" and
// "Acuna, Jacob" land on the same key, and single letters dropped so a middle
// initial printed on one export and not the other cannot split a person in two.
//
// Verified against the real August 2026 export: all 252 scheduled clients find
// their row in the 274-row roster, and no two roster rows share a key.
export function clientKey(name) {
  return tokens(name)
    .filter((t) => t.length > 1)
    .sort()
    .join(" ");
}

// STAFF ARE PRINTED WITH AN INITIAL AND THE INITIAL IS THE POINT.
//
// "Solorzano, I" is a surname and one letter, and that letter is the only thing
// separating two people who share a surname. The timesheet matcher throws
// single-character tokens away - correctly, for the full "Last, First" names it
// reads - so this cannot use it and does its own thing instead.
//
// Returns null for anything that isn't a surname followed by an initial, which
// is how a mis-read cell stops before it becomes a match.
export function staffNameParts(name) {
  const [surname, rest] = String(name || "").split(",");
  if (!rest) return null;
  const last = tokens(surname).join(" ");
  const initial = tokens(rest).join("").slice(0, 1);
  if (!last || !initial) return null;
  return { last, initial };
}

// does a portal account answer to this "Last, F"?
//
// Both halves have to line up: the surname has to appear among the names the
// account is known by, and a first name has to START with the initial. A
// SURNAME ALONE IS NOT A MATCH - "Nguyen, R" and "Nguyen, J" are two people,
// and this list has several such pairs.
function accountAnswersTo(user, parts) {
  const legal = tokens(user?.name);
  const first = tokens(user?.preferredFirstName);
  const last = tokens(user?.preferredLastName);

  const surnames = new Set([...legal, ...last]);
  if (!surnames.has(parts.last)) return false;

  // any given name on the account, which is every token that isn't the surname
  const givens = [...legal.filter((t) => t !== parts.last), ...first];
  return givens.some((t) => t.startsWith(parts.initial));
}

// MATCH A SCHEDULE'S STAFF NAME TO A PORTAL ACCOUNT.
//
// Only ever a suggestion, like every other matcher here: a wrong one routes a
// client's attestation to the wrong supervisor, so an ambiguous name resolves
// to nothing and waits for a person rather than picking the first row back.
//
// returns { userId, method } where method is "initial" | "ambiguous" | "unmatched"
export function matchScheduleStaff(sourceName, users) {
  const parts = staffNameParts(sourceName);
  if (!parts) return { userId: null, method: "unmatched" };

  const hits = (users || []).filter((u) => accountAnswersTo(u, parts));
  if (hits.length === 1) return { userId: hits[0].id, method: "initial" };
  if (hits.length > 1) return { userId: null, method: "ambiguous" };
  return { userId: null, method: "unmatched" };
}

// ---------------------------------------------------------------- staff names

// TURNING "Solorzano, I" INTO "Ilean Solorzano".
//
// The approved form prints the staff member's full name under each visit, and
// the schedule export does not carry one - QSP abbreviates every first name to a
// single letter inside a day cell. So the name has to be recovered from people
// we already know about: portal accounts first, because those are the agency's
// own record of who somebody is, and HR's roster behind them, because the
// roster names case workers in full and reaches people who have no portal
// account yet.
//
// A person is accepted from either shape:
//   { id, name, preferredFirstName, preferredLastName }   a portal account
//   "Solorzano, Ilean"                                     a roster case worker
//
// The comma is what distinguishes them, and it has to be: "Solorzano Ilean"
// alone cannot be told apart from a two-word surname.
function personOf(entry) {
  // A ROSTER NAME SAYS WHERE THE SURNAME ENDS. The comma is the whole point of
  // the format, so nothing here has to be guessed.
  if (typeof entry === "string") {
    const [last, first] = entry.split(",");
    if (!first) return null;
    const display = `${first.trim()} ${last.trim()}`.replace(/\s+/g, " ").trim();
    const surname = tokens(last).join(" ");
    const givens = tokens(first);
    if (!surname || !givens.length) return null;
    return { display, identity: tokens(entry).sort().join(" "), splits: [{ surname, givens }] };
  }

  if (!entry?.name && !entry?.preferredFirstName) return null;

  // The name people are actually called, same rule the rest of the portal uses.
  //
  // Built from the ORIGINAL strings and never from `tokens`, which lowercases
  // and strips accents to compare with - fine for matching, wrong for printing.
  // A name is going under somebody's visit on a document a client signs.
  const raw = String(entry.name || "").trim().split(/\s+/).filter(Boolean);
  const first = entry.preferredFirstName || raw.slice(0, -1).join(" ");
  const surname = entry.preferredLastName || raw.slice(-1).join(" ");
  const display = `${first} ${surname}`.replace(/\s+/g, " ").trim();

  // A PORTAL ACCOUNT DOES NOT SAY WHERE THE SURNAME ENDS. "Juanita Romero-Alba"
  // is one field, and the schedule prints her as "Romero-Alba, J" - so a surname
  // taken as the last token alone ("alba") never matches. Compound surnames are
  // common on this roster: Romero-Alba, Delgado Pineda, Hernandez-Nieves,
  // Martinez-Andraca, Mc Carter Jr.
  //
  // So the account is indexed under EVERY plausible split - the last token, the
  // last two, the last three - and the schedule's own spelling picks the one
  // that fits. Over-indexing is safe in the direction that matters: a spurious
  // key can only ever collide with another person's, and a collision poisons the
  // key rather than resolving it.
  const legal = tokens(entry.name);
  const splits = [];
  for (let k = 1; k <= 3 && k < legal.length; k++) {
    const sn = legal.slice(-k).join(" ");
    const givens = legal.slice(0, -k);
    if (sn && givens.length) splits.push({ surname: sn, givens });
  }
  // a preferred surname that isn't simply the tail of the legal name
  const preferredLast = tokens(entry.preferredLastName).join(" ");
  if (preferredLast) {
    const givens = [...tokens(entry.preferredFirstName), ...legal.filter((t) => !preferredLast.split(" ").includes(t))];
    if (givens.length) splits.push({ surname: preferredLast, givens });
  }
  // a preferred first name is a given name under every split
  const preferredFirst = tokens(entry.preferredFirstName);
  if (preferredFirst.length) {
    for (const sp of [...splits]) sp.givens = [...new Set([...sp.givens, ...preferredFirst])];
  }
  if (!splits.length) return null;
  return { display, identity: legal.slice().sort().join(" "), splits };
}

// AN INDEX OF EVERYONE WE COULD NAME, keyed by surname and first initial - which
// is exactly what the schedule prints, and exactly as much as it prints.
//
// Order matters: earlier entries win, so callers pass portal accounts before
// roster names and the agency's own spelling of a person is the one that shows.
//
// A KEY CLAIMED BY TWO DIFFERENT PEOPLE IS POISONED, not resolved. Two staff
// called "Torres, S" cannot be told apart from the schedule alone, and printing
// one of their names under the other's visit is worse than printing neither.
export function staffDirectory(entries) {
  const index = new Map();
  for (const entry of entries || []) {
    const person = personOf(entry);
    if (!person) continue;
    for (const { surname, givens } of person.splits) {
      for (const given of givens) {
        const key = `${surname}|${given.slice(0, 1)}`;
        const held = index.get(key);
        if (held === undefined) index.set(key, person);
        // THE SAME PERSON FROM TWO SOURCES IS NOT A COLLISION. The portal knows
        // "Mánu Uribe" (preferred) and the roster prints "Uribe, Brandon" - one
        // human, two spellings, and poisoning the key printed him abbreviated
        // on his own clients' forms. Same token set = same person; the earlier
        // source wins, and callers pass accounts before roster names on purpose.
        else if (held && held.identity !== person.identity) index.set(key, null);
      }
    }
  }
  return index;
}

// the full name for a schedule's "Last, F", or null when nobody fits it or more
// than one person does. Callers fall back to the printed abbreviation, which is
// always true even when it is not helpful.
export function expandStaffName(printed, directory) {
  const parts = staffNameParts(printed);
  if (!parts || !directory) return null;
  return directory.get(`${parts.last}|${parts.initial}`)?.display || null;
}
