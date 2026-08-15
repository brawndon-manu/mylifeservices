// A CONTROL CHARACTER IN THE EXPORT TAKES THE WHOLE UPLOAD OUT.
//
// The 08/16 pull carried a NUL (0x0000) in one person's rows and killed the
// batch twice over: the signed sheet would not render, because WinAnsi has no
// glyph for it, and the insert was then refused by postgres with 22P05,
// "unsupported Unicode escape sequence" - a \u0000 cannot live in a json value.
//
// It died on the 25th sheet of 60 and left a part-built batch behind each time.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const PARSE = fs.readFileSync("src/lib/timesheet/parse.js", "utf8");

// the same expression the parser uses, so this cannot drift from it
const SRC = PARSE.match(/const stripControl = \(s\) => String\(s \?\? ""\)\.replace\((\/[^/]+\/g)/);
const strip = (s) => String(s ?? "").replace(new RegExp(SRC[1].slice(1, -2), "g"), "");

test("the parser strips control characters where text comes off the page", () => {
  assert.ok(SRC, "stripControl is gone or has been rewritten");
  assert.match(PARSE, /\.map\(\(i\) => \(\{ \.\.\.i, str: stripControl\(i\.str\) \}\)\)/);
});

test("the character that broke it does not survive", () => {
  assert.equal(strip("Lambert, McKenzie\u0000"), "Lambert, McKenzie");
  assert.equal(strip("\u0000\u0000"), "");
});

test("and everything printable does, accents included", () => {
  // the sheets carry these names and they have to come through exactly
  for (const name of ["Mánu", "Delgado Pineda, Ruth", "Urena, Marilyn", "Rotter, B."]) {
    assert.equal(strip(name), name);
  }
});

test("it is stripped before the empty check, not after", () => {
  // a cell that is ONLY control characters has to drop out entirely, or it
  // becomes an empty item that still occupies a column position
  const i = PARSE.indexOf("str: stripControl(i.str)");
  const j = PARSE.indexOf(".filter((i) => i.str.trim())");
  assert.ok(i > -1 && j > i, "the filter runs before the strip, so a NUL-only cell survives");
});

test("trim would not have caught it, which is why this exists", () => {
  // NUL is not whitespace, so `.trim()` walked straight past it
  assert.equal("\u0000abc\u0000".trim(), "\u0000abc\u0000");
  assert.equal(strip("\u0000abc\u0000"), "abc");
});
