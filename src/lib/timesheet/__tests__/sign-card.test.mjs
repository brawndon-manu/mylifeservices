// SOMEWHERE TO SIGN THAT IS NOT EIGHT PIXELS TALL.
//
// A sign-mode document's signature box is drawn at the real field's place on the
// real page, and on the timesheet at 375 that is 112 by 8 - measured in the
// 09/15 audit and again on 2026-09-16 on his own sheet. That was the tap target
// for the most consequential press on the page. The approve page already had the
// answer: read the document, sign in a card beneath it, same pad and same field.
// Mánu 2026-09-16: "instead of pressing sign what if we have it how it is to
// sign the approval one?" The card measures 224 by 64, fifteen times the area.
//
// ONE SIGNATURE ONLY, his pick. The client attestation carries two and only one
// is required, so a single card cannot say which it is signing.
//
// Client components, so the rules are pinned as text.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const filler = fs.readFileSync(new URL("../../../app/portal/forms/[id]/fill/FormFiller.js", import.meta.url), "utf8");
const signer = fs.readFileSync(new URL("../../../app/t/[token]/TimesheetSigner.js", import.meta.url), "utf8");
const approve = fs.readFileSync(new URL("../../../app/portal/admin/timesheets/sheet/[id]/approve/ApproveSigner.js", import.meta.url), "utf8");

test("the card appears only on a sign-mode document with exactly one signature", () => {
  assert.match(filler, /\{signMode && sigFields\.length === 1 && \(/);
});

test("it opens the same pad and writes the same field the document's own box does", () => {
  // not a second signature stored somewhere else - the value IS the field, which
  // is what keeps the signature landing in its proper place on the page
  assert.match(filler, /onClick=\{\(\) => setSigning\(sigFields\[0\]\.name\)\}/);
  assert.match(filler, /values\[sigFields\[0\]\.name\]/);
  assert.match(filler, /onClick=\{\(\) => setVal\(sigFields\[0\]\.name, ""\)\}/);
});

test("it is the shape of the approve page, which is what he asked for", () => {
  for (const src of [filler, approve]) {
    assert.match(src, /h-16 w-56 items-center justify-center rounded-md border border-dashed/);
    assert.match(src, /Tap to sign/);
    assert.match(src, />\s*Clear\s*</);
  }
});

test("the timesheet names itself and every other document says document", () => {
  assert.match(signer, /signaturePlace="This is added to your timesheet above\."/);
  assert.match(filler, /signaturePlace = "This is added to the document above\.",/);
});
