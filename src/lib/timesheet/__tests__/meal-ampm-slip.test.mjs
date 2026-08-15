// A MEAL ROSTERED AT AN HOUR NOBODY WORKS, and the second place that has to
// know about it.
//
// The rule has existed inside `recordedBreaksFor` since 2026-08-09 with no test
// and no second caller. The employee's own calendar was the second caller that
// never got it: `dayWindow` grows the axis to hold anything drawn, so one
// 12a-12:10a block ran that day's column from 12a to 5p - seventeen hours and
// 1530px for a day worked 9a to 4:45p.
import { test } from "node:test";
import assert from "node:assert/strict";

import { mealAmPmSlip } from "../recorded-breaks.js";

const at = (h, m = 0) => h * 60 + m;

test("a meal at midnight is read twelve hours over", () => {
  // Bucio 07/25: "12a-12:10a -Meal Break(0:10)" against 9a-12:30p / 12:45p-4:45p
  assert.deepEqual(mealAmPmSlip(at(0), at(0, 10)), { from: at(12), to: at(12, 10) });
  assert.deepEqual(mealAmPmSlip(at(1, 30), at(2)), { from: at(13, 30), to: at(14) });
});

test("an ordinary lunch is left exactly alone", () => {
  // THE CHECK THAT HAS TO FAIL FOR THE OTHERS TO MEAN ANYTHING. A rule that
  // moved everything would satisfy the test above and quietly relocate every
  // lunch on every sheet.
  assert.equal(mealAmPmSlip(at(12), at(12, 30)), null);
  assert.equal(mealAmPmSlip(at(11, 30), at(12)), null);
  assert.equal(mealAmPmSlip(at(5), at(5, 30)), null, "5a is the edge, and it stays");
  assert.notEqual(mealAmPmSlip(at(4, 59), at(5, 29)), null, "4:59a is an hour nobody works");
});

test("the whole block moves or none of it does", () => {
  // a half-corrected time is worse than the original: an end that cannot make
  // the trip means neither end goes
  assert.equal(mealAmPmSlip(at(0), null), null);
  assert.equal(mealAmPmSlip(null, at(12)), null);
  assert.equal(mealAmPmSlip(undefined, undefined), null);
});

// THE LATE HALF OF THE RULE HAS NEVER BEEN ABLE TO FIRE, and this pins that as
// it stands rather than quietly repairing it.
//
// The oddness test is `from < 300 || from >= 1320` - before 5am or at/after
// 10pm. The move is `from + 720`, guarded by `from + 720 <= 1439`. Those two
// cannot both hold above 1320: 10pm plus twelve hours is 10am tomorrow. Checked
// across all 1440 minutes of the day, exactly 0 can reach it.
//
// So a meal rostered at 11pm is left at 11pm and stretches the axis to 11pm,
// which is the fault this file exists to prevent, in the other direction. The
// repair is presumably to move a late one BACK twelve hours rather than
// forward - but that changes what the engine believes about a real block, so it
// is a decision and not a tidy-up. This test fails the day somebody makes it,
// which is the point.
test("a late-night meal does NOT move, because the rule only ever adds twelve hours", () => {
  assert.equal(mealAmPmSlip(at(23), at(23, 30)), null);
  assert.equal(mealAmPmSlip(at(22), at(22, 30)), null);
  assert.equal(mealAmPmSlip(at(23, 50), at(23, 59)), null);
});
