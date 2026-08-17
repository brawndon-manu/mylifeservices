// A REASON NOBODY SELECTED IS A REASON NOBODY PRINTS.
//
// `loadBreakReasons` opens `if (!ts?.userId || !ts?.batch?.periodFrom) return []`,
// so a route whose select omits `userId` gets an empty list, no error, and a
// sheet with a short Comments block - which looks exactly like a person who was
// never asked anything. Every one of the four render routes had it missing, so
// no reason had ever reached a real sheet. Mánu typed eleven through his own
// review page on 2026-08-17 and none of them appeared on the document.
//
// Read as SOURCE on purpose. The failure is a missing column in a Prisma
// select, which no unit test of the renderer can see and which a live render is
// the only other way to catch.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("RENDER_SELECT carries the column the reasons are keyed on", () => {
  const src = read("../render-sheet.js");
  const block = src.slice(src.indexOf("export const RENDER_SELECT"), src.indexOf("const sum ="));
  assert.match(block, /userId:\s*true/);
  assert.match(block, /batch:\s*\{[\s\S]*periodFrom:\s*true/);
});

// the two batch routes build their own selects rather than reusing
// RENDER_SELECT, so each needs its own guard
const ROUTES = [
  ["../../../app/portal/admin/timesheets/[id]/download/route.js", "merged batch PDF"],
  ["../../../app/portal/admin/timesheets/[id]/download-zip/route.js", "batch zip"],
];

for (const [file, label] of ROUTES) {
  test(`${label} selects userId, or its sheets lose every reason`, () => {
    const src = read(file);
    assert.match(src, /loadBreakReasons/, "this route renders sheets");
    assert.match(src, /userId:\s*true/, `${label} must select userId`);
  });
}

test("every route that loads reasons also selects the key they hang off", () => {
  // the whole set, so a fifth render route cannot be added without one
  const files = [
    "../../../app/portal/admin/timesheets/sheet/[id]/download/route.js",
    "../../../app/t/[token]/pdf/route.js",
    ...ROUTES.map(([f]) => f),
  ];
  for (const f of files) {
    const src = read(f);
    if (!/loadBreakReasons/.test(src)) continue;
    const ok = /userId:\s*true/.test(src) || /RENDER_SELECT/.test(src);
    assert.ok(ok, `${f} loads reasons without selecting userId`);
  }
});
