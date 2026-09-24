// WHAT A FLAG IS FOR, pinned: the engine's phrases read back into their rules
// (the old ten-minute wording too), an upload's flip is the flip and not the
// flag it quotes, a person's words never read as a rule, and a report picked
// for some types holds those flags and says so.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FLAG_TYPES, flagTypesOf, countFlagTypes, pickFlags, flagTypeLabel } from "../flag-types.js";
import { flagReportModel, flagReportDetailModel } from "../flag-report.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const flag = (reason, over = {}) => ({ decision: "flagged", reason, kinds: [], billableMin: null, ...over });

test("the engine's own sentence reads back into every rule it names", () => {
  assert.deepEqual(flagTypesOf(flag("Auto: the DSN was filed more than 15 minutes from the clock out.")), ["filed-off-clock"]);
  assert.deepEqual(flagTypesOf(flag("Auto: the DSN was filed more than 10 minutes from the clock out.")), ["filed-off-clock"]);
  assert.deepEqual(flagTypesOf(flag("Auto: no clock out; no clock in.")).sort(), ["no-clock-in", "no-clock-out"]);
  assert.deepEqual(flagTypesOf(flag("Auto: no DSN; the note records contact that was not in person.")).sort(), ["no-dsn", "remote"]);
});

test("an upload's flip is the flip, never the earlier flag it quotes", () => {
  assert.deepEqual(flagTypesOf(flag("Auto: changed after review (billed 2.00h → 2.57h). Earlier flag: \"Auto: no clock out.\"")), ["flip-changed"]);
  assert.deepEqual(flagTypesOf(flag("Auto: gone from the latest upload. Was approved by Brianna Wyatt.")), ["flip-gone"]);
  assert.deepEqual(flagTypesOf(flag("Auto: back in the upload. Was approved by Brianna Wyatt.")), ["flip-back"]);
});

test("a person's flag reads as what they ticked, and their typed words never as a rule", () => {
  assert.deepEqual(flagTypesOf(flag("No clock out")), ["hand"]);
  assert.deepEqual(flagTypesOf(flag(null)), ["hand"]);
  assert.deepEqual(flagTypesOf(flag("thin note", { kinds: ["note"] })), ["kind-note"]);
  assert.deepEqual(flagTypesOf(flag("under billed", { billableMin: 90 })), ["kind-billing"]);
  // the engine's flag a person later ticked the dsn on is both
  assert.deepEqual(flagTypesOf(flag("Auto: no DSN.", { kinds: ["note"] })), ["no-dsn", "kind-note"]);
  // an approval is not a flag
  assert.deepEqual(flagTypesOf({ decision: "approved", reason: "Auto: no DSN." }), []);
});

test("a report picks any of the chosen types, every flag when none, and drops keys nothing knows", () => {
  const flags = [
    flag("Auto: no DSN."),
    flag("Auto: the DSN was filed more than 15 minutes from the clock out."),
    flag("Auto: no DSN; no clock out."),
    flag("Needs to be reviewed"),
  ];
  assert.equal(pickFlags(flags, ["no-dsn"]).length, 2);
  assert.equal(pickFlags(flags, ["no-dsn", "filed-off-clock"]).length, 3);
  assert.equal(pickFlags(flags, []).length, 4);
  assert.equal(pickFlags(flags, ["nonsense"]).length, 4);
  const counts = countFlagTypes(flags);
  assert.equal(counts["no-dsn"], 2);
  assert.equal(counts["no-clock-out"], 1);
  assert.equal(counts.hand, 1);
  assert.equal(flagTypeLabel("filed-off-clock"), "DSN filed away from the clock out");
  assert.ok(FLAG_TYPES.every((t) => ["auto", "hand", "upload"].includes(t.group)));
});

test("a picked report names its flags in the title and first line, and leaves the approved out", () => {
  const f = { who: "Dana Whitfield", date: "09/03/26", startMin: 600, client: "Rivera, Ana", service: "ILS Service", billedMin: 120, clockedMin: 120, reason: "Auto: no DSN." };
  const approved = [{ who: "Dana Whitfield", billedMin: 120 }];
  const whole = flagReportModel({ periodFrom: "09/01/26", periodTo: "09/30/26", flags: [f], approved, generatedOn: "09/23/26" });
  assert.equal(whole.title, "Service audit - flagged shifts");
  assert.ok(whole.approved);
  const one = flagReportModel({ periodFrom: "09/01/26", periodTo: "09/30/26", flags: [f], approved, generatedOn: "09/23/26", only: ["No DSN"] });
  assert.equal(one.title, "Flagged shifts - No DSN");
  assert.equal(one.summary[0], "Only these flags: No DSN.");
  assert.equal(one.approved, null);
  const two = flagReportDetailModel({ periodFrom: "09/01/26", periodTo: "09/30/26", flags: [], generatedOn: "09/23/26", only: ["No DSN", "No clock out"] });
  assert.equal(two.title, "Flagged shifts, detailed - 2 kinds of flag");
  assert.deepEqual(two.summary, ["Only these flags: No DSN; No clock out.", "No shift carries these flags in this period."]);
});

test("the route reads the picked types and the download offers them", () => {
  const route = read("src/app/portal/admin/audit/[id]/report/route.js");
  assert.match(route, /const flagged = pickFlags\(decisions\.filter\(\(r\) => r\.decision === "flagged"\), typeKeys\);/);
  assert.equal((route.match(/\n\s+only,\n/g) || []).length, 2, "both shapes are told which flags");
  const dl = read("src/app/portal/admin/audit/AuditDownloads.js");
  assert.match(dl, /byType: true/);
  assert.match(dl, /types=\$\{\[\.\.\.picked\]\.join\(","\)\}/);
  const page = read("src/app/portal/admin/audit/[id]/page.js");
  assert.match(page, /countFlagTypes\(periodFlags\)/);
});
