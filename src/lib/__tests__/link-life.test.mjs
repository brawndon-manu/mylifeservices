// EMAILED LINKS DON'T LIVE FOREVER. a link stops 30 days after its task last
// moved, and at once for a deactivated account; analytics never records a key;
// and what a person signed stays theirs to open in My documents.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { LINK_DAYS, withinWindow } from "../link-window.js";
import { redactPath, redactUrl } from "../analytics-redact.js";
import { periodRange, shortDay } from "../document-dates.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const DAY = 24 * 60 * 60 * 1000;

test("a link stays open for 30 days after the newest date on its record, then closes", () => {
  const now = Date.parse("2026-09-24T12:00:00Z");
  assert.equal(LINK_DAYS, 30);
  assert.equal(withinWindow([new Date(now - 29 * DAY)], now), true);
  assert.equal(withinWindow([new Date(now - 31 * DAY)], now), false);
  // a resend or a reminder is the newest date, and it wins
  assert.equal(withinWindow([new Date(now - 90 * DAY), new Date(now - 2 * DAY)], now), true);
  // exactly on the edge is still open
  assert.equal(withinWindow([new Date(now - 30 * DAY)], now), true);
  // nothing to count from: open, and nulls are ignored
  assert.equal(withinWindow([], now), true);
  assert.equal(withinWindow([null, undefined], now), true);
  assert.equal(withinWindow([null, new Date(now - 45 * DAY)], now), false);
});

test("analytics gets the kind of page, never the key in the link or the query", () => {
  assert.equal(redactPath("/t/abc.def"), "/t/[link]");
  assert.equal(redactPath("/t/abc.def/pdf"), "/t/[link]/pdf");
  assert.equal(redactPath("/ca/abc.def"), "/ca/[link]");
  assert.equal(redactPath("/s/ABCD2345"), "/s/[code]");
  assert.equal(redactPath("/a/sign/abc.def"), "/a/sign/[link]");
  assert.equal(redactPath("/a/schedule/abc.def/pdf"), "/a/schedule/[link]/pdf");
  assert.equal(redactPath("/a/doc/abc.def/2"), "/a/doc/[link]/2");
  assert.equal(redactPath("/f/some-share-slug"), "/f/[form]");
  assert.equal(redactPath("/c/cmpngyt2x"), "/c/[card]");
  assert.equal(redactPath("/portal/files/timesheets/signed/x.pdf"), "/portal/files/[file]");
  // ordinary pages are left alone
  assert.equal(redactPath("/portal/hub"), "/portal/hub");
  assert.equal(redactPath("/about"), "/about");
  // the query string never goes
  assert.equal(
    redactUrl("https://www.mylifeservicesinc.com/login?callbackUrl=%2Fportal%2Ffiles%2Ftimesheets%2Fx.pdf"),
    "https://www.mylifeservicesinc.com/login",
  );
  assert.equal(redactUrl("https://www.mylifeservicesinc.com/t/abc.def?preview=1"), "https://www.mylifeservicesinc.com/t/[link]");
  assert.equal(redactUrl("not a url"), "");
});

test("My documents writes a pay period and a day the way people say them", () => {
  assert.equal(periodRange("09/01/26", "09/15/26"), "Sep 1 – 15, 2026");
  assert.equal(periodRange("08/16/26", "09/01/26"), "Aug 16 – Sep 1, 2026");
  assert.equal(periodRange("12/16/26", "01/01/27"), "Dec 16, 2026 – Jan 1, 2027");
  assert.equal(periodRange("weird", "09/15/26"), "weird to 09/15/26");
  const now = new Date("2026-09-24T12:00:00Z");
  assert.equal(shortDay("2026-09-16T20:00:00Z", now), "Sep 16");
  // late evening Pacific is still that day in Pacific
  assert.equal(shortDay("2026-09-17T03:00:00Z", now), "Sep 16");
  assert.equal(shortDay("2026-08-03", now), "Aug 3");
  assert.equal(shortDay("2025-12-02", now), "Dec 2, 2025");
  assert.equal(shortDay(null, now), "");
});

// ---------------------------------------------------------------- guards

function sourceFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(process.cwd(), dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "generated") continue;
      out.push(...sourceFiles(rel));
    } else if (/\.js$/.test(e.name)) out.push(rel);
  }
  return out;
}
const SRC = sourceFiles("src");

test("every place that opens an emailed link asks whether it is still open", () => {
  const pairs = [
    ["verifyTimesheetToken(", "timesheetLinkOpen("],
    ["verifyAmendmentToken(", "amendmentLinkOpen("],
    ["verifyAttestationToken(", "attestationLinkOpen("],
    ["verifyAckToken(", "announcementLinkOpen("],
    ["verifyRsvpToken(", "announcementLinkOpen("],
  ];
  const missing = [];
  for (const f of SRC) {
    const src = read(f);
    for (const [verify, open] of pairs) {
      // the token modules themselves define the verifier
      if (src.includes(`export function ${verify.slice(0, -1)}`)) continue;
      const calls = src.split(verify).length - 1;
      const checks = src.split(open).length - 1;
      if (calls && checks < calls) missing.push(`${f} (${verify.slice(0, -1)} ${calls}, ${open.slice(0, -1)} ${checks})`);
    }
  }
  assert.deepEqual(missing, [], `these open a link without the 30-day / deactivation check: ${missing.join("; ")}`);
});

test("analytics only ever runs through the redacting wrapper", () => {
  assert.match(read("src/app/layout.js"), /<SafeAnalytics \/>/);
  const direct = SRC.filter((f) => f !== "src/components/SafeAnalytics.js" && /from "@vercel\/analytics/.test(read(f)));
  assert.deepEqual(direct, [], `analytics imported outside SafeAnalytics: ${direct.join(", ")}`);
  assert.match(read("src/components/SafeAnalytics.js"), /beforeSend=\{\(event\) => \(\{ \.\.\.event, url: redactUrl\(event\.url\) \}\)\}/);
});

test("a document in My documents opens for its owner only", () => {
  const route = read("src/app/portal/documents/[kind]/[id]/route.js");
  assert.match(route, /if \(!doc \|\| !doc\.owner \|\| doc\.owner !== user\.id\) \{/);
  assert.match(route, /action: "denied"/);
  const page = read("src/app/portal/documents/page.js");
  assert.match(page, /href=\{`\/portal\/documents\/\$\{r\.kind\}\/\$\{r\.id\}`\}/);
  // the office's own tests never show up as somebody's record
  assert.match(page, /batch: \{ testOnly: false \}/);
  assert.match(page, /approvedAt: \{ not: null \}, testOnly: false/);
  // and the sidebar has it
  assert.match(read("src/app/portal/_components/PortalSidebar.js"), /\{ href: "\/portal\/documents", label: "My documents", icon: FolderOpen \}/);
});
