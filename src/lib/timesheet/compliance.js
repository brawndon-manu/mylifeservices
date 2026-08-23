// A COMPLIANCE FINDING IS NOT A VIOLATION, and this file exists to keep those
// apart the way violations.js keeps violations apart from anomalies.
//
// Mánu 2026-08-22: "I know we handle violations and premiums differently but I
// want to have a way to have MLS violations where it becomes admins job to see
// patterns and repeats and stop it."
//
// The three categories now read:
//
//   ANOMALY     the record is wrong. A rest logged outside the shift, a break
//               in a punched-out gap. The day was fine; the document describes
//               it badly, and the repair is in QuickSolve.
//   VIOLATION   the record is right and a break rule was broken. §226.7 charges
//               an hour and the employee is owed it.
//   COMPLIANCE  the record is right and a SCHEDULING rule was broken. Nobody is
//               owed anything, nothing is repaired, and no employee did it to
//               themselves - a booking is rostered before it is worked. It is
//               the office's to notice and stop.
//
// SO NOTHING HERE MAY EVER REACH PAY OR A SIGNED SHEET. A premium is money the
// employee is owed and it belongs on the document they sign. A compliance
// finding is a management problem about how the schedule was built, and putting
// it in front of the person who worked it asks them to attest to somebody
// else's decision. These figures are admin-screen only, by construction: no
// caller of this file touches premiums, totals or `renderCorrected`.
//
// READ OFF THE ROSTER, NOT THE PUNCHES. The timesheet is generated FROM the
// schedule, so the rostered block is the booking, and `scheduleCheck.byDate`
// holds every one of them per person per date - 4498 across 07/16-08/31. The
// rest report only knows about shifts somebody recorded a break on, which is
// 1012 of them, so counting there would have missed more than half.
import { blockService, blockClient, overlapInfo, RANGE, toMin } from "./schedule-overlap.js";

// THE CAP, AND THE TWO SERVICES IT APPLIES TO. Mánu 2026-08-22: "they cant have
// anything over 3.5 hours (for ILS Service and Self Determination)."
//
// By NAME and not by "is it a client booking", because ILS Admin, Travel,
// Training and Misc are none of them capped and two of them routinely run
// longer. Matched on a prefix so "Self Determination Program" - QSP's own
// spelling, 33 rostered blocks - is covered without hard-coding the noun.
export const CAP_MINUTES = 3.5 * 60;
export const CAPPED_SERVICES = /^(ILS Service|Self Determination)/i;

export const isCappedService = (service) => CAPPED_SERVICES.test(String(service || "").trim());

export const COMPLIANCE_KINDS = {
  "booking-over-cap": {
    label: "Booking longer than 3.5 hours",
    // what the office does about it, which is the only reason it is on a screen
    action: "Split the booking or re-authorise it before the next period is built.",
    describe: (f) =>
      `${hrs(f.minutes)} on one ${f.service} booking${f.client ? ` for ${f.client}` : ""}`,
  },
  "blocks-overlap": {
    label: "Two blocks rostered over each other",
    action: "Fix the overlap in QuickSolve - every overlapping minute bills twice.",
    describe: (f) => `${f.subject} overlap by ${f.minutes} minutes`,
  },
};

const hrs = (min) => `${(Math.round((min / 60) * 100) / 100).toFixed(2)} hours`;

// how long a rostered block runs. `minutes` is stored on the block by
// compareToSchedule; the times in its own text are the fallback for a block
// that predates that field, and disagreeing with the stored value is not
// possible because both are read off the same string.
function blockMinutes(shift) {
  if (Number.isFinite(shift?.minutes)) return shift.minutes;
  const m = RANGE.exec(String(shift?.text || "").trim());
  if (!m) return null;
  const a = toMin(m[1]);
  const b = toMin(m[2]);
  return a == null || b == null ? null : b - a;
}

// Every capped booking that runs past the cap, one finding per block.
//
// One finding PER BLOCK and not per day: two four-hour bookings on one day are
// two authorisations to fix, and rolling them into one line would say a day was
// wrong once when it was wrong twice.
export function overCapBookings(scheduleByDate) {
  const out = [];
  for (const [date, day] of Object.entries(scheduleByDate || {})) {
    for (const shift of day?.shifts || []) {
      const service = blockService(shift?.text);
      if (!isCappedService(service)) continue;
      const minutes = blockMinutes(shift);
      if (minutes == null || minutes <= CAP_MINUTES) continue;
      out.push({
        kind: "booking-over-cap",
        date,
        service,
        client: blockClient(shift?.text) || null,
        minutes,
        over: minutes - CAP_MINUTES,
        text: shift?.text || null,
      });
    }
  }
  return out.sort((a, b) => b.minutes - a.minutes);
}

// Days where two rostered blocks sit on top of each other. `overlapInfo` is the
// same function the checks list and the person cards already ask, so this
// cannot drift from what those say.
export function overlappingDays(scheduleByDate) {
  const out = [];
  for (const [date, day] of Object.entries(scheduleByDate || {})) {
    const info = overlapInfo(day?.shifts);
    if (!info) continue;
    out.push({ kind: "blocks-overlap", date, subject: info.subject, minutes: info.overlapMin });
  }
  return out.sort((a, b) => b.minutes - a.minutes);
}

// everything this file knows about one person's period, from their stored sheet
export function complianceFor(data) {
  const byDate = data?.scheduleCheck?.byDate || {};
  return [...overCapBookings(byDate), ...overlappingDays(byDate)];
}

// counts per kind, for a tag or a table cell
export function complianceCounts(findings) {
  const out = {};
  for (const f of findings || []) out[f.kind] = (out[f.kind] || 0) + 1;
  return out;
}

// ONE PERSON ACROSS EVERY PERIOD, which is the thing that was actually asked
// for: a single long booking is a scheduling decision, the same person carrying
// 28 of them is a pattern, and only the second one is worth a conversation.
//
// `periods` is a Set rather than a count so a person with ten in one fortnight
// reads differently from one with ten spread over five.
export function repeatsByPerson(rows) {
  const people = new Map();
  for (const { who, period, findings } of rows || []) {
    if (!people.has(who)) {
      people.set(who, { who, total: 0, byKind: {}, periods: new Set(), worst: null });
    }
    const p = people.get(who);
    for (const f of findings || []) {
      p.total++;
      p.byKind[f.kind] = (p.byKind[f.kind] || 0) + 1;
      p.periods.add(period);
      if (f.kind === "booking-over-cap" && (!p.worst || f.minutes > p.worst.minutes)) p.worst = f;
    }
  }
  return [...people.values()]
    .filter((p) => p.total > 0)
    .map((p) => ({ ...p, periods: [...p.periods] }))
    .sort((a, b) => b.total - a.total || String(a.who).localeCompare(String(b.who)));
}
