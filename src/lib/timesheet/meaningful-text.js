// A REASON HAS TO SAY SOMETHING.
//
// A dot, an n/a or a lone space gets a box past "required" without saying
// anything, and people do try it. Every box that asks for a reason - the
// report's note, the
// break reasons, the something-else report - reads this, on the page and on
// the server, so the two cannot disagree about what counts as words.
//
// The rule is deliberately small: three letters in a row somewhere, and not
// one of the stand-ins people type to get past a box. It cannot tell a real
// sentence from a keyboard mash, and does not try - that is payroll's read.
// Dependency-free so a node test can import it straight.
const STAND_INS = new Set([
  "na", "n/a", "n.a", "none", "nothing", "null", "nil", "no", "nope", "idk",
  "x", "xx", "xxx", "asdf", "test", "ok", "okay", "yes", "tbd", "blank", "same",
]);

export function meaningfulText(text) {
  const s = String(text ?? "").trim().toLowerCase();
  if (!s) return false;
  if (STAND_INS.has(s.replace(/[.\s!-]+$/g, ""))) return false;
  return /\p{L}{3,}/u.test(s);
}

// TYPED, BUT A STAND-IN: one of the words above, or not a letter in it at
// all (".", "-", "12"). only this gets the short line below. a reason still
// being typed ("I w") isn't refused, it's just not done yet, so the box keeps
// asking the way it does when it's empty
export function standInText(text) {
  const s = String(text ?? "").trim().toLowerCase();
  if (!s) return false;
  if (STAND_INS.has(s.replace(/[.\s!-]+$/g, ""))) return true;
  return !/\p{L}/u.test(s);
}

// what a box says to a stand-in, the same line on every reason box. it
// doesn't name what was refused, so it doesn't teach anyone what gets past
export const NEEDS_REAL_WORDS = "Write a few words.";
