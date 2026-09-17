// THE BULK APPROVALS PAGE, AND THE FOUR THINGS IT MUST NEVER OFFER.
//
// It exists to stamp one signature onto many sheets, so every guard it has is
// the difference between saving fifty one repetitions and signing something
// nobody looked at. Each rule here is pinned because the page's whole value is
// that a single press is safe.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const page = strip(read("src/app/portal/admin/timesheets/approvals/page.js"));
const list = strip(read("src/app/portal/admin/timesheets/approvals/ApprovalsList.js"));
const actions = strip(read("src/app/portal/admin/timesheets/actions.js"));

test("only timesheet managers reach it", () => {
  assert.match(page, /if \(!canManageTimesheets\(user\?\.role\)\) redirect\("\/portal"\)/);
});

test("it never lists a sheet the employee has not signed", () => {
  assert.match(page, /signedAt: \{ not: null \}/);
  assert.match(page, /approvedAt: null/);
  // and the action refuses one anyway, which is the guard that actually holds
  assert.match(actions, /if \(!ts\.signedAt\) return \{ ok: false, error: "notsigned" \}/);
});

test("the approver's own sheet is listed, and never ticked for them", () => {
  // His word: leave it in so a colleague can sign it off. The safety is that it
  // cannot start ticked for the person it belongs to, so a press aimed at a
  // fortnight never approves the presser's own timesheet on the way past.
  assert.ok(
    !/NOT: \{ userId: user\.id \}/.test(page),
    "own sheets are listed now, not filtered out",
  );
  assert.match(page, /mine: !!t\.userId && t\.userId === user\.id/);
  assert.match(list, /all\.filter\(\(r\) => r\.current && !r\.mine\)/);
});

test("it never lists a sheet on a replaced upload", () => {
  // approveTimesheet has no superseded guard of its own, so this one has to be
  // here or a bulk press could approve a batch that was re-uploaded
  assert.match(page, /import \{ supersededBy \} from "@\/lib\/timesheet\/superseded"/);
  assert.match(page, /if \(await supersededBy\(id\)\) replaced\.add\(id\)/);
  assert.match(page, /\.filter\(\(t\) => !replaced\.has\(t\.batchId\)\)/);

  const approve = actions.slice(actions.indexOf("export async function approveTimesheet"));
  const body = approve.slice(0, approve.indexOf("\nexport "));
  assert.ok(!/superseded/i.test(body), "if the action grows its own guard, this note is stale");
});

test("it never lists a sheet with no file to stamp", () => {
  assert.match(page, /\.filter\(\(t\) => !!\(t\.signedPdfUrl \|\| t\.pdfUrl\)\)/);
});

test("only the period being worked starts ticked", () => {
  // 64 sheets from an earlier period are signed and unapproved on batches that
  // were never superseded. They belong on the page and must not be swept up by
  // a press aimed at this fortnight.
  assert.match(page, /current: currentBatch\.get\(t\.batch\.program \|\| "MLS"\) === t\.batchId/);
  // the default selection is the current period, minus the viewer's own row
  assert.match(list, /new Set\(all\.filter\(\(r\) => r\.current && !r\.mine\)\.map\(\(r\) => r\.id\)\)/);
});

test("the signature is drawn for the run and never stored", () => {
  // held in component state, passed to the action, and nowhere else
  assert.match(list, /const \[signature, setSignature\] = useState\(null\)/);
  assert.match(list, /approve\(\{ timesheetId: r\.id, signatureDataUrl: signature \}\)/);
  assert.ok(!/localStorage|sessionStorage|indexedDB/i.test(list), "a signature must not be persisted");
  assert.ok(!/signatureDataUrl/.test(page), "the server page never handles the signature");
});

test("one request per sheet, and a failure is named rather than swallowed", () => {
  // the existing action is called per sheet, so every guard it has applies
  // unchanged and one bad sheet cannot lose the rest
  assert.match(list, /const AT_ONCE = \d+/);
  assert.match(list, /state\.failed\.push\(\{ name: r\.name, error: res\?\.error \|\| "unknown" \}\)/);
  // a throw is a failure too, not a silent skip
  assert.match(list, /catch \{\s*res = \{ ok: false, error: "threw" \};/);
  // and what failed stays ticked so a second press retries exactly it
  assert.match(list, /setPicked\(new Set\(chosen\.filter\(\(r\) => failedNames\.has\(r\.name\)\)/);
});
