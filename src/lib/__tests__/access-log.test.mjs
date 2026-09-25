// WHAT THE ACCESS LOG SAYS, AND WHOSE FORMS A FIELD SUPERVISOR SEES.
//
// the labels are unit tests: a line has to say what it was about in words, and
// fall back to the kind of record when it has no label. the supervisor half
// runs the real rule over the row shapes the screens use, then reads the desk's
// routes and actions to hold the office's side shut.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { accessLabel, kindOfTarget, lineLabel } from "../access-labels.js";
import { attestationIsTheirs } from "../client-attestations/routing.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("a label is the parts that are there, joined", () => {
  assert.equal(accessLabel("Signed timesheet", "Ana Rivera", "Sep 1 – 15, 2026"), "Signed timesheet · Ana Rivera · Sep 1 – 15, 2026");
  assert.equal(accessLabel("Audit client report", "Aug 16 – 31, 2026", false && "detailed"), "Audit client report · Aug 16 – 31, 2026");
  assert.equal(accessLabel("Payroll workbook", null, undefined, "", "  "), "Payroll workbook");
  assert.equal(accessLabel(), "");
});

test("a line with no label still says what kind of record it was", () => {
  assert.equal(kindOfTarget("timesheets/signed/5f18.pdf"), "Signed timesheet");
  assert.equal(kindOfTarget("timesheets/approved/4dbf.pdf"), "Approved timesheet");
  assert.equal(kindOfTarget("timesheets/source/a.pdf"), "QSP export");
  assert.equal(kindOfTarget("timesheets/cmu1/download-zip"), "Timesheet batch");
  assert.equal(kindOfTarget("timesheets/sheet/cmu2/report"), "Hours and penalties report");
  assert.equal(kindOfTarget("clock-amendments/cmu3/dsn.pdf"), "Addendum service notes");
  assert.equal(kindOfTarget("clock-amendments/cmu3/a1-client-signature.png"), "Addendum signature");
  assert.equal(kindOfTarget("client-attestations/signed/9c0e.pdf"), "Signed client attestation");
  assert.equal(kindOfTarget("client-attestations/cmu4/download-pdf"), "Client attestations");
  assert.equal(kindOfTarget("form-submissions/b2bd.pdf"), "Signed form");
  assert.equal(kindOfTarget("form-email-imports/acks/3b34.pdf"), "Emailed acknowledgment");
  assert.equal(kindOfTarget("certificates/templates/t.pdf"), "Certificate template");
  assert.equal(kindOfTarget("applications/r.pdf"), "Application résumé");
  assert.equal(kindOfTarget("somewhere/else"), "Record");
  assert.equal(lineLabel({ label: "Payout CSV · Sep 1 – 15, 2026", target: "timesheets/x/report.csv" }), "Payout CSV · Sep 1 – 15, 2026");
  assert.equal(lineLabel({ label: null, target: "form-submissions/b2bd.pdf" }), "Signed form");
});

test("a field supervisor's own forms are the ones the Supervisor column gives them", () => {
  const me = "u-me";
  const fs_ = (u) => u?.title === "Field Supervisor";
  const meStaff = { id: me, title: "Field Supervisor" };
  // set to them
  assert.equal(attestationIsTheirs({ supervisor: { id: me }, staffUser: { id: "s1" } }, me, fs_), true);
  // set to somebody else, even on a client they staff
  assert.equal(attestationIsTheirs({ supervisor: { id: "u-other" }, staffUser: meStaff }, me, fs_), false);
  // nobody set, and they staff the client themselves
  assert.equal(attestationIsTheirs({ supervisor: null, staffUser: meStaff }, me, fs_), true);
  // nobody set, they staff it, but they are not a field supervisor by title
  assert.equal(attestationIsTheirs({ supervisor: null, staffUser: { id: me, title: "DSP" } }, me, fs_), false);
  // nobody set, somebody else's client
  assert.equal(attestationIsTheirs({ supervisor: null, staffUser: { id: "s2", title: "Field Supervisor" } }, me, fs_), false);
  assert.equal(attestationIsTheirs(null, me, fs_), false);
  assert.equal(attestationIsTheirs({ supervisor: { id: me } }, null, fs_), false);
});

test("what carries every client stays with the office", () => {
  const dir = "src/app/portal/admin/client-attestations/[id]/";
  for (const f of ["source/route.js", "download/route.js", "download-pdf/route.js"]) {
    assert.match(read(dir + f), /requireAttestationAccess\(\{ wholeMonth: true \}\)/, f);
  }
  // one form: the office, or the supervisor it is assigned to
  const one = read(dir + "form/[attestationId]/route.js");
  assert.match(one, /if \(!office && !attestationIsTheirs\(row, user\.id, isFieldSupervisor\)\) \{/);
  // uploads, routing, the roster, sending the month and deleting it are the office's
  const actions = read("src/app/portal/admin/client-attestations/actions.js");
  for (const fn of ["uploadClientSchedules", "setClientRouting", "setAttestationSupervisor", "deleteAttestationBatch", "uploadClientRoster", "setStaffSupervisor", "sendAttestations"]) {
    const body = actions.slice(actions.indexOf(`export async function ${fn}(`));
    assert.match(body.slice(0, 200), /await requireOffice\(\);/, fn);
  }
  // sending one form and filing a paper copy check the row
  for (const fn of ["sendAttestationOne", "recordPaperSignature"]) {
    const body = actions.slice(actions.indexOf(`export async function ${fn}(`));
    assert.match(body.slice(0, 400), /attestationOpenTo\(user, canSeeEveryAttestation\(user\.role\), attestationId\)/, fn);
  }
  // the screens ask for the supervisor's rows only
  for (const f of ["src/app/portal/admin/client-attestations/page.js", "src/app/portal/admin/client-attestations/[id]/page.js"]) {
    assert.match(read(f), /where: attestationScope\(user, office\)/, f);
  }
  // and the office's own screens stay the office's
  for (const f of [
    "src/app/portal/admin/client-attestations/caseloads/page.js",
    "src/app/portal/admin/client-attestations/[id]/caseloads/page.js",
    "src/app/portal/admin/client-attestations/new/page.js",
  ]) {
    assert.match(read(f), /if \(!canSeeEveryAttestation\(user\?\.role\)\)/, f);
  }
});

test("a refusal is written down for somebody signed in, never for nobody", () => {
  const log = read("src/lib/file-log.js");
  assert.match(log, /export async function logFileDenied\(\{ user, pathname, req, label = null \}\) \{\s+if \(!user\) return;/);
});
