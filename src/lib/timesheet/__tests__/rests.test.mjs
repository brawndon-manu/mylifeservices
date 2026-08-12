// The Rest Periods Report reader.
//
// Every case here came off the real 07/16-07/31 report. The one that matters
// most is the rounding test: `Total Rest Time` prints a genuine ten minute
// break as 0.16 on 61 rows and 0.17 on 271, so any rule that reads minutes off
// that column marks 61 real breaks deficient and invents premiums.
import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyRest, isSaneRest, restKindNote, countsAsTaken, isMealLengthRest } from "../rests.js";
import { recordedBreaksFor, insertRecordedBreaks } from "../recorded-breaks.js";

const row = (out, back, printed) => ({
  "Rest Period Time Out": out,
  "Rest Period Time In": back,
  "Total Rest Time": printed,
});

test("an ordinary ten minute break counts and is not flagged", () => {
  const c = classifyRest(row("7:00 AM", "7:10 AM", 0.16));
  assert.equal(c.counted, true);
  assert.equal(c.minutes, 10);
  assert.equal(c.kind, null);
  assert.equal(c.reversed, false);
});

test("THE ROUNDING TRAP: 0.16 printed is still an exact ten minutes", () => {
  // 0.16 h is 9.6 minutes. Reading the printed column would call this short and
  // charge a premium. April Martinez has 20-odd rows of exactly this shape.
  const printed = row("7:00 AM", "7:10 AM", 0.16);
  assert.equal(Number(printed["Total Rest Time"]) * 60 < 10, true, "the column really is under ten");
  assert.equal(classifyRest(printed).counted, true, "but the break is not");
  assert.equal(classifyRest(printed).kind, null);
  // and the same break printed the other way rounds up
  assert.equal(classifyRest(row("12:30 PM", "12:40 PM", 0.17)).minutes, 10);
});

test("a reversed row is flipped, and counts", () => {
  // Uribe 07/27, Zuchniak x8, Devine x2 - out and in typed into each other's boxes
  const c = classifyRest(row("12:10 PM", "12:00 PM", -0.17));
  assert.equal(c.counted, true);
  assert.equal(c.minutes, 10);
  assert.equal(c.reversed, true);
  assert.equal(c.kind, "reversed-repaired");
});

test("a row is only BACKWARDS if nothing simpler explains it", () => {
  // Jose Martinez 07/23, and the reason this changed on 2026-08-11. Read as
  // backwards it becomes 3:00-3:50, fifty minutes, and the SHEET DRAWS THAT.
  // But his rest is attached to the 1:40-4:10 Toleldo service and the OUT time
  // is right: the IN has an hour rolled off it, giving 3:50-4:00, a ten minute
  // rest inside the service it was logged against. Mánu: "to me that clearly
  // shows it meant to be 3:50-4pm which inside toledo."
  const c = classifyRest(row("3:50 PM", "3:00 PM", -0.83));
  // APPLIED, NOT PROPOSED, since 2026-08-12. Mánu: "the engine should know it
  // was a miss click ... the rest period should still be accounted for and no
  // premium should be given."
  assert.equal(c.counted, true, "a mis-click is a break that happened");
  assert.equal(c.countedMinutes, 10, "counted as the ten it really was");
  assert.equal(c.minutes, 50, "the raw length is still reported honestly");
  assert.equal(c.kind, "repaired");
  assert.equal(c.reversed, false, "a repair explains it, so it is NOT drawn flipped");
  assert.equal(c.repair.to, "4:00 PM", "and the repair is the better reading");

  // THE COUNTER-CASE, or this is only asserting that repairs exist: a row that
  // really is backwards, where no single field fixes it, still flips.
  const backwards = classifyRest(row("4:30 PM", "3:30 PM", -1));
  assert.equal(backwards.reversed, true, "nothing explains this one but a swap");
  assert.equal(backwards.minutes, 60);
  assert.equal(backwards.repair, null);
});

test("the arithmetic behind the printed column is spelled out", () => {
  // "-0.83" to "-50 min" is a jump a reader should not have to take on trust
  assert.equal(classifyRest(row("3:50 PM", "3:00 PM", -0.83)).derivation, "-0.83 hr x 60 = -50 min");
  assert.equal(classifyRest(row("3:30 PM", "4:30 PM", 1)).derivation, "1 hr x 60 = 60 min");
});

test("an obvious single-field misclick is APPLIED, and still asked about", () => {
  // Jose Martinez 07/23: the IN hour rolled back. 4:00 PM gives a normal ten.
  //
  // It used to be proposed and left uncounted, which charged a premium over a
  // dropdown. The question is still generated - `buildQuestions` builds it from
  // `repair`, not from `counted` - so the correction is applied AND signed off.
  const jose = classifyRest(row("3:50 PM", "3:00 PM", -0.83));
  assert.equal(jose.counted, true, "the break is credited");
  assert.deepEqual(
    { field: jose.repair.field, to: jose.repair.to, minutes: jose.repair.minutes },
    { field: "in", to: "4:00 PM", minutes: 10 },
  );

  // Rotter 07/27 and Romero-Alba 07/30: the IN time was picked as PM
  const rotter = classifyRest(row("11:20 AM", "11:30 PM", 12.17));
  assert.equal(rotter.repair.to, "11:30 AM");
  assert.equal(rotter.repair.minutes, 10);
  const juanita = classifyRest(row("10:10 AM", "10:20 PM", 12.17));
  assert.equal(juanita.repair.to, "10:20 AM");
});

test("no repair is proposed when no single field explains it", () => {
  // Hatt 07/20, 3:30 PM -> 4:30 PM. Shifting either field by an hour or twelve
  // gives 0, 90 or nonsense. It stays owed and stays a question for a person.
  const hatt = classifyRest(row("3:30 PM", "4:30 PM", 1));
  assert.equal(hatt.counted, false);
  assert.equal(hatt.kind, "too-long");
  assert.equal(hatt.repair, null);

  // Hernadez 07/25, a clean 30 minutes - that is a meal, not a mis-pick
  assert.equal(classifyRest(row("2:00 PM", "2:30 PM", 0.5)).repair, null);
});

test("under ten minutes still counts as a break taken", () => {
  // Mánu 2026-08-12: "if they took it for two minutes. It's a mistake. and can
  // be fixed, but count it. breaks under 10 minutes are no longer going to be
  // treated as not taken." Four minutes is a typo, not four minutes of rest.
  const c = classifyRest(row("2:00 PM", "2:04 PM", 0.07));
  assert.equal(c.counted, true);
  assert.equal(c.minutes, 4, "reported honestly");
  assert.equal(c.countedMinutes, 10, "credited as the ten it was meant to be");
  assert.equal(c.kind, "short", "and still marked, so the sheet says so");
});

test("eleven to fifteen minutes counts, owes nothing, and is still flagged", () => {
  const c = classifyRest(row("2:00 PM", "2:13 PM", 0.22));
  assert.equal(c.counted, true, "no penalty");
  assert.equal(c.minutes, 13);
  assert.equal(c.kind, "over-ten", "but visible");
  // and it carries the compliance wording, not a penalty
  assert.match(restKindNote(c), /one and a half times the entitlement/);
});

test("over fifteen is still MARKED as over, even though it counts", () => {
  // the length no longer decides whether it counts - it decides what the sheet
  // says about it
  assert.equal(classifyRest(row("2:00 PM", "2:15 PM", 0.25)).kind, "over-ten");
  const over = classifyRest(row("2:00 PM", "2:16 PM", 0.27));
  assert.equal(over.counted, true);
  assert.equal(over.kind, "too-long");
});

test("a meal-length row is the ONE thing that still does not count as a rest", () => {
  // Hernadez 07/25 and 07/26 are exactly 30, Hatt 07/20 is 60. These are read as
  // the LUNCH - drawn blue and striped, asked about as a meal - so counting them
  // as rests too would let one entry clear two different violations.
  for (const [o, i] of [["2:00 PM", "2:30 PM"], ["3:30 PM", "4:30 PM"]]) {
    const c = classifyRest(row(o, i, 0.5));
    assert.equal(c.counted, false, `${o}-${i} is a meal candidate, not a rest`);
    assert.equal(c.kind, "too-long");
  }
  // and a row PAST meal length is back to counting
  assert.equal(classifyRest(row("9:00 AM", "2:00 PM", 5)).counted, true);
});

test("an AM/PM slip reports 730 minutes and counts as the ten it was", () => {
  // Rotter 07/27 and Romero-Alba 07/30. Twelve hours and ten minutes is not a
  // rest period, and it is not an absence either - somebody clocked a break and
  // the IN was picked as PM.
  const c = classifyRest(row("11:20 AM", "11:30 PM", 12.17));
  assert.equal(c.counted, true, "no premium for a dropdown");
  assert.equal(c.minutes, 730, "what the document literally says, for the card");
  assert.equal(c.countedMinutes, 10, "what it is credited as");
  assert.equal(c.kind, "repaired");
  assert.equal(c.repair.to, "11:30 AM");
});

test("a row nothing explains counts anyway, and carries no repair", () => {
  // it stopped being about whether we can explain the row and became about
  // whether the row exists at all
  const c = classifyRest(row("9:00 AM", "2:00 PM", 5));
  assert.equal(c.repair, null, "no single field explains five hours");
  assert.equal(c.counted, true, "somebody still clocked a break");
  assert.equal(c.kind, "too-long");
});

test("a row with no times at all still COUNTS, and asks for the times", () => {
  // Flores 07/29. Mánu 2026-08-10: "if its blank it should count as a break but
  // needs to correction". Somebody opened the break screen and logged it; the
  // times are what did not survive. Treating it as no break charged her a rest
  // premium for a break the report says she took.
  const c = classifyRest(row("", "", 0));
  assert.equal(c.counted, true, "the break happened");
  assert.equal(c.minutes, null, "but nobody knows when");
  assert.equal(c.kind, "no-times");
  assert.equal(c.needsTimes, true);
  assert.deepEqual(c.missing, ["out", "in"], "two blanks, so two ?");

  // one blank asks for one, and names WHICH - the sheet draws a ? in that column
  assert.deepEqual(classifyRest(row("", "9:10 AM", 0)).missing, ["out"]);
  assert.deepEqual(classifyRest(row("9:00 AM", "", 0)).missing, ["in"]);

  // and a row that HAS its times is untouched by any of this
  const ok = classifyRest(row("9:00 AM", "9:10 AM", 0.17));
  assert.equal(ok.needsTimes, undefined);
  assert.equal(ok.missing, undefined);
});

test("ten is clean and nine is marked, and both count", () => {
  // the boundary decides what the sheet SAYS, not whether the break happened
  const ten = classifyRest(row("9:00 AM", "9:10 AM", 0.17));
  assert.equal(ten.counted, true);
  assert.equal(ten.kind, null, "nothing to remark on");
  const nine = classifyRest(row("9:00 AM", "9:09 AM", 0.15));
  assert.equal(nine.counted, true, "a minute short is a typo, not a missed break");
  assert.equal(nine.kind, "short", "but the sheet still says it is short");
});

test("isSaneRest still judges the printed column only", () => {
  // kept as a helper; it is deliberately NOT what decides a break any more
  assert.equal(isSaneRest(0.16), true);
  assert.equal(isSaneRest(-0.17), false);
  assert.equal(isSaneRest(12.17), false);
});

// ---------------------------------------------------- rows that are not rests

test("a pasted timesheet line is not a rest row, however Excel hands it over", async () => {
  const { isRestRow } = await import("../rests.js");

  // the real shape that got through on 2026-08-08: someone hand-worked their
  // own timesheet in the rest report workbook and uploaded it. Excel gives the
  // date as a serial, so 46219 is 07/16/26 and it read as a person's name.
  const pasted = {
    "Employee Name": 46219, "Employee Office": "11a", "Client Name": "1p",
    "Service Type": "1:15p", "Start Date": "3:15p", "Shift Start Time": "3:30p",
    "Rest Period Time Out": null, "Rest Period Time In": null, "Total Rest Time": null,
  };
  assert.equal(isRestRow(pasted), false, "a bare number is a date serial, never a person");

  // and the ordinary row still passes, or the guard has eaten the report
  const real = {
    "Employee Name": "Aranda, Jennifer", "Start Date": "7/16/2026",
    "Rest Period Time Out": "3:00 PM", "Rest Period Time In": "3:10 PM", "Total Rest Time": 0.17,
  };
  assert.equal(isRestRow(real), true);

  // the two ways a row can be incomplete
  assert.equal(isRestRow({ "Employee Name": "", "Start Date": "7/16/2026" }), false);
  assert.equal(isRestRow({ "Employee Name": "Aranda, Jennifer", "Start Date": "" }), false);
});

test("a rest filed against the wrong shift is spotted, and it is not a missed break", async () => {
  const { restOffOwnShift } = await import("../rests.js");
  const row = (shiftA, shiftB, restA, restB) => ({
    "Shift Start Time": shiftA, "Shift End Time": shiftB,
    "Rest Period Time Out": restA, "Rest Period Time In": restB,
  });

  // Aranda 07/16: the break is half an hour past the shift it is hung on. She
  // was working 2:30-5:00, so it happened and it counts - the ROW is wrong.
  assert.equal(restOffOwnShift(row("1:00 PM", "2:30 PM", "3:00 PM", "3:10 PM")), true);
  // and before the shift starts, the other direction
  assert.equal(restOffOwnShift(row("11:30 AM", "2:30 PM", "11:20 AM", "11:30 AM")), true);

  // a rest inside its own shift is the ordinary case, and must not be flagged
  // or the check is just counting rest rows
  assert.equal(restOffOwnShift(row("8:00 AM", "5:00 PM", "10:00 AM", "10:10 AM")), false);
  // touching the edges still counts as inside
  assert.equal(restOffOwnShift(row("8:00 AM", "5:00 PM", "8:00 AM", "8:10 AM")), false);

  // a reversed rest is malformed, handled elsewhere, and not a placement problem
  assert.equal(restOffOwnShift(row("8:00 AM", "5:00 PM", "11:45 AM", "11:35 AM")), false);
  // nothing to compare against
  assert.equal(restOffOwnShift(row("", "", "10:00 AM", "10:10 AM")), false);
});

// ---------------------------------------------------------------------------
// a 30-minute entry filed as a rest break: drawn as a meal, decided by nobody
// ---------------------------------------------------------------------------

test("any MEAL-LENGTH rest row is recognised, not just an exact thirty", () => {
  // Hernadez 07/25 and 07/26 are 30; Martinez 07/23 flips to 50 and is the same
  // species. Widened 2026-08-10 to the engine's own meal window, 21 to 90, so a
  // 45 minute row on the next batch is not missed for not being 30.
  const meal = { counted: false, repair: null, minutes: 30 };
  assert.equal(isMealLengthRest(meal), true);
  assert.equal(isMealLengthRest({ ...meal, minutes: 50 }), true, "Martinez");
  assert.equal(isMealLengthRest({ ...meal, minutes: 60 }), true, "Hatt's length");
  assert.equal(isMealLengthRest({ ...meal, minutes: 21 }), true, "the low edge");
  assert.equal(isMealLengthRest({ ...meal, minutes: 90 }), true, "the high edge");

  // the window still has to mean something at both ends
  assert.equal(isMealLengthRest({ ...meal, minutes: 10 }), false, "ten is a rest");
  assert.equal(isMealLengthRest({ ...meal, minutes: 20 }), false, "still rest-shaped");
  assert.equal(isMealLengthRest({ ...meal, minutes: 91 }), false, "too long for a meal");
  assert.equal(isMealLengthRest({ ...meal, counted: true }), false, "a counted row stands");
  // A ROW A SINGLE MIS-PICKED FIELD EXPLAINS IS NOT THIS, restored 2026-08-11.
  // Martinez 07/23 read as meal-length, so the sheet drew his fifty minutes as a
  // lunch - and once the reversed flag correctly went, it drew "3:50p-3p", a
  // meal ending before it began. His rest is attached to the 1:40-4:10 Toleldo
  // service with the OUT time right and an hour rolled off the IN. A mechanical
  // fix beats a guess at intent.
  assert.equal(
    isMealLengthRest({ ...meal, repair: { field: "in", minutes: 10 } }),
    false,
    "the repair explains it, so it is not a lunch",
  );
  assert.equal(isMealLengthRest(null), false);
});

test("it is drawn as a striped meal, and charged as neither", () => {
  // inside a worked segment, exactly like Hernadez 07/25 (punched 12:30p-4:30p)
  const punches = [{ min: 570, raw: "9:30a" }, { min: 720, raw: "12p" },
    { min: 750, raw: "12:30p" }, { min: 990, raw: "4:30p" }];
  const rests = [{
    name: "Hernadez, Joseph", date: "07/25/26", out: "2:00 PM", in: "2:30 PM",
    minutes: 30, counted: false, reversed: false, kind: "too-long", repair: null,
  }];
  const rec = recordedBreaksFor("Hernadez, Joseph", rests, null);
  const day = rec.get("07/25/26");
  assert.equal(day.rests.length, 0, "it is no longer offered as a rest");
  assert.equal(day.meals.length, 1, "it is offered as a meal");
  assert.equal(day.meals[0].adjusted, true);

  const { punches: shown } = insertRecordedBreaks(punches, day.order);
  assert.deepEqual(shown.map((x) => x.raw),
    ["9:30a", "12p", "12:30p", "2p", "2:30p", "4:30p"]);
  assert.deepEqual(shown.map((x) => x.mark),
    [null, null, null, "meal-adjusted", "meal-adjusted", null]);

  // and the same row at TEN minutes is still a rest, or the check above passes
  // for a renderer that turned every uncounted row into a meal
  const ten = recordedBreaksFor("Hernadez, Joseph",
    [{ ...rests[0], minutes: 10, counted: true, kind: null }], null);
  assert.equal(ten.get("07/25/26").meals.length, 0);
  assert.equal(ten.get("07/25/26").rests.length, 1);
});

test("the email asks about it and never answers it", async () => {
  const { buildEmployeeChecks, checkSummaryLine } =
    await import("../employee-checks.js");
  const data = { days: [{ date: "07/25/26", paidHours: 7 }] };
  const restRows = [{
    name: "Hernadez, Joseph", date: "07/25/26", out: "2:00 PM", in: "2:30 PM",
    minutes: 30, counted: false, reversed: false, kind: "too-long", repair: null,
  }];

  const checks = buildEmployeeChecks(data, { restRows, sourceName: "Hernadez, Joseph" });
  const hit = checks.find((k) => k.kind === "restIsMealLength");
  assert.ok(hit, "the check is raised");
  assert.equal(hit.tone, "ask", "asked, not asserted");
  assert.deepEqual(hit.rows, [{ date: "07/25/26", from: "2p", to: "2:30p", minutes: 30 }]);
  assert.match(checkSummaryLine(hit), /tell us whether it was your meal/);

  // it comes from the BATCH rows, so a caller that forgets them gets nothing
  // rather than a wrong answer
  assert.equal(
    buildEmployeeChecks(data).some((k) => k.kind === "restIsMealLength"),
    false,
  );
  // and it belongs to that person only
  assert.equal(
    buildEmployeeChecks(data, { restRows, sourceName: "Someone, Else" })
      .some((k) => k.kind === "restIsMealLength"),
    false,
  );
});

// ---------------------------------------------------------------------------
// THE SERVICE A REST WAS LOGGED AGAINST.
//
// Mánu 2026-08-11: "rest periods are tied to a service. theres no way to
// document them without having a service to add it to." The report has carried
// Shift Start/End, Client Name and Service Type all along and the engine used
// none of it - `restOffOwnShift` existed, was tested, and was called from
// nowhere but its own test. Everything about where a break belonged was being
// inferred from punch gaps instead.

test("a rest is placed against the service it was logged under", async () => {
  const { serviceFit } = await import("../rests.js");
  const r = (sFrom, sTo, rOut, rIn) => ({
    "Shift Start Time": sFrom, "Shift End Time": sTo,
    "Rest Period Time Out": rOut, "Rest Period Time In": rIn,
  });
  assert.equal(serviceFit(r("8:00 AM", "5:00 PM", "10:00 AM", "10:10 AM")).where, "inside");
  assert.equal(serviceFit(r("1:00 PM", "2:30 PM", "3:00 PM", "3:10 PM")).where, "after", "Aranda 07/16");
  assert.equal(serviceFit(r("4:30 PM", "9:30 PM", "3:30 PM", "4:30 PM")).where, "before", "Hatt 07/20");
  assert.equal(serviceFit(r("8:00 AM", "12:00 PM", "11:55 AM", "12:05 PM")).where, "straddles");
  assert.equal(serviceFit(r("", "", "10:00 AM", "10:10 AM")).where, "unknown");
});

test("ABUTS is what makes the two edge mistakes the same species", async () => {
  const { serviceFit } = await import("../rests.js");
  const at = (sFrom, sTo, rOut, rIn) => serviceFit({
    "Shift Start Time": sFrom, "Shift End Time": sTo,
    "Rest Period Time Out": rOut, "Rest Period Time In": rIn,
  });
  // Uribe 07/28: the break starts exactly as the Rincon service ends.
  // Hatt 07/20: it ends exactly as the Flores service starts. One mistake at
  // opposite ends of a shift, and nothing before 2026-08-11 could see they were
  // related - 10 rows across 6 people on this period.
  const uribe = at("10:00 AM", "12:00 PM", "12:00 PM", "12:10 PM");
  const hatt = at("4:30 PM", "9:30 PM", "3:30 PM", "4:30 PM");
  assert.equal(uribe.where, "after");
  assert.equal(hatt.where, "before");
  assert.ok(uribe.abuts && hatt.abuts, "both sit hard against the edge");

  // AND IT DISCRIMINATES: a rest half an hour clear of its shift is a misfiled
  // row, not somebody logging at the boundary. Aranda 07/16 is that shape.
  const aranda = at("1:00 PM", "2:30 PM", "3:00 PM", "3:10 PM");
  assert.equal(aranda.where, "after");
  assert.equal(aranda.abuts, false, "30 minutes clear, so not the same mistake");
  assert.equal(aranda.gapMin, 30);

  // a break sitting properly inside its service has no edge to speak of
  assert.equal(at("8:00 AM", "5:00 PM", "10:00 AM", "10:10 AM").abuts, undefined);
});

test("a repair that lands INSIDE the service beats one that does not", () => {
  // Martinez 07/23 on the 1:40-4:10 Toleldo service. Rolling the IN hour forward
  // gives 3:50-4:00, inside it. Before 2026-08-11 the search returned whichever
  // candidate came first in a hard-coded list, which is picking by accident.
  const jose = classifyRest({
    "Rest Period Time Out": "3:50 PM", "Rest Period Time In": "3:00 PM",
    "Shift Start Time": "1:40 PM", "Shift End Time": "4:10 PM",
    "Total Rest Time": -0.83,
  });
  assert.equal(jose.repair.to, "4:00 PM");
  assert.equal(jose.repair.fits, true, "chosen BECAUSE it lands inside the service");

  // with no service on the row there is nothing to tie-break on, and the search
  // falls back to the first candidate - so `fits` is null rather than a fib
  const noService = classifyRest({
    "Rest Period Time Out": "3:50 PM", "Rest Period Time In": "3:00 PM",
    "Total Rest Time": -0.83,
  });
  assert.equal(noService.repair.fits, null);
  assert.equal(noService.repair.to, "4:00 PM", "same answer here, but by position not by fit");
});

// THE WORDS AND THE ARITHMETIC HAVE TO AGREE.
//
// `restKindNote` renders directly under the card `describeRestRow` writes on the
// checks screen, and again on the employee's own page. Three of its six entries
// still said a row did not count - the rule until 2026-08-12 - so the same card
// printed "It still counts as a 10 minute break taken" above "it does not count
// until somebody confirms what it was". This walks every kind and asserts the
// note agrees with `countsAsTaken` about that row, which is the one thing the
// two must never disagree on.
test("every rest-kind note agrees with countsAsTaken about the same row", () => {
  const cases = [
    ["short", row("2:00 PM", "2:02 PM", 0.03)],
    ["over-ten", row("2:00 PM", "2:13 PM", 0.22)],
    ["too-long, counted", row("11:00 AM", "11:10 PM", 12.17)],
    ["too-long, meal-length", row("2:00 PM", "2:30 PM", 0.5)],
    ["plain ten", row("2:00 PM", "2:10 PM", 0.17)],
  ];
  for (const [label, r] of cases) {
    const c = classifyRest(r);
    const note = restKindNote(c);
    if (!note) continue;
    const denies = /does not count|not counted as a rest|nothing can say a break was taken/.test(note);
    assert.equal(
      denies, !countsAsTaken(c),
      `${label}: note says ${denies ? "it does NOT count" : "it counts"} but countsAsTaken is ${countsAsTaken(c)} - "${note}"`,
    );
  }
});

test("a meal-length row is the only one whose note may deny the break", () => {
  const meal = classifyRest(row("2:00 PM", "2:30 PM", 0.5));
  assert.equal(countsAsTaken(meal), false);
  assert.match(restKindNote(meal), /length of a meal/);
});
