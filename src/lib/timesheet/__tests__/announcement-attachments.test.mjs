// DOCUMENTS ATTACHED TO AN ANNOUNCEMENT.
//
// Mánu 2026-08-10, after Britny could not get the workers' comp training out:
// a post has to be able to carry its PDFs, from the forms library or uploaded
// straight onto it, and staff get them in the email as well as on the page.
//
// These helpers are a trust boundary. The stored value is Json, so anything
// that ever reaches `attachments` is rendered as a link on a page staff read
// and emailed to every one of them - a url from the wrong place is a phishing
// link with the company's name on it.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  cleanAttachment,
  attachmentsOf,
  ATTACH_ACCEPT,
  ATTACH_MAX_COUNT,
} from "../../announcement-attachments.js";

test("a library pick and an upload both survive, and say which they are", () => {
  const fromLibrary = cleanAttachment({
    name: "ILS Staff Training", url: "/forms/ils-staff-training.pdf", formId: "abc", bytes: 559000,
  });
  assert.equal(fromLibrary.url, "/forms/ils-staff-training.pdf");
  assert.equal(fromLibrary.formId, "abc", "so the post can link back to the library");

  const uploaded = cleanAttachment({
    name: "One-off notice", url: "https://blob.vercel-storage.com/x.pdf", bytes: 1200,
  });
  assert.equal(uploaded.formId, null, "no library row behind it - it lives on the post");
  assert.equal(uploaded.bytes, 1200);
});

test("a url from anywhere else is dropped", () => {
  // THE ONE THAT MATTERS. This ends up as a link in an email to 59 people, so a
  // crafted post must not be able to point it at somebody else's site.
  assert.equal(cleanAttachment({ name: "Payroll", url: "http://evil.example/x.pdf" }), null,
    "plain http is refused even though it parses");
  assert.equal(cleanAttachment({ name: "Payroll", url: "javascript:alert(1)" }), null);
  assert.equal(cleanAttachment({ name: "Payroll", url: "//evil.example/x.pdf" }), null,
    "protocol-relative is not a same-origin path");
  assert.equal(cleanAttachment({ name: "x", url: "" }), null);
  assert.equal(cleanAttachment(null), null);
  assert.equal(cleanAttachment("/forms/x.pdf"), null, "a bare string is not an attachment");
});

test("a nameless attachment still reads as something", () => {
  // it is drawn as link text; an empty one would be an invisible target
  assert.equal(cleanAttachment({ url: "/forms/x.pdf" }).name, "Document");
  assert.equal(cleanAttachment({ name: "   ", url: "/forms/x.pdf" }).name, "Document");
  assert.equal(cleanAttachment({ name: "x".repeat(400), url: "/forms/x.pdf" }).name.length, 120);
});

test("the stored list is cleaned and capped on the way out", () => {
  const post = {
    attachments: [
      { name: "Good", url: "/forms/a.pdf" },
      { name: "Bad", url: "http://evil.example/b.pdf" },
      null,
      { name: "Also good", url: "https://blob.vercel-storage.com/c.pdf" },
    ],
  };
  const out = attachmentsOf(post);
  assert.deepEqual(out.map((a) => a.name), ["Good", "Also good"], "the bad one is gone");

  // and a post that never had any is an empty array, not null - every caller
  // maps over this
  assert.deepEqual(attachmentsOf({}), []);
  assert.deepEqual(attachmentsOf({ attachments: null }), []);
  assert.deepEqual(attachmentsOf(null), []);
  assert.deepEqual(attachmentsOf({ attachments: "nope" }), []);

  const many = { attachments: Array.from({ length: 20 }, (_, i) => ({ name: `n${i}`, url: `/forms/${i}.pdf` })) };
  assert.equal(attachmentsOf(many).length, ATTACH_MAX_COUNT);
});

test("only PDFs are accepted", () => {
  // the point of an attachment here is something staff read and sign, and the
  // portal can only render and sign a PDF - a .docx helps nobody
  assert.deepEqual(ATTACH_ACCEPT, ["application/pdf"]);
});
