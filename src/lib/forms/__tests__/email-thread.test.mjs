// READING A THREAD OF EMAIL ACKNOWLEDGMENTS - Mánu 2026-09-12, backfilling the
// sign-offs that happened before the portal existed.
//
// Every case here is taken from the real SB-294 thread he pasted, because the
// format is far messier than a tidy example suggests and each rule below was
// added for a specific line in it.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseEmailThread, parseThreadDate, companyInstant, earliestPerPerson, isThreadDateLine,
} from "../email-thread.js";
import { buildDirectory, matchEntry, matchThread } from "../email-match.js";

const DIR = buildDirectory([
  { id: "u1", name: "Joseph Gutierrez", email: "joe.mylifeservices@gmail.com" },
  { id: "u2", name: "Joseph Hernandez", email: "jhernandez.mylifeservices@gmail.com" },
  { id: "u3", name: "Norman", email: "nlawler.mylifeservices@gmail.com" },
  { id: "u4", name: "Ravon-Symone", email: "rhardy.mylifeservices@gmail.com" },
  { id: "u5", name: "Edward", email: "mylifeservices.edwardc@gmail.com" },
  { id: "u6", name: "Jennifer Delgado Pineda", email: "jdelgado.mylifeservices@gmail.com" },
  { id: "u7", name: "Kristy Hatt", email: "khatt.mylifeservices@gmail.com" },
  { id: "u8", name: "Britny Arevalo", email: "britny.mylifeservices@gmail.com" },
  { id: "u9", name: "Gabriel Miranda", email: "gmiranda.mylifeservices@gmail.com" },
]);

test("a thread entry is sender, date, body, with Gmail's noise skipped", () => {
  const rows = parseEmailThread([
    "Kristy", "Attachments", "Sat, May 23, 3:07 PM", "Kristy Hatt Received notice",
    "Brandon Espinoza <bespinoza.mylifeservices@gmail.com>", "Tue, Jun 9, 12:28 PM", "to me", "I have received",
  ].join("\n"));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].displayName, "Kristy", "the Attachments line is not the sender");
  assert.equal(rows[0].senderEmail, null);
  assert.equal(rows[1].displayName, "Brandon Espinoza", "the address is taken off the name");
  assert.equal(rows[1].senderEmail, "bespinoza.mylifeservices@gmail.com");
  assert.equal(rows[1].body, "I have received", '"to me" is not the body');
});

test("an address inside a reply is somebody else's and is never an identity", () => {
  // all 7 bodies carrying an address in the real thread quoted the message
  // being replied to. Reading it would have credited Gabriel's acknowledgment
  // to Britny, who sent the notice.
  const e = {
    displayName: "Gabriel Miranda",
    senderEmail: null,
    body: "Received, thank you Gabriel Miranda On May 23, 2026, at 2:48 PM, Britny Arevalo <britny.mylifeservices@gmail.com>",
  };
  assert.equal(matchEntry(e, DIR).userId, "u9", "the replier, not the person quoted");
});

test("the name Gmail shows can be shorter than the account's", () => {
  // "Joe" is Joseph Gutierrez, whose address is joe.mylifeservices@gmail.com -
  // and Joseph Hernandez replied separately under his own name
  assert.deepEqual(matchEntry({ displayName: "Joe", body: "Received" }, DIR),
    { userId: "u1", how: "email name" });
  assert.equal(matchEntry({ displayName: "Joseph Hernandez", body: "" }, DIR).userId, "u2");
});

test("an account holding only a first name matches when the address agrees", () => {
  // three people sign with a surname the account does not carry; the address
  // does. Both halves have to agree or it stays unassigned.
  for (const [shown, id] of [["Norman Lawler", "u3"], ["Ravon-Symone Hardy", "u4"], ["Edward Castro", "u5"]]) {
    assert.deepEqual(matchEntry({ displayName: shown, body: "" }, DIR),
      { userId: id, how: "name and address agree" }, shown);
  }
  // the same first name with a surname nothing corroborates stays unassigned
  assert.equal(matchEntry({ displayName: "Norman Bates", body: "" }, DIR).userId, null);
});

test("the typed name can be a prefix of the account's", () => {
  const e = { displayName: "Jenny Delgado", body: "Jennifer Delgado, I received the notice" };
  assert.deepEqual(matchEntry(e, DIR), { userId: "u6", how: "name in the reply" });
});

test("nothing is guessed: no account means unassigned", () => {
  assert.deepEqual(matchEntry({ displayName: "Patricia Ramirez", body: "Patricia Ramirez , I have received" }, DIR),
    { userId: null, how: "no account" });
  assert.equal(matchEntry({ displayName: "", body: "x" }, DIR).how, "no name");
});

test("the sender's own notice is not an acknowledgment of it", () => {
  const rows = matchThread(
    [{ displayName: "Britny Arevalo", body: "Hi Team" }, { displayName: "Kristy", body: "Kristy Hatt" }],
    DIR,
    { senderName: "Britny Arevalo" },
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].userId, "u7");
});

test("a date with no year is read in California", () => {
  assert.ok(isThreadDateLine("Sat, May 23, 2:48 PM"));
  assert.ok(!isThreadDateLine("Kristy Hatt"));
  const parts = parseThreadDate("Sat, May 23, 2:50 PM", 2026);
  assert.deepEqual(parts, { year: 2026, month: 4, day: 23, hour: 14, minute: 50 });
  // May is daylight time, so 2:50 PM in California is 21:50 UTC
  assert.equal(companyInstant(parts).toISOString(), "2026-05-23T21:50:00.000Z");
  // and January is not
  assert.equal(companyInstant({ year: 2026, month: 0, day: 5, hour: 14, minute: 50 }).toISOString(),
    "2026-01-05T22:50:00.000Z");
  assert.equal(parseThreadDate("nonsense", 2026), null);
});

test("one acknowledgment per person, the earliest", () => {
  // Martha Plancarte replied four times in the real thread
  const d = (iso) => new Date(iso);
  const rows = [
    { userId: "u3", at: d("2026-06-01T21:33:00Z") },
    { userId: "u3", at: d("2026-05-24T16:20:00Z") },
    { userId: "u3", at: d("2026-06-01T21:38:00Z") },
    { userId: null, displayName: "Joe", at: d("2026-05-23T22:01:00Z") },
    { userId: null, displayName: "Someone else", at: d("2026-06-02T02:10:00Z") },
  ];
  const out = earliestPerPerson(rows);
  assert.equal(out.filter((r) => r.userId === "u3").length, 1);
  assert.equal(out.find((r) => r.userId === "u3").at.toISOString(), "2026-05-24T16:20:00.000Z");
  // two unassigned rows may be two people - collapsing them would lose a record
  assert.equal(out.filter((r) => !r.userId).length, 2);
});
