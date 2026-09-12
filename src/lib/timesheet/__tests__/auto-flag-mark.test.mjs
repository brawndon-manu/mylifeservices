// THE ENGINE'S OWN FLAGS, TOLD APART - Mánu 2026-09-12: "lets add a little
// robot emoticon for the auto flags", then "i dont want to use tan emoji. i
// want an emoticon something similar to the flag we are using."
//
// So it is the lucide Bot, drawn beside the same Flag the rest of the screen
// uses, at the same stroke and size - not an emoji, which renders in whatever
// the device feels like and sits at a different weight to everything around
// it. The UI gate says the same: one icon family, normalised size and stroke.
//
// 85 of the 120 flags on the current period are the engine's, so the line's
// main job is saying which is which. The other boundary pinned here: the mark
// is a SCREEN thing, the stored reason still starts "Auto:", and the workbook
// and the client report still print it verbatim.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AUTO_PREFIX, isAutoFlag, flagReasonBody, autoFlagRow } from "../auto-flag.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("the engine still writes the prefix it always wrote", () => {
  const row = { note: null, scheduleNote: null, billedMin: 60, clockedMin: null, review: null, reasons: [] };
  const made = autoFlagRow(row);
  if (made) assert.ok(made.reason.startsWith(AUTO_PREFIX), "a written reason still carries the prefix");
  assert.equal(AUTO_PREFIX, "Auto:");
});

test("a flag is the engine's only when its own prefix says so", () => {
  assert.ok(isAutoFlag({ reason: "Auto: no DSN; no clock out." }));
  assert.ok(!isAutoFlag({ reason: "No clock out" }), "his own words are not the engine's");
  assert.ok(!isAutoFlag({ reason: null }));
  assert.ok(!isAutoFlag(null));
  // a person could type the word, but not at the start with the colon
  assert.ok(!isAutoFlag({ reason: "Automatic gate would not open" }));
});

test("the robot stands in for the prefix rather than sitting beside it", () => {
  assert.equal(flagReasonBody("Auto: no DSN; no clock out."), "no DSN; no clock out");
  // a hand-typed reason loses nothing but its full stop
  assert.equal(flagReasonBody("No clock out."), "No clock out");
  assert.equal(flagReasonBody("The note records phone contact only"), "The note records phone contact only");
  assert.equal(flagReasonBody(null), "");
});

test("a quoted earlier reason keeps its own words", () => {
  // a re-flag on change wraps what the flag used to say: `Auto: changed after
  // review (...). Earlier flag: "Auto: no DSN."` Only the OUTER prefix is the
  // one the robot stands for. Rewriting the quoted one would edit a record of
  // what the flag said at the time, which is the one thing a quotation is for.
  const nested = 'Auto: changed after review (billed 2.00h to 1.35h). Earlier flag: "Auto: billed above the clock."';
  assert.ok(isAutoFlag({ reason: nested }));
  const body = flagReasonBody(nested);
  assert.ok(body.startsWith("changed after review"), "the outer prefix goes");
  assert.ok(body.includes('Earlier flag: "Auto: billed above the clock."'), "the quoted one stays");
  // six lines on the current period read exactly this way
});

test("the documents print the words, never the picture", () => {
  for (const f of ["src/lib/timesheet/audit-workbook.js", "src/app/portal/admin/audit/[id]/report/route.js"]) {
    const src = read(f);
    assert.doesNotMatch(src, /<Bot|lucide/, `${f} draws no icon`);
    assert.doesNotMatch(src, /flagReasonBody/, `${f} prints the stored reason verbatim`);
  }
});

test("an auto flag names the engine, not the person who ran it", () => {
  // Mánu 2026-09-12: "drop the name on auto flags... maybe auto flagged *bot
  // emoticon* - blah blah blah." 85 of 120 flags on the period said "Flagged
  // by Mánu Uribe" about a judgement the rules made.
  const line = read("src/app/portal/admin/audit/[id]/DecisionLine.js");
  assert.match(line, /auto \? "Auto flagged" : "Flagged"/, "the engine's flags say so");
  // the name is printed only when it is NOT the engine's
  assert.match(line, /\) : review\?\.by \? ` by \$\{review\.by\}` : ""/, "the name is the not-auto branch");
  // an approval can never print "Auto flagged" over the word Approved
  assert.match(line, /settled === "flagged" && isAutoFlag\(review\)/);
  // the lucide Bot, not an emoji: same family, stroke and size as the Flag
  // beside it. An emoji renders in whatever the device picks.
  assert.match(line, /<Bot size=\{13\}/, "it draws the Bot icon");
  assert.match(line, /\bBot\b.*from "lucide-react"/, "from the icon set the rest of the screen uses");
  assert.doesNotMatch(line, /\p{Extended_Pictographic}/u, "no emoji");
  // an icon alone says nothing to a screen reader
  assert.match(line, /aria-label="flagged by the engine"/);
});

test("all three places print the line through the one component", () => {
  // the card, a shift that has left the upload, and Focused review each built
  // this line themselves before, which is three chances to drift
  for (const f of ["AuditCards", "StudyMode"]) {
    const src = read(`src/app/portal/admin/audit/[id]/${f}.js`);
    assert.match(src, /import DecisionLine from "\.\/DecisionLine"/, `${f} uses it`);
    assert.doesNotMatch(src, /isAutoFlag|flagReasonBody|<Bot /, `${f} does not read the flag itself`);
    assert.doesNotMatch(src, /\p{Extended_Pictographic}/u, `${f} carries no emoji`);
    assert.doesNotMatch(src, /reason\.replace\(\/\\\.\$\/, ""\)/, `${f} no longer trims inline`);
  }
  const cards = read("src/app/portal/admin/audit/[id]/AuditCards.js");
  assert.equal((cards.match(/<DecisionLine /g) || []).length, 2, "the card and the lost shift");
  // Focused review keeps its own local decision, so it hands one in
  assert.match(read("src/app/portal/admin/audit/[id]/StudyMode.js"), /<DecisionLine review=\{row\.review\} decision=\{decided\[row\.shiftKey\]/);
});
