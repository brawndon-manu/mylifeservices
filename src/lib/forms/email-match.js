// WHICH ACCOUNT A REPLY BELONGS TO.
//
// Ordered most confident first, and it STOPS RATHER THAN GUESSES. Mánu
// 2026-09-12: "you can leave unnasisgned for not conifident matches" - which is
// what FormSubmission already does for a no-login submit, and what AssignPicker
// is already built to resolve. An acknowledgment credited to the wrong person
// is worse than one credited to nobody: the wrong person now appears to have
// signed something they never saw.
//
// DEACTIVATED ACCOUNTS COUNT. This is a backfill of a thread from May, and
// people have left since - Johanna Salgado already had. A compliance record
// that silently drops everybody who has moved on is the opposite of a record.

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// EVERY ADDRESS HERE IS <something>.mylifeservices@gmail.com or
// mylifeservices.<something>@, so the company's own name is noise in the local
// part. Stripping it is what turns joe.mylifeservices@gmail.com into "joe",
// which is how Joseph Gutierrez signs his replies.
const COMPANY_TOKEN = /mylifeservices/g;
const localRaw = (email) => String(email || "").split("@")[0].toLowerCase().replace(COMPANY_TOKEN, "");
const localPart = (email) => norm(localRaw(email).replace(/[._-]/g, " "));
// the local part with nothing between the letters, for the surname patterns
const localTight = (email) => localRaw(email).replace(/[^a-z]/g, "");

// every spelling an account answers to, and the first names that are unique
export function buildDirectory(users) {
  const byName = new Map();
  const byLocal = new Map();
  const byEmail = new Map();
  const firstNames = new Map();
  const put = (map, key, id) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(id);
  };
  for (const u of users || []) {
    put(byName, norm(u.name), u.id);
    put(byName, norm([u.preferredFirstName, u.preferredLastName].filter(Boolean).join(" ")), u.id);
    // "Joe" is Joseph Gutierrez, whose address is joe.mylifeservices@gmail.com.
    // The local part is how people are actually addressed here.
    put(byLocal, localPart(u.email), u.id);
    if (u.email) put(byEmail, String(u.email).toLowerCase(), u.id);
    const first = norm(u.name).split(" ")[0];
    put(firstNames, first, u.id);
  }
  return { byName, byLocal, byEmail, firstNames, users: new Map((users || []).map((u) => [u.id, u])) };
}

const only = (set) => (set && set.size === 1 ? [...set][0] : null);

// one entry against the directory. `how` is kept because the confirm screen
// says it out loud - a match found in the body is worth a second look in a way
// an exact name is not.
export function matchEntry(entry, dir) {
  const display = norm(entry?.displayName);
  if (!display) return { userId: null, how: "no name" };

  // the sender line's own address, when Gmail included one
  if (entry.senderEmail) {
    const byMail = only(dir.byEmail.get(entry.senderEmail));
    if (byMail) return { userId: byMail, how: "email address" };
  }

  const exact = only(dir.byName.get(display));
  if (exact) return { userId: exact, how: "name" };

  const local = only(dir.byLocal.get(display));
  if (local) return { userId: local, how: "email name" };

  // THE BODY, FOR THE NAME ONLY. Never for an address: in the real thread every
  // address inside a body belonged to somebody else, quoted from the message
  // being replied to.
  const body = norm(entry?.body);
  if (body) {
    const hits = new Set();
    for (const [key, ids] of dir.byName) {
      if (!key.includes(" ")) continue;
      if (body.includes(key)) for (const id of ids) hits.add(id);
    }
    // "Jenny Delgado" signs as "Jennifer Delgado"; the account is Jennifer
    // Delgado Pineda, so the typed name is a prefix of the real one.
    if (hits.size === 0) {
      for (const [key, ids] of dir.byName) {
        if (!key.includes(" ")) continue;
        const typed = body.match(/[a-z]+ [a-z]+/g) || [];
        if (typed.some((t) => key.startsWith(t))) for (const id of ids) hits.add(id);
      }
    }
    if (hits.size === 1) return { userId: [...hits][0], how: "name in the reply" };
    if (hits.size > 1) return { userId: null, how: "more than one name in the reply" };
  }

  // AN ACCOUNT THAT HOLDS ONLY A FIRST NAME. Three people in the real thread
  // sign "Norman Lawler", "Ravon-Symone Hardy", "Edward Castro" against
  // accounts named just Norman, Ravon-Symone and Edward - and each address
  // carries the surname: nlawler, rhardy, edwardc. Both halves have to agree,
  // so this is a corroborated match rather than a guess on a first name.
  const words = display.split(" ").filter(Boolean);
  if (words.length > 1) {
    const [first, ...rest] = words;
    const surname = rest.join("").replace(/-/g, "");
    const firstTight = first.replace(/-/g, "");
    const shapes = new Set([
      `${firstTight[0]}${surname}`,
      `${firstTight}${surname[0]}`,
      `${firstTight}${surname}`,
      `${surname}${firstTight[0]}`,
    ]);
    const hits = new Set();
    for (const id of dir.firstNames.get(first) || []) {
      const tight = localTight(dir.users.get(id)?.email);
      if (tight && shapes.has(tight)) hits.add(id);
    }
    const corroborated = only(hits);
    if (corroborated) return { userId: corroborated, how: "name and address agree" };
  }

  const first = only(dir.firstNames.get(display.split(" ")[0]));
  if (first && !display.includes(" ")) return { userId: first, how: "first name" };

  return { userId: null, how: display.includes(" ") ? "no account" : "first name only" };
}

// the whole paste, with the sender's own message dropped - it is the notice,
// not an acknowledgment of it
export function matchThread(entries, dir, { senderName = "" } = {}) {
  const sender = norm(senderName);
  const rows = [];
  for (const e of entries || []) {
    if (sender && norm(e.displayName) === sender) continue;
    rows.push({ ...e, ...matchEntry(e, dir) });
  }
  return rows;
}

export const HOW_LABELS = {
  "email address": "Matched on the address in the thread",
  name: "Matched on the name Gmail shows",
  "email name": "Matched on their email name",
  "name in the reply": "Matched on the name they typed in the reply",
  "more than one name in the reply": "The reply names more than one person",
  "no account": "No account with that name",
  "name and address agree": "Matched on the name with the address agreeing",
  "first name only": "Only a first name, and it is not unique",
  "no name": "No name on the message",
};
