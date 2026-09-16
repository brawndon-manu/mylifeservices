// THE PROGRESS STRIP FITS ITS OWN STEP COUNT ON A PHONE.
//
// It was a two column grid at every width, which suits the day program's four
// steps and breaks ILS's three into 2 + 1 with Sign alone on a row of its own -
// Mánu 2026-09-16: "on mobile the numbers can also be side by side cause it
// looks awkward with 1 review days 2 generate and 3 sign on its own row alone."
//
// Measured in the browser at 375: three steps laid in one row take 245px against
// a 343px budget, and four take exactly 343, which wraps "Review days" onto two
// lines. So the count decides, and a client component's rule is pinned as text.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../../../app/t/[token]/ReviewFlow.js", import.meta.url), "utf8");

test("three steps go in a row and four stay in a square", () => {
  assert.match(src, /const stripClass = steps\.length > 3 \? "grid grid-cols-2 gap-2" : "flex gap-3";/);
});

test("the strip uses it, rather than carrying its own hardcoded grid", () => {
  assert.match(src, /aria-label="Timesheet progress" className=\{`mt-6 scroll-mt-24 border-b border-sep pb-5 sm:flex sm:flex-wrap sm:gap-5 \$\{stripClass\}`\}/);
  assert.doesNotMatch(src, /className="mt-6 grid scroll-mt-24 grid-cols-2/);
});
