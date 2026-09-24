// WHAT A FLAG IS FOR, TO PICK A REPORT BY.
//
// a flagged shift can be sent on for one reason alone: the dsns filed away from
// the clock out, the shifts with no dsn. every flag reads as one or more of
// these types, off what the flag itself says:
//   found by the auto flag   the rule phrases its own reason was written from
//   picked by hand           the kinds a person ticked, a corrected figure, or
//                            a flag with nothing but the words they typed
//   after an upload          the flips a new copy made of a decided shift
// a person's typed words are never read for a rule's phrase: "No clock out"
// typed by hand is a hand flag, because reading free text for a rule is
// guessing what somebody meant.
//
// import-free apart from the two modules that own the words, so the dialog,
// the report route and node --test all read one list.
import { AUTO_FLAG_RULES, AUTO_PREFIX } from "./auto-flag.js";
import { kindsOf, labelOfKind, BILLING_KIND } from "./review-kinds.js";

const FLIPS = [
  { key: "flip-changed", label: "Changed after review", opener: "Auto: changed after review" },
  { key: "flip-gone", label: "Gone from the latest upload", opener: "Auto: gone from the latest upload" },
  { key: "flip-back", label: "Back in the upload", opener: "Auto: back in the upload" },
];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// the filing gap has been worded with ten and with fifteen minutes; either is
// the same rule
const phraseRx = (rule) =>
  rule.key === "filed-off-clock"
    ? /^the DSN was filed more than \d+ minutes from the clock out$/
    : new RegExp(`^${rule.phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

// every type, in the order the dialog offers them
export const FLAG_TYPES = [
  ...AUTO_FLAG_RULES.map((r) => ({ key: r.key, label: cap(r.label), group: "auto" })),
  { key: "kind-note", label: "The DSN or service note", group: "hand" },
  { key: "kind-schedule", label: labelOfKind("schedule"), group: "hand" },
  { key: "kind-shift", label: labelOfKind("shift"), group: "hand" },
  { key: `kind-${BILLING_KIND}`, label: labelOfKind(BILLING_KIND), group: "hand" },
  { key: "hand", label: "Typed reason only", group: "hand" },
  ...FLIPS.map((f) => ({ key: f.key, label: f.label, group: "upload" })),
];

export const FLAG_TYPE_GROUPS = [
  { group: "auto", label: "Found by the auto flag" },
  { group: "hand", label: "Flagged by hand" },
  { group: "upload", label: "After an upload" },
];

export const flagTypeLabel = (key) => FLAG_TYPES.find((t) => t.key === key)?.label || null;

// the types one flag reads as. `review` is a stored decision (reason, kinds,
// billableMin); anything that isn't a flag has none
export function flagTypesOf(review) {
  if (!review || review.decision !== "flagged") return [];
  const out = [];
  const reason = typeof review.reason === "string" ? review.reason.trim() : "";
  const flip = FLIPS.find((f) => reason.startsWith(f.opener));
  if (flip) out.push(flip.key);
  else if (reason.startsWith(AUTO_PREFIX)) {
    // the engine's own sentence: its phrases, joined by semicolons
    const phrases = reason.slice(AUTO_PREFIX.length).trim().replace(/\.$/, "").split(";").map((p) => p.trim());
    for (const rule of AUTO_FLAG_RULES) {
      const rx = phraseRx(rule);
      if (phrases.some((p) => rx.test(p))) out.push(rule.key);
    }
  }
  const kinds = kindsOf(review);
  for (const k of kinds) out.push(`kind-${k}`);
  // a person's flag that says nothing but its words
  if (!reason.startsWith(AUTO_PREFIX) && !kinds.length) out.push("hand");
  return out;
}

// how many flags read as each type, for the dialog. a flag with two types
// counts under both, so the counts can sum to more than the flags
export function countFlagTypes(reviews) {
  const counts = Object.fromEntries(FLAG_TYPES.map((t) => [t.key, 0]));
  for (const r of reviews || []) for (const k of flagTypesOf(r)) counts[k] = (counts[k] || 0) + 1;
  return counts;
}

// the flags a report picked: any of the chosen types; all of them when none
// was chosen. unknown keys are dropped rather than matching nothing, so a
// stale link still returns a report
export function pickFlags(reviews, keys) {
  const wanted = (keys || []).filter((k) => FLAG_TYPES.some((t) => t.key === k));
  if (!wanted.length) return reviews || [];
  return (reviews || []).filter((r) => flagTypesOf(r).some((k) => wanted.includes(k)));
}
