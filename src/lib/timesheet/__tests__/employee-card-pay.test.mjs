import { test } from "node:test";
import assert from "node:assert/strict";
import { employeeCardPay } from "../employee-card-pay.js";

test("included July PTO remains inside QSP-comparable hours", () => {
  const sheet = { userId: "employee", paidHours: 19.05, data: { days: [{ date: "07/20/26", miscKind: "pto", miscMin: 390 }] } };
  const pay = employeeCardPay(sheet);
  assert.deepEqual(pay, { meal: 0, rest: 0, pto: 6.5, sick: 0, includedPto: 6.5, includedSick: 0, worked: 12.55 });
  assert.equal(sheet.paidHours, 19.05);
});

test("recorded calendar leave stays separate from included leave and reported claims", () => {
  const sheet = { userId: "employee", paidHours: 8, data: { days: [{ date: "09/02/26", miscKind: "sick", miscMin: 120 }] }, corrections: [{ kind: "time_off", status: "noted", timeOff: [{ date: "09/03/26", kind: "pto", hours: 8 }] }] };
  const calendar = [{ personKey: "employee", kind: "pto", hours: 4 }, { personKey: "employee", kind: "sick", hours: 3 }, { personKey: "other", kind: "pto", hours: 9 }];
  const pay = employeeCardPay(sheet, calendar);
  assert.deepEqual(pay, { meal: 0, rest: 0, pto: 4, sick: 5, includedPto: 0, includedSick: 2, worked: 6 });
  assert.equal(employeeCardPay({ ...sheet, userId: null }, calendar).pto, 0);
});

test("historical rest premiums survive, attested dates never resurrect stored rest flags", () => {
  const days = [{ date: "08/31/26", restViolation: true }, { date: "09/01/26", restViolation: true, mealViolation: true }, { date: "09/02/26", restViolation: true, mealLate: true }];
  const pay = employeeCardPay({ paidHours: 24, data: { days } });
  assert.equal(pay.rest, 1);
  assert.equal(pay.meal, 2);
  assert.equal(employeeCardPay({ data: { days: days.slice(1) } }).rest, 0);
});

test("nominal day-program PTO and rounded sick minutes keep their recorded categories", () => {
  const pay = employeeCardPay({ paidHours: 10, data: { days: [{ isPto: true, ptoHours: 8 }, { miscKind: "sick", miscMin: 20 }] } });
  assert.equal(pay.pto, 8);
  assert.equal(pay.sick, .33);
  assert.equal(pay.worked, 1.67);
});
