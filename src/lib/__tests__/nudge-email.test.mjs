// THE CHASE EMAIL IS THE SAME ENVELOPE AS THE PUBLISH ONE.
//
// It was its own hand-rolled div: no shell, a green button where the rest of the
// app is blue, the body escaped so markdown printed as asterisks, and the whole
// thing cut at 240 characters - which reached a real inbox mid-word, "The
// checklist page i", on a 271 character post.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const actions = fs.readFileSync(
  path.join(process.cwd(), "src/app/portal/announcements/actions.js"),
  "utf8",
);
// comments quote the old shapes on purpose - ask what the CODE does
const code = actions.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("the chase never truncates the post", () => {
  assert.doesNotMatch(code, /\.slice\(0,\s*240\)/, "the 240-character cut is the bug");
  assert.doesNotMatch(code, /\bsnippet\b/, "nothing should carry a slice of the body any more");
  // the whole content reaches both halves of the message
  assert.match(code, /renderMarkdown\(post\.content, \{ email: true \}\)/);
  // a plain substring, not a regex: the source has literal backslash-n in it and
  // every layer between here and the file wants to eat one of them
  assert.ok(
    code.includes('${post.content || ""}'),
    "the plain-text copy has to carry the whole body",
  );
});

test("it is built on the shared shell, not its own markup", () => {
  assert.match(code, /function ackEmailHtml\(\{ firstName, post, url, lead, logoUrl \}\)/);
  assert.match(code, /return buildAnnouncementEmailHtml\(\{/);
  // the shell decides the button and the line under it, from ONE place - those
  // words were matched across the three doors on 2026-09-08 and passing them
  // twice is how they drift apart
  assert.match(code, /ackNeedsSignature: !!post\.formId/);
  assert.match(code, /requireAck: true/);
});

test("the green button and the pasted url are gone", () => {
  assert.doesNotMatch(code, /#2f6f4f/, "that green exists nowhere else in the app");
  assert.doesNotMatch(code, /If the button doesnt work, paste this into your browser/);
});

test("the header has what it needs to print", () => {
  // author and date are read, or the shell prints an empty header
  assert.match(code, /createdAt: true,\n\s*author: \{ select: EMAIL_AUTHOR_SELECT \},/);
  assert.match(code, /authorName: preferredName\(post\.author\)/);
  // and a logo, resolved the way every other sender resolves one
  assert.match(code, /const logoUrl = process\.env\.EMAIL_LOGO_URL \|\| `\$\{base\}\/logo\/treelogo_gradient\.png`/);
});
