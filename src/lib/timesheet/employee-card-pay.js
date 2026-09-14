import { miscTimeOffHours, timeOffTotals } from "./time-off.js";
import { splitPremium, confirmedFromAnswers } from "./premium-split.js";

const round = (value) => Math.round(value * 100) / 100;

// Claims never enter these totals. Included leave is already in paidHours;
// calendar leave is recorded separately, as it is on the payout report.
export function employeeCardPay(sheet, calendar = [], split) {
  const included = miscTimeOffHours(sheet.data?.days);
  const recorded = timeOffTotals(calendar.filter((entry) => sheet.userId && entry.personKey === sheet.userId));
  const premium = split || splitPremium(sheet.data?.days || [], {
    confirmed: confirmedFromAnswers(sheet.corrections),
  });
  return {
    meal: round(premium.rows.filter((row) => row.kind === "meal").reduce((sum, row) => sum + row.hours, 0)),
    rest: round(premium.rows.filter((row) => row.kind === "rest").reduce((sum, row) => sum + row.hours, 0)),
    pto: round(included.pto + recorded.pto),
    sick: round(included.sick + recorded.sick),
    includedPto: included.pto,
    includedSick: included.sick,
    worked: round(Math.max(0, (sheet.paidHours || 0) - included.total)),
  };
}
