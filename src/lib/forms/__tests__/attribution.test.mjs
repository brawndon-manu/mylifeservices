// EVERY ATTRIBUTION THE CODE WRITES MUST BE KNOWN WHERE IT IS READ.
//
// The record page does `ATTRIBUTION[s.attribution] || ATTRIBUTION.unassigned`.
// A value it has not been told about does not throw - it renders "Needs
// assignment" on a row that IS assigned. The email import shipped 68 correctly
// attributed replies all wearing that badge, and the banner above them
// correctly said one. Nothing failed; the screen just lied.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// read from source rather than imported: query.js pulls in "@/lib/..." which
// only resolves inside Next's own build
const ATTRIBUTED = JSON.parse(
  /export const ATTRIBUTED = (\[[^\]]+\])/.exec(read("src/app/portal/admin/forms/query.js"))[1],
);

// everywhere a submission is created or re-attributed
const WRITERS = [
  "src/app/a/attest/[token]/actions.js",
  "src/app/a/sign/[token]/actions.js",
  "src/app/f/[slug]/actions.js",
  "src/app/portal/forms/actions.js",
  "src/app/portal/admin/forms/actions.js",
  "src/app/portal/admin/forms/email-import/actions.js",
];

function written() {
  const found = new Set();
  for (const f of WRITERS) {
    for (const m of read(f).matchAll(/attribution:\s*"([a-z-]+)"/g)) found.add(m[1]);
    // the import picks between two on one line
    for (const m of read(f).matchAll(/\?\s*"([a-z-]+)"\s*:\s*"([a-z-]+)"/g)) {
      if (/attribution/.test(read(f).slice(Math.max(0, m.index - 40), m.index))) {
        found.add(m[1]);
        found.add(m[2]);
      }
    }
  }
  return found;
}

test("every value written is either attributed or unassigned", () => {
  const known = new Set([...ATTRIBUTED, "unassigned"]);
  for (const v of written()) {
    assert.ok(known.has(v), `"${v}" is written but nothing knows what it means`);
  }
});

test("every attributed value has a badge and a label", () => {
  const page = read("src/app/portal/admin/forms/[id]/page.js");
  const query = read("src/app/portal/admin/forms/query.js");
  const badges = page.slice(page.indexOf("const ATTRIBUTION = {"), page.indexOf("};", page.indexOf("const ATTRIBUTION = {")));
  const labels = query.slice(query.indexOf("const ATTRIBUTION_LABELS = {"), query.indexOf("};", query.indexOf("const ATTRIBUTION_LABELS = {")));
  // a key may be quoted or not - "email-match" has to be, `assigned` need not
  const has = (block, v) => new RegExp(`(^|[\\s{,])"?${v}"?\\s*:`, "m").test(block);
  for (const v of ATTRIBUTED) {
    assert.ok(has(badges, v), `${v} has no badge, so its rows read "Needs assignment"`);
    assert.ok(has(labels, v), `${v} has no label`);
  }
  // and the fallback that makes this silent is still there, which is why the
  // test exists rather than a thrown error
  assert.match(page, /ATTRIBUTION\[s\.attribution\] \|\| ATTRIBUTION\.unassigned/);
});

test("the attributed filter is the list, not a copy of it", () => {
  const query = read("src/app/portal/admin/forms/query.js");
  assert.match(query, /where\.attribution = \{ in: ATTRIBUTED \}/,
    "a second hand-written list is how one of them gets forgotten");
  assert.ok(!ATTRIBUTED.includes("unassigned"), "unassigned is the absence of attribution");
});

test("the email import writes a value of its own", () => {
  // so the record can say an acknowledgment was read off a thread rather than
  // captured by the portal - they are not the same evidence
  assert.ok(ATTRIBUTED.includes("email-import"));
  const actions = read("src/app/portal/admin/forms/email-import/actions.js");
  assert.match(actions, /attribution: r\.userId \? "email-import" : "unassigned"/);
});
