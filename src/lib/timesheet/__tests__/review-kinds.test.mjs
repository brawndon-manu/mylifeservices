// WHAT A FLAG IS ABOUT - Mánu 2026-09-12: "i want the options to include
// 'Changed billing time' and thats for when i changed the appropriate billing
// time on my findings as well as flagged DSN. flagged above would hold all of
// those combined."
//
// The load-bearing choice is that BILLING IS DERIVED, not stored. 59 flags had
// already changed a billable figure before any of this existed; deriving the
// label off billableMin means all 59 carry it with no backfill and nobody has
// to tick a box for something they already typed. Store it instead and those
// 59 stay untagged forever.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  BILLING_KIND, CHOSEN_KINDS, ALL_KINDS,
  kindsOf, hasKind, labelOfKind, offerableKinds, countKinds,
} from "../review-kinds.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("a changed billing time labels itself, with nothing stored", () => {
  const flag = { decision: "flagged", kinds: [], billableMin: 45 };
  assert.deepEqual(kindsOf(flag), [BILLING_KIND]);
  assert.ok(hasKind(flag, BILLING_KIND));
  // zero is a real correction - "nothing billable" - and must not read as absent
  assert.deepEqual(kindsOf({ kinds: [], billableMin: 0 }), [BILLING_KIND]);
  assert.deepEqual(kindsOf({ kinds: [], billableMin: null }), []);
  assert.ok(!CHOSEN_KINDS.includes(BILLING_KIND), "it is never offered as a choice");
});

test("one flag can be about several things at once", () => {
  // changing the figure BECAUSE the DSN is thin is one flag about two things
  const flag = { kinds: ["note"], billableMin: 20 };
  assert.deepEqual(kindsOf(flag), ["note", BILLING_KIND]);
  const both = { kinds: ["schedule", "note"], billableMin: null };
  // order follows ALL_KINDS so two flags never list the same set differently
  assert.deepEqual(kindsOf(both), ["note", "schedule"]);
});

test("a kind nothing can label is dropped rather than shown", () => {
  assert.deepEqual(kindsOf({ kinds: ["note", "nonsense"], billableMin: null }), ["note"]);
  assert.deepEqual(kindsOf(null), []);
});

test("the note label follows the source, because 12 of them are not DSNs", () => {
  assert.equal(labelOfKind("note", "dsn"), "DSN");
  assert.equal(labelOfKind("note", "xls"), "Service note");
  assert.equal(labelOfKind(BILLING_KIND), "Changed billing time");
  assert.equal(labelOfKind("shift"), "The shift");
});

test("a shift is only offered kinds it actually has", () => {
  assert.deepEqual(offerableKinds({ note: {}, scheduleNote: {} }), ["note", "schedule", "shift"]);
  assert.deepEqual(offerableKinds({ note: {} }), ["note", "shift"]);
  // a shift with no note at all can still be flagged about itself
  assert.deepEqual(offerableKinds({}), ["shift"]);
});

test("the sub-counts count shifts, and may exceed the pile", () => {
  const rows = [
    { review: { decision: "flagged", kinds: ["note"], billableMin: 30 } },
    { review: { decision: "flagged", kinds: ["shift"], billableMin: null } },
  ];
  const c = countKinds(rows);
  assert.equal(c.note, 1);
  assert.equal(c.shift, 1);
  assert.equal(c[BILLING_KIND], 1);
  // two shifts, three marks - the first is about two things
  assert.equal(ALL_KINDS.reduce((n, k) => n + c[k], 0), 3);
});

test("approving never carries kinds, and the column is additive", () => {
  const actions = read("src/app/portal/admin/audit/actions.js");
  assert.match(actions, /kinds: decision === "flagged" \? kinds : \[\]/, "an approval is not about anything");
  // only the chosen kinds are storable - billing would be a second source of
  // truth for something billableMin already says
  assert.match(actions, /filter\(\(k\) => CHOSEN_KINDS\.includes\(k\)\)/);
  const sql = read("prisma/migrations/20260912010000_shift_review_kinds/migration.sql");
  assert.match(sql, /ADD COLUMN "kinds" TEXT\[\] NOT NULL DEFAULT ARRAY\[\]::TEXT\[\]/);
  assert.doesNotMatch(sql, /DROP|DELETE/, "nothing is dropped");
});

test("flagging from inside a note leaves the rest of the flag alone", () => {
  const actions = read("src/app/portal/admin/audit/actions.js");
  const fn = actions.slice(
    actions.indexOf("export async function toggleReviewKind"),
    actions.indexOf("export async function undoReview"),
  );
  assert.ok(fn.length > 500, "found toggleReviewKind");
  assert.match(fn, /isAdminUp\(user\?\.role\)/, "admin and up, like the rest of the page");
  assert.match(fn, /supersededBy/, "a superseded copy decides nothing");
  assert.match(fn, /error: "kind"/, "an unknown kind is refused");
  // it must never touch these - the decide bar owns them
  for (const field of ["reason:", "billableMin:", "billableFromMin:"]) {
    assert.ok(!fn.includes(`${field} `) || !new RegExp(`data: \\{[^}]*${field}`).test(fn), `it does not write ${field}`);
  }
  // removing the last kind does not unflag: 695 flags on record carry none
  assert.match(fn, /off\s*\?\s*\{\}\s*:\s*\{ decision: "flagged"/, "only adding flags the shift");
});

test("one control on both surfaces, and each says what it is about once", () => {
  const control = read("src/app/portal/admin/audit/[id]/FlagAbout.js");
  assert.match(control, /export default function FlagAbout/);
  for (const surface of ["AuditCards", "StudyMode"]) {
    const src = read(`src/app/portal/admin/audit/[id]/${surface}.js`);
    assert.match(src, /import FlagAbout from "\.\/FlagAbout"/, `${surface} shares it`);
    // A CONTROL ONLY WHERE THERE IS SOMETHING TO READ - Mánu 2026-09-12:
    // "maybe remove This shift needs a second look... what is this about is
    // good enough and it doesnt make it too noisy." The shift kind is still
    // pickable, in the flag panel's chooser, just not as a fifth line on
    // every card.
    for (const kind of ["note", "schedule"]) {
      assert.ok(src.includes(`"${kind}", off`), `${surface} can flag the ${kind} where it is read`);
    }
    assert.ok(!src.includes('"shift", off'), `${surface} has no standalone shift control`);
    // ONE summary per card, not a mark on every disclosure saying the same
    // thing: with a chip row under the name, per-toggle marks put the word
    // "Flagged" on screen five times for one shift.
    assert.ok(!src.includes("FlagAboutMark"), `${surface} does not repeat the mark`);
    assert.match(src, /labelOfKind\(k, r(ow)?\.note\?\.source\)/, `${surface} prints the kinds as a summary`);
  }
  // the shift is still reachable - the flag panel offers every kind the shift
  // actually has, which is the only place it is chosen now
  const cards = read("src/app/portal/admin/audit/[id]/AuditCards.js");
  assert.match(cards, /offerable\.map\(\(k\) =>/, "the chooser offers the kinds");
  assert.match(cards, /offerableKinds\(r\)/);
  assert.match(read("src/app/portal/admin/audit/[id]/StudyMode.js"), /setKindsByShift/, "the deck remembers its own");
});

test("the kinds narrow the flagged pile and nothing else", () => {
  const cards = read("src/app/portal/admin/audit/[id]/AuditCards.js");
  assert.match(cards, /\["open", "flagged", "approved", "all"\]/, "the strip is still four decisions");
  assert.match(cards, /decision === "flagged" && \(/, "the kind row only shows inside that pile");
  // the kind row renders under Flagged and nowhere else, so it must not bite
  // on another tab - a filter with no control on screen empties the list for
  // no visible reason
  assert.match(
    cards,
    /if \(decision === "flagged" && kindFilter !== "all" && !hasKind\(r\.review, kindFilter\)\) return false;/,
    "the kind filter only applies inside the flagged pile",
  );
  assert.match(cards, /setKindFilter\("all"\)/, "Clear filters clears it too");
  const shown = cards.slice(cards.indexOf("const shown = useMemo"), cards.indexOf("// ONE LINE PER PERSON"));
  assert.match(shown, /if \(!byDecision\(r\)\) return false;/, "the decision still applies underneath");
});
