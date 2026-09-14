// NAMING A CERTIFICATE RUN - Mánu 2026-09-13: "can i have option to rename".
//
// The title is not only a heading. It is slugged into the filename of the
// single PDF and the batch zip, and it is the folder name inside the whole-run
// zip, so an empty or runaway one reaches the files somebody downloads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTitle, MAX_TITLE } from "../title.js";

test("an ordinary title is left exactly as typed", () => {
  assert.equal(cleanTitle("HIPAA Omnibus Rule"), "HIPAA Omnibus Rule");
});

test("surrounding and repeated whitespace is collapsed", () => {
  // a name pasted out of a PDF arrives with newlines and double spaces in it
  assert.equal(cleanTitle("  HIPAA   Omnibus\n Rule  "), "HIPAA Omnibus Rule");
});

test("a title with nothing in it comes back empty so the caller can refuse it", () => {
  assert.equal(cleanTitle("   \n\t "), "");
  assert.equal(cleanTitle(""), "");
  assert.equal(cleanTitle(null), "");
  assert.equal(cleanTitle(undefined), "");
});

test("a runaway title is capped and never left ending in a space", () => {
  const long = `${"a".repeat(MAX_TITLE - 1)} bbbb`;
  const out = cleanTitle(long);
  assert.equal(out.length, MAX_TITLE - 1);
  assert.equal(out, "a".repeat(MAX_TITLE - 1));
});

test("a non-string is not allowed to reach the database as one", () => {
  assert.equal(cleanTitle(13), "13");
});
