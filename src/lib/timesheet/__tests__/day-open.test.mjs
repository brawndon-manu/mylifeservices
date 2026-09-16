// THE SCREEN AND THE CARD HAVE TO AGREE ABOUT A FINISHED DAY.
//
// "Is anything still open on this day" decides whether a day may be finished
// with. "Would anything be open if that one question were answered" decides
// whether its confirm carries somebody to the next day. They are one rule asked
// one answer apart, and the pair below is what stops them drifting: whatever
// holds a day open must hold it open in both readings.
import { test } from "node:test";
import assert from "node:assert/strict";

import { dayStillOpen, dayFinishesOn, finisherFor } from "../day-open.js";

const group = (id) => [{ id }];

test("a day with nothing on it is not open, and nothing finishes it twice", () => {
  assert.equal(dayStillOpen({}), false);
  // there is no question to answer, so no question can be the one that finishes it
  assert.equal(dayFinishesOn({}, "anything"), true);
});

test("an unanswered plain card holds the day, and answering it finishes the day", () => {
  const input = { groups: [group("mealLate:09/03/26:2p")], answers: {} };
  assert.equal(dayStillOpen(input), true);
  assert.equal(dayFinishesOn(input, "mealLate:09/03/26:2p"), true);
});

test("a second card still open means the first one does not finish the day", () => {
  const input = { groups: [group("a"), group("b")], answers: {} };
  assert.equal(dayFinishesOn(input, "a"), false, "answering a still leaves b");
  assert.equal(dayFinishesOn(input, "b"), false, "answering b still leaves a");
  // and once one is on record, the other one does finish it
  assert.equal(dayFinishesOn({ ...input, answers: { a: "accepted" } }, "b"), true);
});

test("answering a question that is not on this day finishes nothing", () => {
  const input = { groups: [group("a")], answers: {} };
  assert.equal(dayFinishesOn(input, "somewhere-else"), false);
});

test("a batched row holds the day whatever the plain cards say", () => {
  // the batch stages in the browser until one Save, so none of it is written
  const input = { groups: [group("a")], batched: [{ id: "b" }], answers: { a: "accepted" } };
  assert.equal(dayStillOpen(input), true);
  assert.equal(dayFinishesOn(input, "a"), false);
});

test("a rest nobody has acknowledged holds the day, unless the day is attested", () => {
  const rests = [{ attention: true, key: "09/08/26|540" }];
  assert.equal(dayStillOpen({ rests, acked: new Set() }), true);
  assert.equal(dayStillOpen({ rests, acked: new Set(["09/08/26|540"]) }), false);
  // the attestation covers the day, so the row is not something to chase
  assert.equal(dayStillOpen({ rests, attested: true, acked: new Set() }), false);
  // and it holds the confirm back too, or the card would jump off an open day
  assert.equal(dayFinishesOn({ groups: [group("a")], rests, answers: {}, acked: new Set() }, "a"), false);
});

test("a rest with nothing to look at never holds anything", () => {
  assert.equal(dayStillOpen({ rests: [{ attention: false, key: "x" }], acked: new Set() }), false);
});

// the property that matters: finishing is exactly the absence of everything else
test("finishing a day is the same rule as the day being open, one answer apart", () => {
  const cases = [
    { groups: [group("a")], answers: {} },
    { groups: [group("a"), group("b")], answers: { b: "accepted" } },
    { groups: [group("a")], batched: [{ id: "z" }], answers: {} },
    { groups: [group("a")], rests: [{ attention: true, key: "k" }], answers: {}, acked: new Set() },
    { groups: [group("a")], rests: [{ attention: true, key: "k" }], answers: {}, acked: new Set(["k"]) },
  ];
  for (const input of cases) {
    const withIt = { ...input, answers: { ...(input.answers || {}), a: "accepted" } };
    assert.equal(
      dayFinishesOn(input, "a"),
      !dayStillOpen(withIt),
      `asking one answer ahead disagreed with asking after the write: ${JSON.stringify(input)}`,
    );
  }
});

// THE MAP THE PAGE ACTUALLY HANDS OVER, since a function cannot cross from a
// server component to a client one.
test("the finisher is the one question whose answer would close the day", () => {
  assert.equal(finisherFor({ groups: [group("a")], answers: {} }), "a");
  // two open, so neither of them is the one
  assert.equal(finisherFor({ groups: [group("a"), group("b")], answers: {} }), null);
  // one open, one already on record
  assert.equal(finisherFor({ groups: [group("a"), group("b")], answers: { b: "accepted" } }), "a");
});

test("a day with nothing open has no finisher, so nothing claims to close it", () => {
  // this is the trap: dayFinishesOn says true for ANY id on a finished day,
  // because nothing is holding it. The map must not hand that back to a card.
  assert.equal(dayFinishesOn({ groups: [group("a")], answers: { a: "accepted" } }, "whatever"), true);
  assert.equal(finisherFor({ groups: [group("a")], answers: { a: "accepted" } }), null);
  assert.equal(finisherFor({}), null);
});

test("a batched row or an unacknowledged rest leaves the day with no finisher", () => {
  assert.equal(finisherFor({ groups: [group("a")], batched: [{ id: "z" }], answers: {} }), null);
  assert.equal(
    finisherFor({ groups: [group("a")], rests: [{ attention: true, key: "k" }], answers: {}, acked: new Set() }),
    null,
  );
});
