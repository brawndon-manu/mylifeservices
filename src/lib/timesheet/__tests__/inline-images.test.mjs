// PICTURES AND GIFS IN THE MIDDLE OF AN ANNOUNCEMENT.
//
// The body is markdown, so an inline picture is `![alt](url)` sitting in the
// text - which means the thing that can go wrong is textual: an alt or a url
// that closes its own brackets early leaves half a filename loose in a post
// every staff member reads, and an insert that ignores the caret puts the GIF
// somewhere the author didn't ask for.
//
// The upload rules are checked twice, in the browser and again in the route, so
// they're tested here once.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  INLINE_IMAGE_ACCEPT,
  INLINE_IMAGE_MAX_BYTES,
  altFromFilename,
  cleanAlt,
  imageFileProblem,
  imageMarkdown,
  inlineImageKey,
  inlineImageUrlsIn,
  insertImageMarkdown,
  isInlineImageKey,
} from "../../announcement-images.js";

const URL = "https://x.public.blob.vercel-storage.com/announcements/inline/1-abc.gif";

test("the image lands where the caret is, not at the end of the post", () => {
  const body = "Party is Friday. Bring a friend.";
  const caret = "Party is Friday.".length;
  const { text, cursor } = insertImageMarkdown(body, caret, caret, {
    url: URL,
    alt: "confetti",
  });

  assert.equal(text, `Party is Friday. ![confetti](${URL}) Bring a friend.`);
  assert.equal(text.slice(cursor), " Bring a friend.", "caret sits after the image");
});

test("a space is added so the image isn't glued onto the word before it", () => {
  const { text } = insertImageMarkdown("nice", 4, 4, { url: URL, alt: "a" });
  assert.equal(text, `nice ![a](${URL})`);

  // already whitespace there? then no second space.
  const spaced = insertImageMarkdown("nice ", 5, 5, { url: URL, alt: "a" });
  assert.equal(spaced.text, `nice ![a](${URL})`);

  // start of an empty box gets nothing padded around it
  const empty = insertImageMarkdown("", 0, 0, { url: URL, alt: "a" });
  assert.equal(empty.text, `![a](${URL})`);
});

test("selected text becomes the alt and is replaced", () => {
  const body = "Look at this cat";
  const { text } = insertImageMarkdown(body, 13, 16, { url: URL });
  assert.equal(text, `Look at this ![cat](${URL})`);
});

test("a bracket in the alt can't close the image early", () => {
  // "summer [final]" would end the alt at the first ] and drop "final]" into
  // the post as loose characters.
  const { text } = insertImageMarkdown("", 0, 0, {
    url: URL,
    alt: "summer [final] flyer",
  });
  assert.equal(text, `![summer final flyer](${URL})`);
  assert.equal(cleanAlt("two\nlines   here"), "two lines here");
});

test("a url with a space or a paren gets the angle-bracket form", () => {
  const spaced = "https://x.public.blob.vercel-storage.com/my gif (final).gif";
  assert.equal(imageMarkdown(spaced, "x"), `![x](<${spaced}>)`);
  assert.equal(imageMarkdown(URL, "x"), `![x](${URL})`);
  assert.equal(imageMarkdown("", "x"), "", "no url, nothing to insert");
});

test("a caret past the end of the text doesn't lose any of it", () => {
  const { text } = insertImageMarkdown("hi", 99, 99, { url: URL, alt: "a" });
  assert.equal(text, `hi ![a](${URL})`);
});

test("only the file types the picker offers get through, under the size cap", () => {
  assert.equal(imageFileProblem({ type: "image/gif", size: 900_000 }), null);
  assert.ok(INLINE_IMAGE_ACCEPT.includes("image/gif"), "the whole point");

  const pdf = imageFileProblem({ type: "application/pdf", size: 900 });
  // the sentence grew MP4 and MOV on 2026-09-04 - video rides this lane now
  assert.match(pdf, /JPG, PNG, WebP, GIF, MP4, or MOV/, "a PDF is an attachment, not media");

  const fat = imageFileProblem({ type: "image/png", size: INLINE_IMAGE_MAX_BYTES + 1 });
  assert.match(fat, /under/, "and it says how big it may be");

  assert.ok(imageFileProblem(null), "nothing picked");
  assert.ok(imageFileProblem({ type: "image/png", size: 0 }), "empty file");
});

test("the blob key comes off the mime type, not the filename", () => {
  assert.equal(
    inlineImageKey("image/gif", "abc123", 1700000000000),
    "announcements/inline/1700000000000-abc123.gif",
  );
  // a filename can say anything; the type is what we actually accepted
  assert.equal(inlineImageKey("image/jpeg", "zz", 1).endsWith(".jpg"), true);
  assert.equal(inlineImageKey("image/svg+xml", "zz", 1).endsWith(".bin"), true);
  assert.match(inlineImageKey("image/png", "../../etc", 1), /^announcements\/inline\/1-etc\.png$/);
});

test("the key the browser asks to write to is checked, not trusted", () => {
  // the upload goes from the editor straight to the blob store now, so the
  // pathname is whatever the page asked for. what the token endpoint allows is
  // our prefix, our key shape, and our extensions - nothing else.
  assert.equal(isInlineImageKey(inlineImageKey("image/gif", "abc123", 1700000000000)), true);

  for (const bad of [
    "announcements/inline/../../secrets.png",
    "announcements/1-abc.png", // right bucket area, wrong prefix
    "forms/inline/1-abc.png",
    "announcements/inline/1-abc.pdf", // not an image type
    "announcements/inline/1-abc.png/../x",
    "announcements/inline/abc.png", // no timestamp
    "announcements/inline/1-abc.png ",
    "",
    null,
  ]) {
    assert.equal(isInlineImageKey(bad), false, `should refuse ${JSON.stringify(bad)}`);
  }
});

test("an alt is guessed from the filename when the author doesn't write one", () => {
  assert.equal(altFromFilename("summer_party-final.GIF"), "summer party final");
  assert.equal(altFromFilename("C:\\Users\\me\\flyer.png"), "flyer");
});

test("cleanup finds our own inline images and leaves everything else alone", () => {
  const body = [
    `![a](${URL})`,
    "![b](https://someone-else.example/cat.gif)",
    "![c](/logo/treelogo_gradient.png)",
    `![d](<https://x.public.blob.vercel-storage.com/announcements/inline/2-d.png>)`,
    `![dup](${URL})`,
  ].join("\n\n");

  const found = inlineImageUrlsIn(body);
  assert.deepEqual(found, [
    URL,
    "https://x.public.blob.vercel-storage.com/announcements/inline/2-d.png",
  ]);
  assert.deepEqual(inlineImageUrlsIn(""), []);
});
