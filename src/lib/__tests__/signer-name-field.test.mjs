// WHICH BOX THE SIGNER'S OWN NAME GOES IN. The emailed link knows the account,
// so the name box starts filled - but only where there is exactly one box it
// could belong to. Filling the wrong one puts a name against somebody else's
// signature, which is the whole reason this rule is not "the first name field".
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { signerNameField } from "../forms.js";

const text = (name) => ({ name, kind: "text" });
const sig = (name) => ({ name, kind: "signature" });

test("one name box takes the name", () => {
  // the driver accident protocol's own three fields
  assert.equal(
    signerNameField([text("Staff Name"), sig("Signature"), text("Date")]),
    "Staff Name",
  );
  assert.equal(signerNameField([text("Employee Name"), text("Date")]), "Employee Name");
  assert.equal(signerNameField([text("Print name")]), "Print name");
});

test("two name boxes take nothing, because neither is knowably the reader's", () => {
  assert.equal(
    signerNameField([text("Employee Name"), text("Supervisor name (print)"), sig("Signature")]),
    null,
  );
});

test("no name box, no fill", () => {
  assert.equal(signerNameField([text("Job Title"), sig("Signature"), text("Date")]), null);
  assert.equal(signerNameField([]), null);
  assert.equal(signerNameField(null), null);
  assert.equal(signerNameField(undefined), null);
  assert.equal(signerNameField([null, undefined]), null);
});

test("a signature box is not a name box - it is drawn, not typed", () => {
  assert.equal(signerNameField([sig("Signature of name holder")]), null);
  // and a lone signature named that way must not be mistaken for one
  assert.equal(signerNameField([sig("Employee Name Signature"), text("Date")]), null);
});

test("a date box is not a name box, even when it says name", () => {
  assert.equal(signerNameField([text("Name and date")]), null);
  assert.equal(signerNameField([text("Staff Name"), text("Name Date")]), "Staff Name");
});

test("the word has to be the word, not a fragment of another", () => {
  // "Names" is a name box; "Nameplate number" and "Surnamed" are not
  assert.equal(signerNameField([text("Names of witnesses")]), "Names of witnesses");
  assert.equal(signerNameField([text("Nameplate number")]), null);
  assert.equal(signerNameField([text("Unnamed party")]), null);
});

test("the filler asks for it, and asks for the one box or none", () => {
  const filler = fs.readFileSync(
    path.join(process.cwd(), "src/app/portal/forms/[id]/fill/FormFiller.js"),
    "utf8",
  );
  const code = filler.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(code, /import \{[^}]*\bsignerNameField\b[^}]*\} from "@\/lib\/forms"/);
  assert.match(code, /signerName/, "the prop has to reach the component");
  assert.match(code, /signerNameField\(pls\)/, "it classifies against the real placements");
  // the starting values are applied with `...v` LAST, so anything already typed
  // beats both the name and the date
  assert.match(code, /setValues\(\(v\) => \(\{ \.\.\.dated, \.\.\.v \}\)\)/);

  const route = fs.readFileSync(
    path.join(process.cwd(), "src/app/a/sign/[token]/page.js"),
    "utf8",
  );
  assert.match(route, /signerName=\{preferredName\(user\)\}/,
    "the emailed-link route is where the account is known");
});
