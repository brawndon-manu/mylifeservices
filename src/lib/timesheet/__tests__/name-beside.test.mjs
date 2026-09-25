// THE PAY PERIOD LIST LEADS WITH QSP'S "Last, First" AND PUTS THE NAME THEY GO
// BY BESIDE IT, ONLY WHERE THE TWO SAY DIFFERENT THINGS.
//
// made-up people throughout.
import test from "node:test";
import assert from "node:assert/strict";
import { portalNameBeside } from "../display-name.js";

test("the same name both ways adds nothing", () => {
  assert.equal(portalNameBeside("Rivera, Anabel", "Anabel Rivera"), null);
});

test("a different first name on the same surname shows just the first name", () => {
  assert.equal(portalNameBeside("Rivera, Anabel", "Annie Rivera"), "Annie");
});

test("a two-word surname is matched whole", () => {
  assert.equal(portalNameBeside("Castillo Vega, Maria", "Mia Castillo Vega"), "Mia");
  assert.equal(portalNameBeside("Castillo Vega, Maria", "Maria Castillo Vega"), null);
});

test("a different surname shows the whole portal name", () => {
  assert.equal(portalNameBeside("Stone, Dana", "Dana Brooks"), "Dana Brooks");
});

test("case, accents and a trailing middle initial are not a difference", () => {
  assert.equal(portalNameBeside("Ortiz, Rene", "René Ortiz"), null);
  assert.equal(portalNameBeside("RIVERA, ANABEL", "Anabel Rivera"), null);
  assert.equal(portalNameBeside("Rivera, Anabel M", "Anabel Rivera"), null);
  assert.equal(portalNameBeside("Rivera, Anabel", "Anabel M Rivera"), null);
});

test("no account, no name, or an email in place of one shows nothing", () => {
  assert.equal(portalNameBeside("Stone, Dana", null), null);
  assert.equal(portalNameBeside("Stone, Dana", ""), null);
  assert.equal(portalNameBeside("Stone, Dana", "dana.stone@example.com"), null);
  assert.equal(portalNameBeside("Stone, Dana", "Dana"), null);
});
