import { companyDate } from "../company-time.js";
import { miscTimeOffHours } from "./time-off.js";

// Period strings are California calendar dates, not midnight-UTC instants.
export function batchPeriodLabels(from, to) {
  const parse = (value) => {
    const match = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(String(value || ""));
    if (!match) return null;
    const [, month, day, year] = match.map(Number);
    const date = new Date(Date.UTC(2000 + year, month - 1, day, 12));
    if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date;
  };
  const start = parse(from), end = parse(to);
  if (!start || !end || end < start) return { title: `${from} to ${to}`, eyebrow: "Pay period" };
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
  const label = (date, year = false) => companyDate(date, {
    month: "long", day: "numeric", ...(year ? { year: "numeric" } : {}),
  });
  return {
    title: sameMonth ? `${label(start)}–${end.getUTCDate()}` : `${label(start, !sameYear)} to ${label(end, !sameYear)}`,
    eyebrow: sameMonth ? companyDate(start, { month: "long", year: "numeric" }) : sameYear ? companyDate(start, { year: "numeric" }) : "Pay period",
  };
}

// Same category boundaries as the payout report: classified Misc leave already
// sits inside paidHours. Calendar leave is additional and only joins a matched sheet.
export function batchWorkTotals(sheets = [], ptoRows = []) {
  const byPerson = new Map();
  for (const entry of ptoRows) {
    const totals = byPerson.get(entry.personKey) || { pto: 0, sick: 0 };
    totals[entry.kind === "sick" ? "sick" : "pto"] += entry.hours || 0;
    byPerson.set(entry.personKey, totals);
  }
  const totals = { worked: 0, pto: 0, sick: 0 };
  for (const sheet of sheets) {
    const misc = miscTimeOffHours(sheet.data?.days);
    const calendar = sheet.userId && byPerson.get(sheet.userId);
    totals.worked += Math.max(0, (sheet.paidHours || 0) - misc.total);
    totals.pto += misc.pto + (calendar?.pto || 0);
    totals.sick += misc.sick + (calendar?.sick || 0);
  }
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Math.round(value * 100) / 100]));
}
