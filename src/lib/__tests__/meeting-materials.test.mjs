// THE DOCUMENTS A MEETING WAS RUN FROM, loaded so the attendance report can
// carry them rather than point at them. The loader reads two shapes - a library
// pick is a path into public/, an upload is a blob url - and the path one is
// where a stored string could try to climb out of the directory.
import test from "node:test";
import assert from "node:assert/strict";
import { loadMeetingMaterials } from "../meeting-materials.js";

test("a material cannot read its way out of public/", async () => {
  // cleanAttachment lets "/../package.json" through - it starts with one slash,
  // so it reads as same-origin - which makes the resolve check in bytesOf the
  // only thing between a stored path and any file on the server ending up in a
  // document somebody downloads.
  const out = await loadMeetingMaterials({
    attachments: [{ name: "escape", url: "/../package.json", formId: null, bytes: null }],
  });
  assert.equal(out.length, 1, "it is still listed, because the meeting had it");
  assert.equal(out[0].bytes, null);
  assert.equal(out[0].note, "could not be read");
});

test("a real library document does load, so the test above is not passing for the wrong reason", async () => {
  const out = await loadMeetingMaterials({
    attachments: [{ name: "guide", url: "/forms/qsp-documentation-scheduling-guide.pdf", formId: "x", bytes: null }],
  });
  assert.ok(out[0].bytes && out[0].bytes.length > 1000, "the loader can in fact read a real one");
  assert.equal(out[0].note, null);
});
