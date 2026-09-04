// VIDEO IN AN ANNOUNCEMENT - Mánu 2026-09-04: ".mov and .mp4 files". The
// rules ride the inline-media lane (browser to blob, never an email
// attachment); these pin the accept list, the keys, the per-kind ceilings,
// and the two renderings - a player on the portal, a link in the email.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  INLINE_MEDIA_ACCEPT, INLINE_VIDEO_MAX_BYTES, INLINE_IMAGE_MAX_BYTES,
  imageFileProblem, inlineImageKey, isInlineImageKey, isVideoUrl,
} from "../announcement-images.js";
import { renderMarkdown } from "../markdown.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const MB = 1024 * 1024;

test("mp4 and mov are accepted with their own ceiling; images keep theirs", () => {
  assert.ok(INLINE_MEDIA_ACCEPT.includes("video/mp4"));
  assert.ok(INLINE_MEDIA_ACCEPT.includes("video/quicktime"));
  assert.equal(imageFileProblem({ type: "video/mp4", size: 400 * MB }), null);
  assert.match(
    imageFileProblem({ type: "video/mp4", size: INLINE_VIDEO_MAX_BYTES + 1 }),
    /Videos have to be under 500 MB/,
  );
  // a 30MB gif is still refused as an image - video room is not image room
  assert.match(
    imageFileProblem({ type: "image/gif", size: INLINE_IMAGE_MAX_BYTES + 1 }),
    /Images have to be under/,
  );
  assert.match(imageFileProblem({ type: "video/x-msvideo", size: 5 }), /JPG, PNG, WebP, GIF, MP4, or MOV/);
});

test("video keys mint and pass the gate", () => {
  assert.equal(inlineImageKey("video/mp4", "abc", 5), "announcements/inline/5-abc.mp4");
  assert.equal(inlineImageKey("video/quicktime", "abc", 5), "announcements/inline/5-abc.mov");
  assert.ok(isInlineImageKey("announcements/inline/5-abc.mp4"));
  assert.ok(isInlineImageKey("announcements/inline/5-abc.mov"));
  assert.ok(isVideoUrl("https://x/y.MP4"));
  assert.ok(isVideoUrl("https://x/y.mov?d=1"));
  assert.ok(!isVideoUrl("https://x/y.png"));
});

test("the portal plays it, the email links it, and nobody smuggles a player", () => {
  const md = "![clip](https://x/announcements/inline/1-a.mp4)";
  const portal = renderMarkdown(md);
  assert.match(portal, /<video src="https:\/\/x\/announcements\/inline\/1-a\.mp4" controls/);
  const email = renderMarkdown(md, { email: true });
  assert.doesNotMatch(email, /<video/);
  assert.match(email, />Watch the video<\/a>/);
  // a raw <video> typed into the body never reaches an email
  assert.doesNotMatch(renderMarkdown('<video src="https://x/a.mp4"></video>', { email: true }), /<video/);
  // and an image is still an image everywhere
  assert.match(renderMarkdown("![p](https://x/p.png)"), /<img /);
});

test("the token route grants per-kind terms and the editor offers both", () => {
  const route = read("src/app/api/announcements/image/route.js");
  assert.match(route, /video \? INLINE_VIDEO_ACCEPT : INLINE_IMAGE_ACCEPT/);
  assert.match(route, /video \? INLINE_VIDEO_MAX_BYTES : INLINE_IMAGE_MAX_BYTES/);
  const form = read("src/app/portal/announcements/_components/AnnouncementForm.js");
  assert.match(form, /INLINE_MEDIA_ACCEPT\.join/);
  assert.match(form, /Add image \/ GIF \/ video/);
});
