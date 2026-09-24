// NO EMAIL CARRIES A PERSON SERVED'S RECORD. the attestation, the addendum and
// the incident report go out as links; the person served is named by initials
// only; a signed timesheet - whose printed notes name clients - is a link too.
//
// the initials are a unit test. the rest are guards that read the senders,
// because the way this breaks is a sender that picks its attachment back up or
// drops a full name into a subject line, and nothing fails when it does.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { clientInitials } from "../initials.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("a person served comes out as initials, however the name was written", () => {
  assert.equal(clientInitials("James Caviar"), "J.C.");
  assert.equal(clientInitials("CAVIAR, JAMES"), "J.C.");
  assert.equal(clientInitials("Caviar, James Robert"), "J.C.");
  assert.equal(clientInitials("Mary Ann Smith"), "M.S.");
  assert.equal(clientInitials("Jacob Mc Carter Jr."), "J.C.");
  assert.equal(clientInitials("MC CARTER JR., JACOB"), "J.C.");
  assert.equal(clientInitials("Ana Hernandez-Nieves"), "A.H.");
  assert.equal(clientInitials("Cher"), "C.");
  assert.equal(clientInitials("james caviar; mary smith"), "J.C. & M.S.");
  assert.equal(clientInitials("  "), "");
  assert.equal(clientInitials(null), "");
  // accented letters stay letters
  assert.equal(clientInitials("Élodie Ñúñez"), "É.Ñ.");
});

const NO_PDF = [
  ["src/lib/client-attestations/send.js", "the schedule attestation"],
  ["src/lib/clock-amendment/email.js", "the addendum emails"],
  ["src/lib/timesheet-signed-email.js", "the employee's signed copy"],
  ["src/lib/timesheet-review-email.js", "the office's corrections"],
];

test("the attestation, addendum and timesheet emails attach nothing", () => {
  for (const [file, what] of NO_PDF) {
    assert.ok(!/\battachments:/.test(read(file)), `${what} (${file}) puts an attachment back on the email`);
  }
});

test("a form about a person served is stored first and goes out as a link", () => {
  // the incident report is one
  assert.match(read("src/lib/forms.js"), /cc: \[\{ name: "Jessica Zermeno", email: "mls\.jessicazermeno@gmail\.com" \}\],\s*clientRecord: true,/);
  // the sender drops the pdf and the note when it has a link
  const send = read("src/lib/form-send.js");
  assert.match(send, /attachments: link \? undefined :/);
  assert.match(send, /const note = link \? "" :/);
  // all three doors branch to the store-first path
  for (const door of ["src/app/portal/forms/actions.js", "src/app/f/[slug]/actions.js", "src/app/a/sign/[token]/actions.js"]) {
    const src = read(door);
    assert.match(src, /if \(route\.clientRecord\) \{/, door);
    assert.match(src, /deliverClientRecordForm\(\{/, door);
    assert.ok(src.indexOf("route.clientRecord") < src.indexOf("await sendFilledForm(send)"), `${door} sends before it branches`);
  }
  // store first; a copy that could not be stored is no submission
  const deliver = read("src/lib/form-deliver.js");
  assert.ok(deliver.indexOf("storeFormSubmission(") < deliver.indexOf("sendFilledForm("));
  assert.match(deliver, /if \(!stored\) return \{ ok: false, error: "store" \};/);
  assert.match(deliver, /message: null,/);
});

test("the link opens only for its recipients, its sender and the form-records roles", () => {
  const route = read("src/app/portal/forms/submissions/[id]/route.js");
  assert.match(route, /canViewFormRecords\(user\.role\) \|\|/);
  assert.match(route, /\(!!sub\.userId && sub\.userId === user\.id\) \|\|/);
  assert.match(route, /\(sub\.sentTo \|\| \[\]\)\.some\(\(e\) => String\(e\)\.toLowerCase\(\) === mine\)/);
  assert.match(route, /action: "denied"/);
});

test("the person served is named by initials in every subject and body", () => {
  const att = read("src/lib/client-attestations/send.js");
  assert.ok(!/\$\{esc\(clientName\)\}/.test(att), "the attestation body prints the full name");
  assert.match(att, /: `\$\{who\} - \$\{monthLabel\} schedule attestation`;/);
  const ca = read("src/lib/clock-amendment/email.js");
  assert.ok(!/\$\{esc\(clientName\)\}/.test(ca), "an addendum email body prints the full name");
  assert.ok(!/with \$\{clientName\}/.test(ca), "an addendum text version prints the full name");
  assert.match(ca, /clientSignSubject\(\{ staffName, clientName: initialsOf\(clientName\), date, redirectedFrom \}\)/);
});

test("the approved addendum links the office to its page and the staff member to their copy", () => {
  const office = read("src/app/portal/admin/clock-amendments/[id]/actions.js");
  assert.match(office, /officeLink: `\$\{base\}\/portal\/admin\/clock-amendments\/\$\{a\.id\}`,/);
  assert.match(office, /staffLink: `\$\{base\}\/ca\/\$\{signAmendmentToken\(a\.id\)\}\/pdf`,/);
  const copy = read("src/app/ca/[token]/pdf/route.js");
  assert.match(copy, /if \(!a \|\| !a\.approvedAt\) return new NextResponse\("Not found", \{ status: 404 \}\);/);
});

test("the employee's signed copy is a link to their own sheet, and the office's is the batch", () => {
  const sign = read("src/app/portal/admin/timesheets/actions.js");
  assert.match(sign, /link: `\$\{base\}\/t\/\$\{signTimesheetToken\(ts\.id\)\}\/pdf`,/);
  assert.ok(!/pdfBytes: Buffer\.from\(pdfBase64/.test(sign), "a timesheet email still gets the signed bytes");
});
