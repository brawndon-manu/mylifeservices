// WHO A CLIENT'S PAPERWORK GOES TO - Mánu 2026-09-12: "client with no staff
// should get option to assign to staff but for this we can give them to a
// supervisor too."
//
// The order is the thing being pinned. A hand-set value must beat the roster,
// because the roster is a monthly re-export with 105 of 274 Case Worker cells
// blank, and it replaces the whole Client table every time. Fall back the
// other way and a re-export silently overwrites an answer somebody gave.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  resolveRouting, routingGaps, isEmptyRouting, byClientKey, supervisorOf,
} from "../routing.js";

const sup = { id: "s1", name: "B. Rotter" };
const sup2 = { id: "s2", name: "Aaron Jones" };
const staffWithSup = { id: "u1", name: "Casey Lewis", supervisor: sup };
const staffNoSup = { id: "u2", name: "Morgan McCulley", supervisor: null };

test("the roster answers when nobody has said otherwise", () => {
  const r = resolveRouting({ client: { staffUser: staffWithSup } });
  assert.equal(r.staffUser.id, "u1");
  assert.equal(r.staffFrom, "roster");
  assert.equal(r.supervisor.id, "s1");
  assert.equal(r.supervisorFrom, "staff", "the supervisor came from the staff member");
});

test("a hand-set staff member beats the roster", () => {
  const r = resolveRouting({
    routing: { staffUser: staffNoSup },
    client: { staffUser: staffWithSup },
  });
  assert.equal(r.staffUser.id, "u2", "the typed one wins");
  assert.equal(r.staffFrom, "manual");
  // and the supervisor follows the staff member who actually won
  assert.equal(r.supervisor, null);
});

test("a hand-set supervisor beats the one the staff member implies", () => {
  const r = resolveRouting({
    routing: { supervisor: sup2 },
    client: { staffUser: staffWithSup },
  });
  assert.equal(r.staffUser.id, "u1", "the roster still supplies the staff");
  assert.equal(r.supervisor.id, "s2", "but not the supervisor");
  assert.equal(r.supervisorFrom, "manual");
});

test("a client with no staff can still reach a supervisor", () => {
  // the case the whole thing is for: 233 of 239 on the September month
  // resolved to nobody and were skipped by every send
  const r = resolveRouting({ routing: { supervisor: sup }, client: { staffUser: null } });
  assert.equal(r.staffUser, null);
  assert.equal(r.supervisor.id, "s1");
  const g = routingGaps(r);
  assert.equal(g.noStaff, true);
  assert.equal(g.noSupervisor, false);
  assert.equal(g.unroutable, false, "it can be sent to");
});

test("a client with nothing anywhere is unroutable, and says so", () => {
  const r = resolveRouting({});
  assert.deepEqual(routingGaps(r), { noStaff: true, noSupervisor: true, unroutable: true });
  const r2 = resolveRouting({ client: { staffUser: staffNoSup } });
  assert.deepEqual(routingGaps(r2), { noStaff: false, noSupervisor: true, unroutable: false });
});

test("an empty assignment is not an assignment", () => {
  assert.equal(isEmptyRouting({}), true);
  assert.equal(isEmptyRouting({ staffUserId: null, supervisorUserId: null }), true);
  assert.equal(isEmptyRouting({ staffUserId: "u1" }), false);
  assert.equal(isEmptyRouting({ supervisorUserId: "s1" }), false);
});

test("routings index by the key that survives a roster import", () => {
  const m = byClientKey([{ clientKey: "acuna jacob" }, { clientKey: "lewis casey" }]);
  assert.equal(m.size, 2);
  assert.equal(m.get("acuna jacob").clientKey, "acuna jacob");
  assert.equal(byClientKey(null).size, 0);
});

test("the table is keyed so a roster import cannot wipe it", () => {
  // uploadClientRoster does client.deleteMany({}) then createMany - anything
  // on Client is destroyed by the next export HR sends
  const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
  const model = schema.slice(schema.indexOf("model ClientRouting"));
  const body = model.slice(0, model.indexOf("\n}"));
  assert.match(body, /clientKey String @id/, "keyed by clientKey, not Client.id");
  assert.doesNotMatch(body, /references: \[id\]\)\s*\/\/ Client/, "no link to the Client row itself");
  const sql = fs.readFileSync("prisma/migrations/20260912030000_client_routing/migration.sql", "utf8");
  assert.match(sql, /CREATE TABLE "ClientRouting"/);
  assert.doesNotMatch(sql, /DROP|ALTER TABLE "(?!ClientRouting)/, "nothing existing is touched");
  const actions = fs.readFileSync("src/app/portal/admin/client-attestations/actions.js", "utf8");
  assert.match(actions, /client\.deleteMany\(\{\}\)/, "the import still wipes Client, which is why the above matters");

  // WHAT THIS IS GUARDING is a routing wiped WHOLESALE. setClientRouting
  // deletes one clientKey on purpose - clearing both fields is how somebody
  // says "nobody is assigned", and a row that says nothing should not look
  // like one that does. So the ban is on an unscoped delete, not on the word.
  const unscoped = actions.match(/clientRouting\.deleteMany\(\s*\{\s*\}\s*\)/);
  assert.equal(unscoped, null, "no routing delete without a where");
  for (const m of actions.matchAll(/clientRouting\.deleteMany\(([^)]*)\)/g)) {
    assert.match(m[1], /where:\s*\{\s*clientKey/, "a routing delete names the one client it is for");
  }
  // and the roster import must not touch them at all
  const importFn = actions.slice(
    actions.indexOf("export async function uploadClientRoster"),
    actions.indexOf("export async function setStaffSupervisor"),
  );
  assert.ok(importFn.length > 200, "found the roster import");
  assert.doesNotMatch(importFn, /clientRouting/, "the roster import never touches a routing");
});

test("the picker is on the screen, and reaches the action", () => {
  const page = fs.readFileSync("src/app/portal/admin/client-attestations/[id]/page.js", "utf8");
  assert.match(page, /setClientRouting/, "the page calls the routing action");
  assert.match(page, /function RoutePick/, "the picker exists");
  // A FORM CANNOT WRAP TABLE CELLS. The selects sit in their own columns and
  // join the form by id, so one submit sends staff and supervisor together.
  assert.match(page, /<form id=\{`route-\$\{a\.id\}`\} action=\{setClientRouting\} \/>/);
  for (const field of ["clientKey", "clientName"]) {
    assert.match(page, new RegExp(`name="${field}"[^>]*form=`), `${field} rides the form by id`);
  }
  assert.match(page, /name="staffUserId"/, "staff can be assigned");
  assert.match(page, /name="supervisorUserId"/, "so can a supervisor, on its own");
});

test("an assignment already made is carried, not dropped", () => {
  // setClientRouting writes BOTH fields, so a row that already has a staff
  // member must send it back or assigning a supervisor would clear the staff
  const page = fs.readFileSync("src/app/portal/admin/client-attestations/[id]/page.js", "utf8");
  assert.match(page, /a\.staffUser && \(\s*<input type="hidden" name="staffUserId"/);
  assert.match(page, /a\.supervisor && \(\s*<input type="hidden" name="supervisorUserId"/);
});

test("the long list is only drawn where it is needed", () => {
  // 98 active accounts against 233 rows with no supervisor. A select in every
  // column of every row is 25,000 options on one page; only 22 rows have no
  // staff, so the long list is drawn 22 times and the short one 233 times.
  const page = fs.readFileSync("src/app/portal/admin/client-attestations/[id]/page.js", "utf8");
  const staffCell = page.slice(page.indexOf("{a.staffUser ? ("), page.indexOf("{a.entryCount}"));
  assert.match(staffCell, /choices=\{staffChoices\}/, "the staff list is in the staff cell");
  assert.match(staffCell, /a\.staffUser \?/, "and only when nobody is assigned");
  const supCell = page.slice(page.indexOf("{supFor.get(a.id).supervisor ? ("), page.indexOf("{a.sentAt ?"));
  assert.ok(supCell.length > 100, "found the supervisor cell");
  assert.match(supCell, /choices=\{supervisorChoices\}/);
  // a signed month is settled - its routing is part of what was agreed
  assert.match(staffCell, /a\.signedAt \?/, "a signed row is never re-routed");
  assert.match(supCell, /a\.signedAt \?/);
});

test("both screens offer the same supervisors", () => {
  // one screen offering somebody the other refuses is how a routing gets set
  // that the caseloads page then cannot explain
  const page = fs.readFileSync("src/app/portal/admin/client-attestations/[id]/page.js", "utf8");
  const caseloads = fs.readFileSync("src/app/portal/admin/client-attestations/caseloads/page.js", "utf8");
  for (const src of [page, caseloads]) {
    assert.match(src, /titleHasSegment\(u\.title, "Field Supervisor"\)/, "the same definition");
  }
});

test("a field supervisor attests their own clients", () => {
  // Mánu 2026-09-12, asked rather than assumed: 56 of the September rows are
  // staffed by one of the 7 supervisors and had nobody to send to.
  const isFieldSupervisor = (u) => u?.title === "Field Supervisor";
  const boss = { id: "s1", name: "B. Rotter", title: "Field Supervisor" };
  const ili = { id: "u1", name: "Casey Lewis", title: "Independent Living Instructor" };

  const own = supervisorOf({ supervisor: null, staffUser: boss, isFieldSupervisor });
  assert.equal(own.supervisor, boss);
  assert.equal(own.from, "self", "the screen can say why");

  // an ordinary staff member still needs one
  assert.deepEqual(supervisorOf({ supervisor: null, staffUser: ili, isFieldSupervisor }),
    { supervisor: null, from: null });

  // a supervisor somebody typed always wins, even over a supervisor staffing
  // their own client
  const set = supervisorOf({ supervisor: { id: "s2" }, staffUser: boss, isFieldSupervisor });
  assert.equal(set.supervisor.id, "s2");
  assert.equal(set.from, "set");

  assert.deepEqual(supervisorOf(), { supervisor: null, from: null });
});

test("nothing stores the self-supervision, it is read where it is needed", () => {
  // the rows already exist with an empty column; storing the rule would mean
  // backfilling 56 and remembering it on every future upload
  const actions = fs.readFileSync("src/app/portal/admin/client-attestations/actions.js", "utf8");
  assert.match(actions, /supervisorOf\(\{/, "the send reads the rule");
  assert.match(actions, /title: true/, "and selects the title it needs to");
  const upload = actions.slice(
    actions.indexOf("export async function uploadClientSchedules"),
    actions.indexOf("export async function setClientRouting"),
  );
  assert.ok(upload.length > 500, "found the upload");
  assert.doesNotMatch(upload, /supervisorOf/, "the upload stores nothing derived");
});

test("the screen counts and shows the same supervisor", () => {
  // a screen that counts one thing and shows another is worse than either
  const page = fs.readFileSync("src/app/portal/admin/client-attestations/[id]/page.js", "utf8");
  assert.match(page, /const supFor = new Map\(/, "read once");
  for (const use of [
    /unrouted: rows\.filter\(\(a\) => !supFor\.get\(a\.id\)\.supervisor\)/,
    /supervisor: set\.filter\(\(a\) => supFor\.get\(a\.id\)\.supervisor\)/,
    /\? rows\.filter\(\(a\) => !supFor\.get\(a\.id\)\.supervisor\)/,
  ]) assert.match(page, use, "the counts and the filter read it");
  assert.doesNotMatch(page, /!a\.supervisorUserId/, "nothing reads the raw column any more");
});
