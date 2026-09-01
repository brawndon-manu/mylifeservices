// WHO SEES A TARGETED ANNOUNCEMENT. Mánu's question, 2026-09-02: an
// announcement aimed at the field supervisors should be visible to exactly
// them plus admin and up. canSeeAnnouncement is the one gate both the feed
// and the detail page run, so the rule is pinned here against the real title
// spellings on the roster ("Field Supervisor / Independent Living
// Instructor", "Field Supervisor / Lead Staff" - the title is segments joined
// by " / ", and targeting matches whole segments).
import { test } from "node:test";
import assert from "node:assert/strict";
import { canSeeAnnouncement } from "../../announcements.js";

const targeted = {
  tag: "Announcement",
  requireAck: true,
  ackEveryone: false,
  ackTitles: ["Field Supervisor"],
  ackUserIds: [],
  authorId: "author-1",
};

const see = (user) => canSeeAnnouncement(targeted, user);

test("a field supervisor sees it, under either real title spelling", () => {
  assert.equal(see({ id: "a", role: "SUPERVISOR", title: "Field Supervisor / Independent Living Instructor" }), true);
  assert.equal(see({ id: "b", role: "SUPERVISOR", title: "Field Supervisor / Lead Staff" }), true);
});

test("staff outside the audience do not, and segments protect near-titles", () => {
  assert.equal(see({ id: "c", role: "STAFF", title: "Independent Living Instructor" }), false);
  // a made-up compound that merely CONTAINS the words must not slip through
  assert.equal(see({ id: "d", role: "STAFF", title: "Assistant Field Supervisor" }), false);
});

test("admin and up always see it; HR, Manager and untargeted Supervisors do not", () => {
  for (const role of ["ADMIN", "IT_ADMIN", "SUPER"]) {
    assert.equal(see({ id: "e", role, title: "Whatever" }), true, role);
  }
  for (const role of ["HR", "MANAGER", "SUPERVISOR"]) {
    assert.equal(see({ id: "f", role, title: "Office" }), false, role);
  }
});

test("the author sees their own post whatever the audience", () => {
  assert.equal(see({ id: "author-1", role: "STAFF", title: "Independent Living Instructor" }), true);
});

test("a person picked by id is in whatever their title says", () => {
  const byId = { ...targeted, ackUserIds: ["picked-1"] };
  assert.equal(canSeeAnnouncement(byId, { id: "picked-1", role: "STAFF", title: "Office" }), true);
});

test("a plain announcement with no ack is public to all staff - there is no targeting without one", () => {
  const plain = { tag: "Announcement", requireAck: false, authorId: "author-1" };
  assert.equal(canSeeAnnouncement(plain, { id: "c", role: "STAFF", title: "Independent Living Instructor" }), true);
});

test("an ack post whose audience is Everyone is visible to everyone", () => {
  const everyone = { tag: "Announcement", requireAck: true, ackEveryone: true, authorId: "author-1" };
  assert.equal(canSeeAnnouncement(everyone, { id: "c", role: "STAFF", title: "Independent Living Instructor" }), true);
});
