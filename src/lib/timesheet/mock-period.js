// A PAY PERIOD THAT EXISTS ONLY TO DEMO THE PAGES.
//
// Mánu 2026-09-08: "make a mock timesheets month in the day porgram... call it
// Mocktember. it can be treated as 'real' since im the only person that will be
// in tht timehseet." He is the only sheet in it, so nothing about it is treated
// as a test: no badge, no banner, no warning anywhere. Only its NAME differs.
//
// THE DATES ARE REAL ON PURPOSE. Every label runs through a month number and
// every figure through a real Date, so a made-up month like "13/01/37" prints
// blank and breaks the arithmetic. September 2037 starts on a Tuesday and has
// 30 days, exactly like September 2026, so the mock's dates and weekdays match
// the September he is demonstrating - and 2037 cannot collide with a real
// payroll period.
//
// Keyed on the period's own start date. Nothing else in the app knows this
// file exists, and deleting the entry gives the period its real name back.
const MOCK_MONTHS = {
  "09/01/37": "Mocktember",
};

// "09/01/37" -> "Mocktember", or null for every real period.
export function mockMonthName(from) {
  return MOCK_MONTHS[String(from || "").trim()] || null;
}

// the month name a period should print, mock or real. `fallback` is whatever
// the caller would have used, so a caller keeps its own list and its own
// abbreviation rules.
export function monthNameFor(from, fallback) {
  // NOT ABBREVIATED. The callers that draw "Sep" would have made this "Mock",
  // which reads like a broken string rather than a month. The name is the whole
  // point of the period, so it prints in full wherever a month would.
  return mockMonthName(from) || fallback;
}
