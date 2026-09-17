// A FORM POST'S EMAIL GOES TO THE DOCUMENT, AND THE OPEN IS RECORDED FROM A
// BROWSER.
//
// The emailed link used to land on a page whose only job was a button. The
// button recorded an open and handed them on, and 25 of 113 never signed. Both
// senders point a form post at the document now, and the open that the press
// used to write is written by the client instead - because the page it lands on
// must not record anything on load, mail scanners being what they are.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
// comments name these things too - ask what the CODE does
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const send = strip(read("src/lib/announce-send.js"));
const actions = strip(read("src/app/portal/announcements/actions.js"));
const ackPage = strip(read("src/app/a/ack/[token]/page.js"));
const signPage = strip(read("src/app/a/sign/[token]/page.js"));
const signActions = strip(read("src/app/a/sign/[token]/actions.js"));
const filler = strip(read("src/app/portal/forms/[id]/fill/FormFiller.js"));

test("both senders take a form post to the document, and leave an ordinary post alone", () => {
  for (const [name, src] of [["first send", send], ["the nudge", actions]]) {
    assert.match(src, /\/a\/\$\{\s*post\.formId \? "sign" : "ack"\s*\}\//,
      `${name} has to branch on formId`);
    assert.doesNotMatch(src, /`\$\{base\}\/a\/ack\/\$\{signAckToken/,
      `${name} must not hard-code the ack door any more`);
  }
});

test("an old ack link forwards an unsigned form post to the document", () => {
  assert.match(ackPage, /if \(valid && needsSign && !signed\) redirect\(`\/a\/sign\/\$\{token\}`\)/);
  // and `signed` is read off the SIGNATURE, not off the ack row - the ack row
  // being exactly what used to make this page lie
  assert.match(ackPage, /signed = needsSign && !!\(await prisma\.formSubmission\.findFirst\(/);
  // the forward has to happen BEFORE `done` is computed, or it still dead-ends
  assert.ok(
    ackPage.indexOf("redirect(`/a/sign/") < ackPage.indexOf("const done ="),
    "the forward must come before done is decided",
  );
});

test("the signing page is the announcement, not a bare form", () => {
  assert.match(signPage, /renderMarkdown\(post\.content\)/);
  assert.match(signPage, /dangerouslySetInnerHTML=\{\{ __html: bodyHtml \}\}/);
  // the same classes the portal body uses, from one place
  assert.match(signPage, /import \{ renderMarkdown, PROSE \} from "@\/lib\/markdown"/);
});

test("the body reads the same way in both places, from one definition", () => {
  const md = read("src/lib/markdown.js");
  assert.match(md, /export const PROSE =/);
  const post = read("src/app/portal/announcements/[id]/page.js");
  assert.match(post, /import \{ renderMarkdown, PROSE \} from "@\/lib\/markdown"/);
  assert.doesNotMatch(strip(post), /const PROSE =\s*$/m,
    "the announcement page must not keep its own copy");
});

test("the open is recorded from the browser, never on load", () => {
  // the page renders nothing that records
  assert.doesNotMatch(signPage, /recordAnnouncementAck/);
  // the action exists, and it is the client that calls it
  assert.match(signActions, /export async function recordOpenedByToken/);
  assert.match(signPage, /onOpened=\{recordOpenedByToken\.bind\(null, token\)\}/);
  assert.match(filler, /Promise\.resolve\(onOpened\(\)\)\.catch\(\(\) => \{\}\)/,
    "a failed open must never cost a signature");
  assert.match(filler, /if \(onOpened && !openedRef\.current\)/, "once per mount");
});

test("the open action refuses anything that is not a live form post", () => {
  // every guard, so a token for a deleted post or a closed account records nothing
  assert.match(signActions, /if \(!post \|\| post\.deletedAt \|\| !post\.requireAck \|\| !post\.formId\) return \{ ok: false \}/);
  assert.match(signActions, /if \(!user \|\| user\.deactivatedAt\) return \{ ok: false \}/);
  assert.match(signActions, /if \(!parsed\) return \{ ok: false \}/);
});
