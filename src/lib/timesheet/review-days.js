import { checkWorkSlots, clockLabel } from "./work-slots.js";
import { periodDates } from "./time-off.js";

// Employee-confirmed view only; payroll and correction inputs keep the source day.
export function confirmedReviewDay(day, answer) {
  if (answer?.kind !== "duplicateDay" || answer.date !== day.date
    || answer.status !== "declined" || (answer.choice != null && answer.choice !== "no")) return day;
  const seen = new Set();
  const punches = [];
  let removedMinutes = 0;
  let keptMinutes = 0;
  const source = day.punches || [];
  for (let i = 0; i < source.length; i += 2) {
    const from = source[i]?.min;
    const to = source[i + 1]?.min;
    const valid = Number.isFinite(from) && Number.isFinite(to) && to > from;
    const key = `${from}-${to}`;
    if (valid && seen.has(key)) {
      removedMinutes += to - from;
      continue;
    }
    if (valid) {
      seen.add(key);
      keptMinutes += to - from;
    }
    punches.push(...source.slice(i, i + 2));
  }
  // A legacy hours-only correction may already have removed the doubled total.
  if (!removedMinutes || (day.paidHours || 0) <= keptMinutes / 60 + 0.01) return day;
  return {
    ...day,
    punches,
    paidHours: Math.max(0, Math.round(((day.paidHours || 0) - removedMinutes / 60) * 100) / 100),
    reviewDuplicateOnce: true,
    reviewRecordedHours: day.paidHours || 0,
  };
}

// Presentation rows only. These never become payable days or correction inputs.
export function reviewDays(days, from, to) {
  const recorded = new Map((days || []).map((day) => [day.date, day]));
  const dates = periodDates(from, to);
  if (!dates.length) return days || [];
  return dates.map((date) => recorded.get(date) || {
    date, reviewOnly: true, punches: [], breaks: [], miscBlocks: [],
    paidHours: 0, rawHours: 0, regularHours: 0, otHours: 0, doubleHours: 0,
    addedHours: 0, mealCount: 0, restCount: 0, restRequired: 0,
    mealViolation: false, restViolation: false,
  });
}

// A draft or submitted claim changes the review picture only, never the source.
export function reportedReviewDay(day, reports = []) {
  const report = reports.find((item) => item.date === day.date
    && ["hours", "day_missing", "day_extra"].includes(item.kind));
  if (!report) return day;
  const raw = report.slots || report.statedSlots?.map((slot) => ({
    from: clockLabel(slot.from), to: clockLabel(slot.to),
  }));
  const check = report.kind === "day_extra"
    ? { ok: true, hours: 0, slots: [] }
    : checkWorkSlots(raw, report.claimedHours);
  if (!check.ok) return day;
  return {
    ...day, paidHours: check.hours,
    punches: check.slots.flatMap((slot) => [{ min: slot.from }, { min: slot.to }]),
    breaks: [], miscBlocks: [], miscBreaks: [], addedHours: 0,
    reviewReported: true, reviewRecordedHours: day.paidHours || 0,
  };
}
