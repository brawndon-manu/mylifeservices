// TWO DEVICES, NOT ONE PHONE PASSED ACROSS: the code the person served scans,
// the day it lives, the words under each signature saying what it was signed
// on, and the pins that keep the client-only route honest.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CODE_ALPHABET, CODE_LENGTH, codeFromBytes, formatCode, normalizeCode, codeExpiry, codeExpired } from "../clock-amendment/client-code.js";
import { deviceLabel, viaLine, deviceTail } from "../clock-amendment/device.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("a code is eight letters from an alphabet with no look-alikes, shown with a dash and looked up without one", () => {
  assert.doesNotMatch(CODE_ALPHABET, /[01OIL]/);
  const code = codeFromBytes(Uint8Array.from({ length: CODE_LENGTH }, (_, i) => i * 37 + 5));
  assert.equal(code.length, CODE_LENGTH);
  for (const ch of code) assert.ok(CODE_ALPHABET.includes(ch), ch);
  assert.equal(formatCode("7KQ42MZD"), "7KQ4-2MZD");
  assert.equal(normalizeCode(" 7kq4-2mzd "), "7KQ42MZD");
  assert.equal(normalizeCode("7KQ4 2MZD"), "7KQ42MZD");
  assert.equal(normalizeCode(null), "");
});

test("a code lives until the end of the California day it was minted in, whatever the server's clock", () => {
  // 7:20 PM on 09/22 in California is 02:20Z on 09/23; the day ends 06:59:59.999Z
  assert.equal(codeExpiry(new Date("2026-09-23T02:20:00.000Z")).toISOString(), "2026-09-23T06:59:59.999Z");
  // a minute into 09/23 California
  assert.equal(codeExpiry(new Date("2026-09-23T07:01:00.000Z")).toISOString(), "2026-09-24T06:59:59.999Z");
  // the milliseconds of the moment it was minted must not push it into the
  // next day: the rehearsal's first code landed 0.9 s past midnight
  assert.equal(codeExpiry(new Date("2026-09-23T05:46:48.874Z")).toISOString(), "2026-09-23T06:59:59.999Z");
  assert.equal(codeExpired("2026-09-23T06:59:59.999Z", new Date("2026-09-23T06:00:00.000Z")), false);
  assert.equal(codeExpired("2026-09-23T06:59:59.999Z", new Date("2026-09-23T07:00:00.000Z")), true);
  assert.equal(codeExpired(null), true);
});

test("the device line reads the browser and the kind of device, and says how the signature was collected", () => {
  assert.equal(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"), "Safari on iPhone");
  assert.equal(deviceLabel("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"), "Chrome on Android");
  assert.equal(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0"), "Edge on Windows");
  assert.equal(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1"), "Chrome on iPhone");
  assert.equal(deviceLabel(""), null);
  assert.equal(deviceLabel(null), null);
  assert.equal(viaLine("own"), "Signed on their own device");
  assert.equal(viaLine("staff"), "Signed on the staff member's phone");
  assert.equal(viaLine("email"), "Signed from an emailed link");
  assert.equal(viaLine(null), null);
  assert.equal(deviceTail("3f9c1d2e-77aa-4b1c-9d0e-abcdef123456"), "device …123456");
  assert.equal(deviceTail(""), null);
});

test("the client-only route is its own door: the code is the credential, the day is the limit, nobody absent signs there", () => {
  const actions = read("src/app/s/[code]/actions.js");
  assert.match(actions, /where: \{ clientCode: code \}/);
  assert.match(actions, /if \(codeExpired\(a\.clientCodeExpiresAt\)\) return \{ ok: false, error: "expired" \}/);
  assert.match(actions, /if \(!isSignerKind\(kind\) \|\| !signerIsPresent\(kind\)\) return \{ ok: false, error: "kind" \}/);
  assert.match(actions, /clientSignedVia: a\.clientLinkEmailedAt \? "email" : "own"/);
  assert.match(actions, /clientSignedUa: await callerUa\(\)/);
  assert.match(actions, /clientSignedDevice: deviceOf\(payload\)/);
  const page = read("src/app/s/[code]/page.js");
  assert.match(page, /if \(codeExpired\(a\.clientCodeExpiresAt\)\)/);
  assert.match(page, /if \(!a\.filledAt\) return <Note>/);
  // the gate lets the code through the same way it lets the form through
  assert.match(read("src/proxy.js"), /pathname\.startsWith\("\/s\/"\)/);
});

test("the staff half mints the code when it signs, and the hand-off says it was the staff member's phone", () => {
  const actions = read("src/app/ca/[token]/actions.js");
  assert.match(actions, /await mintClientCode\(a\.id\);\s*return \{ ok: true \};/);
  assert.match(actions, /clientSignedVia: "staff"/);
  assert.match(actions, /filledUa: await callerUa\(\),\s*filledDevice: deviceOf\(payload\)/);
  assert.match(actions, /export async function clientHalfStatus\(token\)/);
  assert.match(actions, /export async function refreshClientCode\(token\)/);
  assert.match(actions, /export async function emailClientLink\(token, email\)/);
  // the mail for a rehearsal goes to whoever raised it, nowhere else
  assert.match(actions, /forceTo: a\.testOnly \? a\.createdBy\?\.email \|\| null : null/);
  const sign = read("src/app/ca/[token]/AmendmentSign.js");
  assert.match(sign, /import ClientCode from "\.\/ClientCode"/);
  assert.match(sign, /if \(view\.clientStage === "waiting" && !handoff\)/);
  const codeUi = read("src/app/ca/[token]/ClientCode.js");
  assert.match(codeUi, /qrcode\(0, "H"\)/, "the logo over the middle needs the highest correction level");
  assert.match(codeUi, /src="\/icon-192\.png"/);
  assert.match(codeUi, /setInterval\(tick, 4000\)/);
});

test("the document prints how each signature was collected and on what", () => {
  const pdf = read("src/lib/clock-amendment/pdf.js");
  assert.match(pdf, /const deviceBits = \[viaLine\(via\), deviceLabel\(ua\), deviceTail\(device\)\]\.filter\(Boolean\);/);
  assert.match(pdf, /via: a\.clientSignedVia/);
  assert.match(pdf, /ua: a\.filledUa, device: a\.filledDevice/);
  const admin = read("src/app/portal/admin/clock-amendments/[id]/page.js");
  assert.match(admin, /viaLine\(a\.clientSignedVia\)/);
});

// ---- a rehearsal aimed at anyone, and run again ----

test("a rehearsal can be sent to a chosen person for real and reset for the next; a real amendment can be neither", () => {
  const actions = read("src/app/portal/admin/clock-amendments/[id]/actions.js");
  assert.match(actions, /export async function sendRehearsalTo\(id, payload\)/);
  assert.match(actions, /export async function resetRehearsal\(id\)/);
  // both refuse anything that is not a rehearsal, before touching a thing,
  // the same way the delete does: three doors, one guard
  assert.equal((actions.match(/if \(!a\.testOnly\) return \{ ok: false, error: "real" \}/g) || []).length, 3);
  // the send reaches the chosen address rather than the raiser's inbox
  assert.match(actions, /intendedEmail,\s*\/\/ the point of a demo is that it reaches the person being shown it\s*forceTo: null,/);
  // a roster person becomes the recipient, so they sign as themselves
  assert.match(actions, /\.\.\.\(recipient \? \{ recipientId: recipient\.id \} : \{\}\)/);
  // the reset clears the code and every signed field, and keeps the intake
  for (const f of ["clientCode: null", "clientCodeExpiresAt: null", "filledAt: null", "clientSignedAt: null", "clientSignedVia: null", "approvedAt: null", "pdfUrl: null", "chaseCount: 0"]) assert.match(actions, new RegExp(f), f);
  assert.doesNotMatch(actions.slice(actions.indexOf("export async function resetRehearsal")), /intakeReasonText: null|dsnPdfUrl: null|note: null/);
  const form = read("src/app/portal/admin/clock-amendments/[id]/ApproveForm.js");
  assert.match(form, /sendTo\(id, \{ recipientId: pick\?\.id \|\| "", email: pick \? "" : email\.trim\(\) \}\)/);
  assert.match(form, /Reset the rehearsal/);
  const page = read("src/app/portal/admin/clock-amendments/[id]/page.js");
  assert.match(page, /sendTo=\{sendRehearsalTo\}\s*reset=\{resetRehearsal\}/);
});
