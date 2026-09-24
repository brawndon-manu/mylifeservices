// A PERSON SERVED, BY INITIALS - all an email may say about who they are. the
// full name stays in the portal, behind a sign-in.
//
//   "James Caviar" -> "J.C."          "CAVIAR, JAMES" -> "J.C."
//   "Mary Ann Smith" -> "M.S."        "Jacob Mc Carter Jr." -> "J.C."
//   "Cher" -> "C."                    "a; b" (two on one line) -> "J.C. & M.S."
//
// first letter of the first name and of the last surname word, suffixes
// (Jr., III...) skipped. dependency-free so the node tests can pin it.
const SUFFIX = /^(jr|sr|ii|iii|iv|v)\.?$/i;
const letter = (w) => (String(w || "").match(/\p{L}/u)?.[0] || "").toUpperCase();

function one(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  let first;
  let last;
  if (s.includes(",")) {
    const [surname, given] = s.split(",", 2);
    first = String(given || "").trim().split(/\s+/)[0];
    const words = surname.trim().split(/\s+/).filter((w) => !SUFFIX.test(w));
    last = words[words.length - 1];
  } else {
    const words = s.split(/\s+/).filter((w) => !SUFFIX.test(w));
    first = words[0];
    last = words.length > 1 ? words[words.length - 1] : "";
  }
  return [letter(first), letter(last)].filter(Boolean).map((c) => `${c}.`).join("");
}

export function clientInitials(name) {
  return String(name || "")
    .split(";")
    .map(one)
    .filter(Boolean)
    .join(" & ");
}
