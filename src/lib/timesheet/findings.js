// EVERY FINDING ON A BATCH, AND WHO IT BELONGS TO.
//
// Mánu 2026-08-12: "anything that would come up in the corrections page should
// be tied to this. anything that comes up in the datachecks page should be tied
// to this. even if our engine resolved it."
//
// This is the checks screen's entry builder, MOVED HERE UNCHANGED. It used to
// live inside `checks/page.js`, which is why a person's own page could not show
// any of it: there was no way to ask for one person's rows without rendering the
// whole screen, so their page showed violations only and every other finding
// about them was invisible there. Uribe 07/28 reads "nothing flagged" on his own
// page while the checks list carries a card saying his rest was recorded off the
// clock - one day, two screens, opposite answers.
//
// Both screens read this now. The checks list groups and filters what comes
// back; the person page keeps the rows for one `timesheetId` and hangs them
// under the day they happened on. Neither decides for itself what a finding is.
//
// NOTHING IS FILTERED OUT HERE, including the ones the engine already settled.
// A repaired punch and a rest the schedule explains still come back, in the
// `settled` group, because "we looked at this and it was fine" is the answer
// somebody needs when they are on the phone about it.
import { restKey, restNameFor, clockMin, countsAsTaken, FULL_REST_MIN } from "./rests.js";
import { workedBeforeMin, RULES } from "./parse.js";
import { describePunchIssue, scheduledPaidHours } from "./anomalies.js";
import { blockTimes, serviceOf, clientOf } from "./schedule.js";

// minutes past midnight -> "12:10a", the short form every sheet prints
const shortClock = (min) => {
  const h24 = Math.floor(min / 60);
  const mm = min % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${h24 < 12 ? "a" : "p"}`;
};
// the Comments Details block, split back into the days it is about
import { notesFor } from "./comments.js";
import { drawnRest } from "./recorded-breaks.js";
import { violationsFor } from "./violations.js";
import { RANGE, toMin, overlapInfo } from "./schedule-overlap.js";

// THE TWO WAYS TO PUT IT RIGHT AT SOURCE, from Mánu 2026-08-12. The cards only
// ever named the first one.
//
// These stay ANOMALIES. He ruled them "violations to wrong scheduling" and then
// withdrew it the moment he read the card back: "we can just leave it an an
// anomaly since it already does what we are talking about." He is right - the
// break already counts as taken, no premium is charged and no minutes are added,
// which is the whole of the ruling. Only the second remedy was actually missing.
const QSP_REMEDY =
  `Worth correcting in QSP, either by moving the rest into the shift they actually ` +
  `took it in, or by changing that time to Misc time with its own rest period in ` +
  `and out against it.`;

const f2 = (n) => (n == null ? "-" : (Math.round(n * 100) / 100).toFixed(2));

// the hours the day pays beyond the time somebody was actually on site: first
// booking to last, less any rostered meal. That difference IS the double-billed
// time, and it is the number worth putting in front of a person.
function billedOver(shifts, paidHours) {
  const r = (shifts || [])
    .map((sh) => {
      const m = RANGE.exec(String(sh.text || "").trim());
      return m ? { a: toMin(m[1]), b: toMin(m[2]), meal: !!sh.meal, min: sh.minutes || 0 } : null;
    })
    .filter((x) => x && x.a != null && x.b != null);
  const work = r.filter((x) => !x.meal);
  if (!work.length || paidHours == null) return null;
  const lo = Math.min(...work.map((x) => x.a));
  const hi = Math.max(...work.map((x) => x.b));
  const mealMin = r.filter((x) => x.meal).reduce((n, x) => n + x.min, 0);
  const onSite = (hi - lo - mealMin) / 60;
  return { onSite, over: paidHours - onSite };
}

// The findings that are not about a single day, so they get no row.
//
// Every figure here is a query over what the batch already stored - nothing is
// re-parsed and no source file is fetched. That is only possible because
// `day.printed` carries QSP's own printed overtime alongside its daily total;
// summing it per person reproduces the payroll report's overtime column exactly
// (verified against all four disagreements on 07/16-07/31), which is what
// One row per DAY, not per person. This screen used to be a card per employee
// with every flag inside it at equal weight, so on this period the 3 days that
// actually need somebody sat inside 55 that mostly do not. What a person
// opening this screen wants to know is "what do I have to do", and that is a
// property of a day, not of an employee.
//
// Every headline carries a figure AND what is known about it. "reads 9.00 hrs"
// on its own invites the obvious question: as opposed to what?
function describePunchRow(p, ctx = {}) {
  const t = p.say?.tone;

  // an overlap the schedule accounts for is not a problem with the punches
  if (ctx.overlapping) {
    // EVERY OVERLAP IS A FINDING, whether or not it costs a premium hour.
    //
    // This had a "costs nothing" branch that filed a seven minute overlap under
    // no-action, on the reasoning that the day's hours came out right anyway.
    // That is the wrong test, and Mánu 2026-08-12 said why: "the anomaly should
    // find issues with the schedule for us to essentially notify the employees
    // of the wrongdoings with their scheduling. there is no office for people to
    // come into. Everyone is in the field going to see their clients, and we
    // don't have people as we should watching over every clock in and out. So
    // that's why I'm building this to show the anomalies, to show what is going
    // unnoticed."
    //
    // Two bookings billed over each other is a scheduling fault on its own. What
    // it costs in premium hours is a separate question and sometimes the answer
    // is nothing - that does not make it not a fault, it makes it a cheap one.
    //
    // THE HEADLINE IS THE OVERLAP, not the day's total. "7.89 hrs" is the figure
    // the day pays and has nothing to do with the finding; the finding is that
    // seven minutes were sold twice.
    const mins = ctx.overlapping.overlapMin || 0;
    const over = ctx.billed?.over ?? null;
    const costly = over != null && over >= 0.05;
    return {
      group: "decide",
      head: mins >= 60
        ? `${f2(mins / 60)} hrs overlapped`
        : `${mins} min overlapped`,
      tone: "text-rose-700 dark:text-rose-400",
      lead:
        `${ctx.overlapping.subject} are booked at the same time for ${mins} minutes, and QSP bills both in full. `
        + (costly
          ? `The day pays ${f2(p.hoursNow)} hrs against ${f2(ctx.billed.onSite)} hrs between the first booking and the last, so ${f2(over)} hrs is paid twice. `
          : "")
        + `The punches cannot show two things at once, so they read oddly - that part needs no repair. `
        + `The scheduling does.`,
    };
  }

  if (t === "human") {
    return {
      group: "decide",
      head: `${f2(p.hoursNow)} hrs, not settled`,
      tone: "text-rose-700 dark:text-rose-400",
      lead:
        "The punches contradict themselves, no single swap puts them back in order, and the schedule does not settle it either. The day could land above or below this figure once somebody reads the source.",
    };
  }
  if (t === "settled") {
    return {
      group: "settled",
      head: `${f2(p.say.hours)} hrs, confirmed`,
      tone: "text-emerald-700 dark:text-emerald-400",
      lead: `The punches contradict themselves, but the schedule this timesheet was built from independently says ${f2(p.say.hours)} hrs, so the total is not in question. Worth correcting in QSP so the next export is clean.`,
    };
  }
  if (t === "inert") {
    return {
      group: "settled",
      head: `${f2(p.say.hours)} hrs either way`,
      tone: "text-muted",
      lead:
        "A repair is available and it moves neither the hours nor the premiums, so nothing on this sheet turns on it. Worth correcting in QSP, but there is nothing to decide.",
    };
  }
  // A SUGGESTION, not something that happened. This said "Repaired... which is
  // the only reason it was applied", which was untrue on every count and was
  // inviting somebody to accept a cut of nearly six hours.
  const applied = !!ctx.wasApplied;
  const cuts = (p.say.hours ?? 0) < (p.say.was ?? 0) - 0.005;
  return {
    group: "settled",
    head: applied ? `${f2(p.say.was)} → ${f2(p.say.hours)} hrs` : `${f2(p.hoursNow)} hrs as it stands`,
    tone: applied ? "text-emerald-700 dark:text-emerald-400" : "text-muted",
    lead: applied
      ? `Repaired: ${(p.say.applied || []).join("; ") || "punches reordered"}. Applied because the schedule independently agrees with the repaired figure.`
      : `A possible repair was found (${(p.say.applied || []).join("; ") || "punches reordered"}). It would make the day ${f2(p.say.hours)} hrs instead of ${f2(p.say.was)}${cuts ? ", which is less" : ""}. It has not been applied and nothing here has changed the pay.`,
  };
}

function describeFlagRow(f) {
  if (f.timesheet == null) {
    return {
      group: "unworked",
      head: "pays 0.00",
      tone: "text-amber-700 dark:text-amber-400",
      lead: `The schedule has ${f2(f.schedule)} hrs for this day and the timesheet has no punches at all, so the corrected sheet pays nothing for it. Somebody has to ask whether they worked it.`,
    };
  }
  if (f.schedule == null) {
    return {
      group: "settled",
      head: `${f2(f.timesheet)} hrs worked`,
      tone: "text-muted",
      lead:
        "Worked, but the schedule has nothing for this day. The timesheet is the record we pay from, so this is context rather than a problem.",
    };
  }
  return {
    group: "settled",
    head: `${f2(f.timesheet)} worked, ${f2(f.schedule)} scheduled`,
    tone: "text-muted",
    lead:
      "People work hours other than the ones they were scheduled. The timesheet is the record we pay from, so this never moves a figure. It is here as context.",
  };
}

// One row of the Rest Periods Report, placed in the same four groups as
// everything else on this screen.
//
// The three that carry a proposed fix are the only ones that need a decision:
// accepting one REMOVES a rest premium, so it is somebody's call and not ours.
// The four with nothing to propose keep their premium either way - the engine
// already errs towards paying - so they are an anomaly to go and correct in
// QSP rather than a decision. The eleven we flipped are settled, and shown so
// the repair can be audited rather than taken on trust.
// THE VERDICT COMES FROM `countsAsTaken`, AND THE SENTENCE FROM `kind`.
//
// This read `r.counted` and then assumed the counted case was always an
// over-ten, which was true when only an 11-15 minute row could count. Since
// 2026-08-12 a row that EXISTS is a break that happened whatever its length, so
// `counted` covers no-times, short, too-long and repaired as well - and every
// one of them printed "Longer than the ten minutes a paid rest period allows".
// Flores 07/29 records no times at all and was being told her break ran long.
//
// `countsAsTaken` rather than `r.counted` for the same reason `recordedBreaksFor`
// and the employee's own page use it: `batch.restsByDate` is stored at upload,
// so a batch parsed before the rule changed still carries the old verdicts. The
// three rows on this batch that read "probably a mis-pick" are exactly that.
//
// `mealScheduled` is the stored day's, and it is passed in because the row alone
// cannot answer the question the meal branch below asks. `isMealLengthRest` is a
// LENGTH test - it knows nothing about the roster - while whether the row is
// actually drawn as the lunch depends on the day having no lunch of its own
// (`recordedBreaksFor`). Hatt 07/20 is sixty minutes with her lunch rostered and
// taken at noon, so "the schedule rosters no lunch that day" was false on the
// one row it was written for.
function describeRestRow(r, mealScheduled) {
  const len = r.minutes == null ? "no times" : `${r.minutes} min`;
  const anomaly = (head, lead) => ({
    group: "anomaly", head, tone: "text-violet-700 dark:text-violet-300", lead,
  });
  const settled = (head, lead) => ({ group: "settled", head, tone: "text-muted", lead });

  // THE ONE ROW IN THE REPORT THAT DOES NOT COUNT, checked first so everything
  // below can say "it counts" without qualifying it. A meal-length row on a day
  // with no rostered lunch is being read as the LUNCH instead - counting it here
  // as well would let one entry clear two different violations.
  if (!countsAsTaken(r)) {
    return anomaly(
      `${len}, too long to be a rest`,
      `QSP reads ${r.derivation}, which is the length of a meal rather than a rest, so it is not ` +
      `counted as a rest taken. ` +
      (mealScheduled === true
        ? `The schedule already rosters a lunch that day, so this row is not it either - it ` +
          `counts as neither, and the sheet leaves it uncoloured.`
        : mealScheduled === false
          ? `The schedule rosters no lunch that day, so it is being read as the lunch and drawn ` +
            `as one on the sheet, striped, for the employee to confirm.`
          : `No schedule covers that day, so whether it was the lunch is unanswerable from what ` +
            `we hold.`) +
      ` Moving the meal premium is a person's call rather than a threshold's, which is why it is here.`,
    );
  }

  // A REPAIR IS APPLIED, NOT OFFERED. It used to be a decision for whoever read
  // this screen, because accepting it removed a premium; since 2026-08-12 the
  // engine applies it and the EMPLOYEE confirms it on their own sheet. Read off
  // `r.repair` and not off `r.kind`, so a row stored under the old kind
  // ("too-long", with a repair hanging off it) lands here too.
  if (r.repair) {
    return settled(
      `${len}, one time mis-picked`,
      `QSP reads ${r.derivation}, which is not a rest break. One field explains it: ` +
      `${r.repair.why}, so ${r.repair.from} should be ${r.repair.to} - a normal ` +
      `${r.repair.minutes} minute break. That correction is applied and the break counts. The ` +
      `employee is asked to confirm it on their own sheet, so nothing here needs you.`,
    );
  }

  if (r.reversed) {
    return settled(
      "read as a normal rest",
      `QSP has the out and in times the wrong way round, so its own total reads ${r.derivation}. ` +
      `Flipped, it is a ${r.minutes} minute break like any other, and it counts as one.`,
    );
  }

  switch (r.kind) {
    case "no-times":
      return anomaly(
        "no times recorded",
        `The report files a break against this shift and holds neither end of it. It counts as ` +
        `taken - somebody opened the break screen and logged it, and the times are what did not ` +
        `survive - so the day owes no premium for it. The sheet draws it inside the shift with ` +
        `the times as ???, and the entry is worth fixing in QSP.`,
      );
    case "short":
      return anomaly(
        `${len}, under ten`,
        `Shorter than the ten minutes California requires. It counts as a full ten taken: a ` +
        `${r.minutes} minute row is a mistyped time rather than a ${r.minutes} minute break, and ` +
        `crediting ${r.minutes} would invent a shortfall out of the same typo. Worth correcting ` +
        `in QSP so the next period reads properly.`,
      );
    case "too-long":
      return anomaly(
        `${len}, over the limit`,
        `Too long to be a rest period, and no single mis-picked field explains it. It still ` +
        `counts as a ${FULL_REST_MIN} minute break taken - the length is a typing mistake, not an ` +
        `absence - so the day owes no premium. The entry should be corrected in QSP.`,
      );
    case "over-ten":
      return anomaly(
        `${len}, counted`,
        `Longer than the ten minutes a paid rest period allows. It counts and owes nothing, but ` +
        `it is worth knowing about - fifteen minutes is one and a half times the entitlement.`,
      );
    default:
      return anomaly(
        `${len}, counted`,
        `The report records this break and it counts as taken. It is here because QSP wrote ` +
        `something worth a second look at the row rather than at the break.`,
      );
  }
}

// Every finding on the batch, with the day pictures the rows draw.
// `batch` must come with its `timesheets` included.
export function buildFindings(batch) {
  const entries = [];
  let anySchedule = false;

  for (const t of batch.timesheets) {
    const sched = t.data?.scheduleCheck || { matched: false };
    if (sched.matched) anySchedule = true;
    const byDate = sched.byDate || {};
    const common = {
      timesheetId: t.id,
      // WHO THIS IS, IN A WAY THAT OUTLIVES THE UPLOAD.
      //
      // `timesheetId` is remade by every upload, so anything keyed on it dies
      // the next morning - 70 marks did exactly that when the 08/12 export
      // landed on top of the 08/09 one. `userId` is the same value across all
      // four batches on all 239 sheets, so it is what a mark hangs off.
      //
      // Nullable on purpose. An unmatched sheet has no account behind it, and a
      // null here has to stay null rather than quietly becoming somebody.
      personKey: t.userId ?? null,
      // the export's own spelling, "Martinez, Jose", NOT the portal's preferred
      // name. this screen audits our figures against the source documents and
      // every other column on it quotes those documents, so the name has to be
      // the one a reader can find in the PDF. it also keeps the list in last
      // name order, the way the batch list and the signed sheet already read.
      who: t.sourceName,
      signed: !!t.signedAt,
      overrides: t.overrides || {},
      dayByDate: Object.fromEntries((t.data?.days || []).map((d) => [d.date, d])),
      dayHours: Object.fromEntries((t.data?.days || []).map((d) => [d.date, d.paidHours])),
      byDate,
    };

    for (const p of t.data?.punchIssues || []) {
      const schedDay = byDate[p.date];
      const withSay = { ...p, say: describePunchIssue(p, scheduledPaidHours(schedDay)) };
      // NOT A PUNCH FAULT, SO NOT IN THE PUNCH PILE. Her punches are exactly
      // what QSP wrote, and the thing worth looking at is two bookings sold
      // over each other. Only genuine punch faults stay under that heading.
      //
      // Lifted out of the object because the KEY needs it too, and computing it
      // twice is how a row ends up filed under one heading and keyed under
      // another.
      const kind = overlapInfo(schedDay?.shifts) ? "overlap" : "punch";
      entries.push({
        ...common,
        kind,
        // THESE TWO ROWS HAD NO KEY AT ALL until now, and the checks page was
        // quietly minting one for them: `e.rowKey || \`${e.timesheetId}-${e.kind}-${e.date}\``.
        // So five marks got stored in a shape nothing else uses, back to front
        // against every other row here, and grepping this file for the shape
        // would never have shown it. One place mints keys now.
        rowKey: `${kind}-${t.id}-${p.date}`,
        findingKey: `${kind}-${p.date}`,
        date: p.date,
        p: withSay,
        overlapping: !!overlapInfo(schedDay?.shifts),
        d: describePunchRow(withSay, {
          overlapping: overlapInfo(schedDay?.shifts),
          billed: billedOver(schedDay?.shifts, common.dayHours[p.date]),
          scheduledHours: scheduledPaidHours(schedDay),
          paidHours: common.dayHours[p.date],
          // a repair only counts as applied if the stored day actually moved to it
          wasApplied:
            withSay.say?.hours != null &&
            common.dayHours[p.date] != null &&
            Math.abs(common.dayHours[p.date] - withSay.say.hours) < 0.005,
        }),
      });
    }
    for (const f of sched.flagged || []) {
      entries.push({ ...common, kind: "flag", date: f.date, f, d: describeFlagRow(f) });
    }
  }

  // Rows of the Rest Periods Report worth a person's attention. These belong to
  // the BATCH rather than to a timesheet - the report is one document - so they
  // are matched back to a person by name for display only.
  //
  // KEYED ON THE REPORT'S OWN SPELLING, not the timesheet's. QSP files "Delgado
  // Pineda, Ruth" under "Delgado Pineda, Angel" here, so every one of her rows
  // came back unmatched: her cards said "The Rest Periods Report records on a
  // day worked 4 hours" with the times missing, and her day view drew no rest at
  // all. `restNameFor` reads back the spelling upload matched through her portal
  // account - nothing is scored on this screen. See `restNameFor`.
  const restByName = new Map(
    batch.timesheets.map((t) => [restKey(restNameFor(t.sourceName, t.data)), t]),
  );
  for (const r of (batch.restsByDate || []).filter((x) => x.kind)) {
    const t = restByName.get(restKey(r.name));
    entries.push({
      // the real sheet, so "Open their sheet" works. rest rows are keyed on the
      // report row rather than the sheet, since one person can contribute
      // several - Zuchniak has eight.
      timesheetId: t?.id || null,
      rowKey: `rest-${restKey(r.name)}-${r.date}-${r.out || "x"}`,
      // the person comes off the MATCHED sheet, not the report's spelling -
      // `restNameFor` is what finds Delgado Pineda, Ruth under "Angel", and
      // without it three of her rows resolve to nobody
      personKey: t?.userId ?? null,
      findingKey: `rest-${r.date}-${r.out || "x"}`,
      // same rule as above. an unmatched row keeps the report's own spelling,
      // because that is the only name the document actually carries.
      who: t ? t.sourceName : r.name,
      signed: false,
      overrides: {},
      dayByDate: {},
      dayHours: {},
      byDate: {},
      kind: "rest",
      date: r.date,
      r,
      // the stored day's own answer about whether a lunch was rostered, which is
      // what decides whether a meal-length row is being read as the lunch
      d: describeRestRow(r, (t?.data?.days || []).find((x) => x.date === r.date)?.mealScheduled),
    });
  }

  // The report filed a rest against a shift it does not fall inside. Aranda
  // 07/16 has one at 3:00-3:10 PM hung on a 1:00-2:30 PM shift; she was working
  // 2:30-5:00, so the break happened, was paid, and counts. The ROW is wrong,
  // not the break, and saying so is the whole point of this group - it would
  // otherwise read as somebody skipping a rest.
  // which punch pair the rest actually happened in, in the sheet's own words.
  // "it happened during the 9a-11:30a booking" is the fact that makes a misfiled
  // row obvious; without it the reader has to go and work it out.
  const segmentAround = (day, out, inn) => {
    const p = day?.punches || [];
    for (let i = 0; i + 1 < p.length; i += 2) {
      if (p[i].min <= out && p[i + 1].min >= inn) return `${p[i].raw} to ${p[i + 1].raw}`;
    }
    return null;
  };

  for (const r of (batch.restsByDate || []).filter((x) => x.offOwnShift)) {
    const t = restByName.get(restKey(r.name));
    const day = (t?.data?.days || []).find((x) => x.date === r.date);
    const seg = day ? segmentAround(day, clockMin(r.out), clockMin(r.in)) : null;
    entries.push({
      timesheetId: t?.id || null,
      rowKey: `rest-offshift-${restKey(r.name)}-${r.date}-${r.out || "x"}`,
      personKey: t?.userId ?? null,
      findingKey: `rest-offshift-${r.date}-${r.out || "x"}`,
      who: t ? t.sourceName : r.name,
      signed: false,
      overrides: {},
      dayByDate: {},
      dayHours: {},
      byDate: {},
      kind: "rest-off-shift",
      date: r.date,
      d: {
        group: "anomaly",
        head: "filed against the wrong shift",
        tone: "text-violet-700 dark:text-violet-300",
        lead:
          `The report files this rest at ${r.out} to ${r.in} under a shift of ${r.shift}, which it ` +
          `does not fall inside. ` +
          (seg
            ? `It happened during the ${seg} booking instead, so it was paid and it counts: this ` +
              `day reads ${day.restTaken} of ${day.restRequired} rests. The row is misfiled, not ` +
              `the break. `
            : day
              // NOT IN A WORKED STRETCH IS NO LONGER A REASON IT DOES NOT COUNT.
              // This said "it falls in no paid stretch of the day either, so it
              // has not been counted", which was the rule until 2026-08-09.
              // Whether it counts is `countsAsTaken` and nothing else, so the
              // only row that reaches the second sentence is a meal-length one,
              // and it says why in its own terms.
              ? (countsAsTaken(r)
                  ? `It falls in no stretch the punches have them working either. It still counts ` +
                    `as taken, so the day is charged no rest premium: this day reads ` +
                    `${day.restTaken} of ${day.restRequired} rests. The minutes are not added to ` +
                    `their hours unless they confirm the break was taken there. `
                  : `It falls in no paid stretch of the day either, and at ${r.minutes} minutes it ` +
                    `is the length of a meal rather than a rest - so it does not stand as a rest ` +
                    `taken, and this day reads ${day.restTaken} of ${day.restRequired} rests. `)
              : `Whether it counts is worked out from the punches, never from the shift on this row. `) +
          QSP_REMEDY,
      },
    });
  }

  // A rest that WAS taken, but taken late.
  //
  // Flagged and never charged, on purpose. The meal deadline is statutory and
  // hard; this one is "the middle of each work period, insofar as practicable",
  // and a hard cutoff would manufacture premiums the statute does not clearly
  // require - 7 of the 13 candidates on 07/16-07/31 sat within half an hour of
  // the mark, which is the zone that wording exists to cover.
  //
  // Measured in WORKED minutes, never elapsed. A split shift with a long unpaid
  // hole makes a rest look five hours into the day when it is three hours of
  // work in, and measuring the wrong one reported 54 of these instead of 45.
  const firstRestAt = new Map(); // "restKey|date" -> earliest counted rest, in minutes
  for (const r of batch.restsByDate || []) {
    if (!r.counted || !r.date) continue;
    const out = clockMin(r.out);
    if (out == null) continue;
    const k = `${restKey(r.name)}|${r.date}`;
    const cur = firstRestAt.get(k);
    if (cur == null || out < cur) firstRestAt.set(k, out);
  }
  for (const [k, out] of firstRestAt) {
    const [name, date] = k.split("|");
    const t = restByName.get(name);
    const day = (t?.data?.days || []).find((x) => x.date === date);
    if (!day) continue;
    const worked = workedBeforeMin(day.punches, out);
    if (worked <= RULES.restWindowMin) continue;
    // A day that already owes a rest premium cannot owe a second one, so a late
    // rest there changes nothing and only adds noise to a screen used to find
    // what matters. 32 of the 45 on 07/16-07/31 were that shape. Only the days
    // that are otherwise compliant are worth a person's eyes.
    if (day.restViolation) continue;
    const over = worked - RULES.restWindowMin;
    const hrs = Math.round((worked / 60) * 10) / 10;
    entries.push({
      timesheetId: t.id,
      rowKey: `rest-late-${name}-${date}`,
      personKey: t.userId ?? null,
      findingKey: `rest-late-${date}`,
      who: t.sourceName,
      signed: !!t.signedAt,
      overrides: {},
      dayByDate: {},
      dayHours: {},
      byDate: {},
      kind: "rest-late",
      date,
      d: {
        group: "anomaly",
        head: `first rest ${over} min late`,
        tone: "text-violet-700 dark:text-violet-300",
        lead:
          `The rest was taken ${hrs} hours of work into a ${day.paidHours} hour day. A first rest ` +
          `belongs in the first four hours worked. Nothing is charged: the standard is the middle ` +
          `of each work period "insofar as practicable", not a deadline, and ${over} minutes past ` +
          `it is inside what that wording allows. Here so it can be seen if it turns out to be a ` +
          `habit or a rostering problem.`,
      },
    });
  }

  // A rest taken hard against the rostered lunch, or recorded inside it.
  //
  // Reported, never charged. The schedule cannot roster a rest period at all -
  // it holds meal breaks only - so the employer gave a standalone lunch in
  // every one of these and the break was stacked against it afterwards. Where
  // the opportunity was provided the premium is not owed.
  // the day's recorded rest windows, for quoting the actual times back. The
  // MINUTES travel with the printed text, because a row about one break has to
  // be able to pick its own out of the day's list - see `restsPlaced` below.
  //
  // `countsAsTaken` and not `r.counted`, the same rule the engine counts by and
  // the same one `describeRestRow` reads: a batch stored before 2026-08-12
  // carries verdicts that no longer hold, and quoting a break the sheet credits
  // is the whole job of this text.
  const restWindowsFor = new Map();
  for (const r of batch.restsByDate || []) {
    if (!countsAsTaken(r) || !r.date) continue;
    const out = clockMin(r.out);
    const inn = clockMin(r.in);
    if (out == null || inn == null || inn <= out) continue;
    const k = `${restKey(r.name)}|${r.date}`;
    if (!restWindowsFor.has(k)) restWindowsFor.set(k, []);
    restWindowsFor.get(k).push({ text: `${r.out} to ${r.in}`, out, in: inn });
  }
  // the REPORT's spelling of them, same as `restByName` above - matching on the
  // timesheet's own name returned nothing for the person QSP spells two ways,
  // and the card then printed a rest with no times on it.
  const windowsFor = (t, d) =>
    restWindowsFor.get(`${restKey(restNameFor(t.sourceName, t.data))}|${d.date}`) || [];
  const say = (list) => list.map((w) => w.text).join(", ");

  // WHICH OF THE DAY'S RESTS A ROW IS ACTUALLY ABOUT.
  //
  // This used to quote every rest the report held for the day, on every row, so
  // a card about one ten minute break printed both of the day's breaks and the
  // sentence around it described them all the same way. Jones 07/28 records two
  // and only one is in the lunch.
  //
  // The stored day keeps its punches, so the engine's own predicates are
  // reproduced here rather than approximated: `outside` is `outsideShift` from
  // analyzeDay - before the first punch or after the last - and `inGap` is
  // `unpaidRest`, wholly inside a punched-OUT pair. Same arithmetic, same
  // answers, so the times a row quotes are the times it counted.
  //
  // Falling back to the whole list when a bucket comes back empty: a stored day
  // from before punches were kept would otherwise quote nothing at all, and a
  // row with no times on it is worse than one with too many.
  const restsPlaced = (t, d) => {
    const all = windowsFor(t, d);
    const p = Array.isArray(d.punches) ? d.punches : [];
    const mins = p.map((x) => x.min);
    const lo = mins.length ? Math.min(...mins) : null;
    const hi = mins.length ? Math.max(...mins) : null;
    const outside = (w) => lo != null && (w.out < lo || w.in > hi);
    const inGap = (w) => {
      for (let i = 1; i + 1 < mins.length; i += 2) {
        if (mins[i] <= w.out && mins[i + 1] >= w.in) return true;
      }
      return false;
    };
    const off = all.filter((w) => !outside(w) && inGap(w));
    const beyond = all.filter(outside);
    return {
      all,
      offClock: off.length ? off : all,
      outsideShift: beyond.length ? beyond : all,
    };
  };
  const restRow = (t, d, key, head, lead) => ({
    timesheetId: t.id,
    rowKey: `${key}-${t.id}-${d.date}`,
    personKey: t.userId ?? null,
    findingKey: `${key}-${d.date}`,
    who: t.sourceName,
    signed: !!t.signedAt,
    overrides: {},
    dayByDate: {},
    dayHours: {},
    byDate: {},
    kind: key,
    date: d.date,
    d: { group: "anomaly", head, tone: "text-violet-700 dark:text-violet-300", lead },
  });

  // WHAT EVERY ROW'S DAY LOOKED LIKE, ready for `DayPeek` to draw on demand.
  //
  // Built here rather than in the component because `schedule.js` pulls in the
  // pdf stack and none of that belongs in a browser bundle - the same reason the
  // employee's own page reads its blocks on the server. The client is handed
  // plain {from, to, service, client, meal} and nothing else.
  //
  // THE CLIENT NAME RIDES ALONG SINCE 2026-08-26, on Mánu's ask: a day worked
  // with five people drew "ILS Service" five times over. `clientOf` is the same
  // cut `serviceOf` makes, taken from the other side of it.
  //
  // Keyed on timesheet AND date, so a rest row that matched no timesheet simply
  // finds nothing and draws no control - which is right, since there is no
  // stored day behind it to draw.
  const dayViews = new Map();
  for (const t of batch.timesheets) {
    for (const d of t.data?.days || []) {
      const blocks = [];
      for (const sh of t.data?.scheduleCheck?.byDate?.[d.date]?.shifts || []) {
        const at = blockTimes(sh.text);
        const service = serviceOf(sh.text);
        if (at && service) {
          blocks.push({ from: at.start, to: at.end, service, client: clientOf(sh.text), meal: !!sh.meal });
        }
      }
      // EVERY ROW THE REPORT HOLDS FOR THIS DAY, drawn as `drawnRest` says.
      //
      // Not `windowsFor`, which is filtered to the rows that COUNT and keyed on
      // `in > out` - between them those two dropped exactly the rows the cards
      // above are about: a repaired row reads backwards until the repair is
      // applied, and a meal-length row never counts. Both drew nothing at all.
      //
      // AS THE DOCUMENT HOLDS IT, ALWAYS - NO ANSWERS APPLIED HERE. Mánu
      // 2026-08-12: "make sure the calendar view from the data checks is always
      // as they put it so we can see the issue there at all times." The
      // employee's own calendar moves when they answer; this one is the audit
      // picture and must keep showing what QSP recorded, or the screen for
      // checking the source data stops showing the source data. Do not thread
      // answers or overrides into this list.
      const drawn = [];
      for (const row of batch.restsByDate || []) {
        if (row.date !== d.date || restKey(row.name) !== restKey(restNameFor(t.sourceName, t.data))) continue;
        const at = drawnRest(row, { mealScheduled: d.mealScheduled });
        if (at) drawn.push(at);
      }
      dayViews.set(`${t.id}|${d.date}`, {
        // THE THREE FIELDS THE CALENDAR READS, not the whole stored day.
        // `shiftsOf` wants punches, `dayWindow` wants breaks, and the axis is
        // labelled with the date. Handing over `d` cost about 300KB of RSC
        // payload across 120 rows and shipped every hour, premium and violation
        // on the day to a browser that draws none of them.
        // `miscBreaks` rides along because the calendar labels a short Misc
        // block "Misc Break" and says when no rest period was filed for it.
        // It is four small objects on the days that have any and absent on
        // the rest, so it does not undo the trimming this payload exists for.
        day: { date: d.date, punches: d.punches || [], breaks: d.breaks || [], miscBreaks: d.miscBreaks || [] },
        rests: drawn,
        scheduled: blocks,
        // what they wrote about this day on the timesheet itself. Read here
        // with everything else the row needs, so the component stays a
        // component - and only the admin screens mount it.
        notes: notesFor(t.data?.comments, d.date),
      });
    }
  }

  for (const t of batch.timesheets) {
    for (const d of t.data?.days || []) {
      // A rest logged before clock-in or after clock-out. It was not a rest
      // taken during work, and it STILL COUNTS - Mánu's call was to surface it
      // rather than move premiums on the engine's say-so. Which makes saying it
      // plainly the whole job of this row.
      //
      // WHETHER THE MINUTES REACHED PAY IS READ, NEVER ASSERTED. `addedHours` is
      // set to the amount added when the employee has confirmed the break and to
      // zero otherwise (see `offClockConfirmed` in parse.js), so it is the only
      // thing that can answer this - and it answers it per day, which a sentence
      // written once cannot. Both of the cards below said flatly that the
      // minutes were paid, which was the rule until 2026-08-12 and has been
      // wrong on every card since. Nobody has confirmed one yet on either live
      // batch, so today the second branch is the whole of it; the first exists
      // so the first confirmation does not make these cards lie the other way.
      const addedOnDay = (d.addedHours || 0) > 0;
      if (d.restsOutsideShift) {
        entries.push(restRow(t, d, "rest-outside",
          d.restsOutsideShift === 1 ? "a rest logged outside the shift" : `${d.restsOutsideShift} rests logged outside the shift`,
          `The Rest Periods Report records ${say(restsPlaced(t, d).outsideShift)} on a day worked ` +
          `${d.workedMin ? Math.round((d.workedMin / 60) * 100) / 100 : d.paidHours} hours. ` +
          `A break before clock-in or after clock-out is not paid time - most often it is a default ` +
          `nobody changed rather than anything that happened. It still counts as a rest taken: this ` +
          `day reads ${d.restTaken} of ${d.restRequired}` +
          `${d.restViolation ? " and owes a premium for other reasons" : ""}, so no rest premium is ` +
          `charged for it - the report says the break happened, and the premium is for one that did ` +
          `not. ` +
          (addedOnDay
            ? `They have confirmed they took it then, so the ${f2(d.addedHours)} hrs are in their hours. `
            : `Nothing is added to their hours. A rest period is paid time because it happens on the ` +
              `clock, so an entry outside every shift is read as a time typed wrong until the ` +
              `employee confirms they took it there, and they are asked on their own sheet. `) +
          QSP_REMEDY));
      }
      // A rest that fell inside a punched-out gap. Paid time that went unpaid -
      // and since 2026-08-09 the fix is to pay the minutes, not to charge the
      // day a premium for a break the report says was taken.
      //
      // A REST INSIDE THE ROSTERED LUNCH IS ONE OF THESE, NOT A SECOND FINDING.
      // `restsInsideMeal` used to get a card of its own, and on 07/16-07/31 all
      // four of them were also punched-out-gap rests - Aranda 07/29, Hernadez
      // 07/30, Jones 07/28, Lazo 07/30 - so the same ten minutes was told to
      // somebody twice under two headings. The lunch is WHY the rest was off the
      // clock, so it belongs in this sentence rather than in another card.
      //
      // Both conditions, because the two are not identical by construction:
      // `restsUnpaid` is read off the PUNCHES and `restsInsideMeal` off the
      // ROSTER, so a day somebody never punched out of its rostered lunch has
      // the second without the first. `where` says which sentence to print.
      if (d.restsUnpaid || d.restsInsideMeal) {
        const inLunch = !!d.restsInsideMeal;
        const n = Math.max(d.restsUnpaid || 0, d.restsInsideMeal || 0);
        // ONLY THE RESTS THIS ROW IS ABOUT, so the lunch clause is attached to
        // the times it is actually true of. Jones 07/28 records two rests, one
        // of them in the lunch, and quoting the day's whole list said both were.
        //
        // `restsInsideMeal` is roster-derived and this list is punch-derived, so
        // they can still disagree about HOW MANY - the clause below covers that
        // rather than assuming they line up.
        const placed = restsPlaced(t, d).offClock;
        const times = say(placed);
        const lunchAll = inLunch && d.restsInsideMeal >= placed.length;
        const where =
          `The report records a rest at ${times}, and the punches have them off the clock across ` +
          `it. ` +
          (lunchAll
            ? `That is the lunch the schedule rostered: a rest period is paid time and a meal ` +
              `period is unpaid, so most often this is part of the lunch that got logged as a break. `
            : inLunch
              ? `${d.restsInsideMeal} of them sat inside the lunch the schedule rostered - a rest ` +
                `period is paid time and a meal period is unpaid, so most often that is part of ` +
                `the lunch that got logged as a break. `
              : `A rest period is paid time, so those minutes should have been on the clock and ` +
                `were not. `);
        entries.push(restRow(t, d, "rest-unpaid",
          n === 1 ? "a rest recorded off the clock" : `${n} rests recorded off the clock`,
          where +
          `It still counts as a rest taken - this day reads ${d.restTaken} of ` +
          `${d.restRequired}${d.restViolation ? " and owes a premium for other reasons" : ""} - so ` +
          `the day is charged no rest premium for it: the break happened, and the premium is for ` +
          `one that did not. ` +
          (addedOnDay
            ? `They have confirmed they took it then, so the ${f2(d.addedHours)} hrs are in their hours. `
            : `The minutes are not added to their hours either. They were off the clock for them, ` +
              `and the engine adds them only once the employee confirms the break was taken there, ` +
              `which is asked on their own sheet. `) +
          (inLunch
            ? `The opportunity to take a ten always exists here, so this was not one the employer ` +
              `failed to provide. `
            : ``) +
          QSP_REMEDY));
      }
      // A "MEAL BREAK" THE ROSTER BOOKED AT REST LENGTH, CREDITED AS A REST.
      //
      // Mánu 2026-08-26, looking for Bucio's midnight ten on the calendar:
      // "where is that midnight 10? i dont see it." Nothing drew it, because
      // no punch goes near it - and nothing said it existed either, while it
      // was quietly supplying the "1 of 2 recorded" on her rest line.
      //
      // The employee is already asked to confirm it (`shortMealRest` - "we read
      // a meal block as your rest break, is that right?"). This is the reviewer
      // half of the same fact, which was missing.
      //
      // AN ANOMALY, NOT A VIOLATION. The credit stands; the day is only owed a
      // premium if the rest count still falls short, and that has its own row.
      if (d.restsFromShortMeals > 0) {
        const blocks = (t.data?.scheduleCheck?.byDate?.[d.date]?.shifts || [])
          .filter((sh) => sh.meal)
          .map((sh) => ({ sh, at: blockTimes(sh.text) }))
          .filter((x) => x.at && x.at.end - x.at.start > 0 && x.at.end - x.at.start <= 15);
        const where = blocks.map((x) => `${shortClock(x.at.start)}-${shortClock(x.at.end)}`).join(", ");
        entries.push({
          timesheetId: t.id,
          rowKey: `meal-as-rest-${t.id}-${d.date}`,
          personKey: t.userId ?? null,
          findingKey: `meal-as-rest-${d.date}`,
          who: t.sourceName,
          signed: !!t.signedAt,
          overrides: {},
          dayByDate: {},
          dayHours: {},
          byDate: {},
          kind: "meal-as-rest",
          date: d.date,
          d: {
            group: "anomaly",
            head: d.restsFromShortMeals === 1
              ? "a meal block counted as a rest"
              : `${d.restsFromShortMeals} meal blocks counted as rests`,
            tone: "text-violet-700 dark:text-violet-300",
            lead:
              `The schedule books ${where || "a meal break"} as a Meal Break, which is rest length `
              + `rather than meal length. It is counted as a rest period, which is where `
              + `${d.restTaken} of ${d.restRequired} on this day comes from. Nothing is charged for `
              + `it. It is worth correcting in QSP so the block says what it is, and it does not `
              + `stand in for the meal - a day still owes a lawful thirty somewhere else.`,
          },
        });
      }
      if (!d.restTackedOn) continue;
      entries.push({
        timesheetId: t.id,
        rowKey: `rest-tacked-${t.id}-${d.date}`,
        personKey: t.userId ?? null,
        findingKey: `rest-tacked-${d.date}`,
        who: t.sourceName,
        signed: !!t.signedAt,
        overrides: {},
        dayByDate: {},
        dayHours: {},
        byDate: {},
        kind: "rest-tacked",
        date: d.date,
        d: {
          group: "anomaly",
          head: d.restTackedOn === 1 ? "a rest against the lunch" : `${d.restTackedOn} rests against the lunch`,
          tone: "text-violet-700 dark:text-violet-300",
          lead:
            `The Rest Periods Report puts a rest break up against the rostered lunch, or inside it. ` +
            `Ten minutes butted onto a thirty minute lunch is one long break rather than a lunch and ` +
            `a rest, and a rest recorded inside the lunch usually means part of the lunch was logged ` +
            `as one. Nothing is charged: the schedule cannot roster a rest period at all, so the lunch ` +
            `they were given was a standalone one and this happened alongside it. Worth a word if it ` +
            `is somebody's habit.`,
        },
      });
    }
  }

  // ONE ROW PER PERSON, NOT PER DAY - the only group on this screen that works
  // that way, and on purpose.
  //
  // Mánu 2026-08-12: the screen is for two people to go down a list and tell
  // somebody to fix it in QuickSolve. That makes the unit of work a PERSON. Per
  // day it came to 118 cards on this batch, two thirds of them the same names
  // repeating - Aranda alone had five identical ones - and you do not have five
  // conversations with her about five days.
  //
  // The day detail is not lost, it moves to her own page. Nothing here is a
  // second definition of a violation: `violationsFor` is the only thing that
  // decides, and the person page reads the same function.
  for (const t of batch.timesheets) {
    const v = violationsFor(t.data);
    if (!v.total) continue;
    entries.push({
      timesheetId: t.id,
      rowKey: `person-${t.id}`,
      // the whole-person card. no date, no kind - there is one per person and
      // "person" is the whole of what identifies it once the id is gone.
      personKey: t.userId ?? null,
      findingKey: "person",
      who: t.sourceName,
      signed: !!t.signedAt,
      overrides: {},
      dayByDate: {},
      dayHours: {},
      byDate: {},
      kind: "violation",
      // no date: the row is about a person across the period, so quoting one
      // day's date on it would be picking one of five arbitrarily
      date: null,
      v,
      d: {
        group: "violation",
        head: `${v.total} to raise over ${v.dayCount} ${v.dayCount === 1 ? "day" : "days"}`,
        tone: "text-fuchsia-700 dark:text-fuchsia-300",
        lead: null,
      },
    });
  }

  return { entries, dayViews, anySchedule };
}

// What each row is ABOUT, so a list can be grouped by it. Shared, because the
// person page groups the same rows and a second copy of these labels would be
// two names for one finding.
export const KINDS = {
  violation: { label: "Rest periods and meal periods not taken", order: 0 },
  overlap: { label: "Bookings billed over each other", order: 0 },
  punch: { label: "Punches that do not read", order: 1 },
  flag: { label: "Punches the schedule can settle", order: 2 },
  rest: { label: "Rest report entries that cannot be read", order: 2 },
  "rest-off-shift": { label: "Rests filed against the wrong shift", order: 3 },
  // no "rest-in-meal" - a rest inside the rostered lunch is folded into
  // "rest-unpaid" below, because it is the same ten minutes.
  "rest-outside": { label: "Rests logged outside the shift", order: 5 },
  // "never paid" was the old heading, and it prejudged the answer: the
  // minutes are not paid, and whether they should be is the employee's to
  // say. Recorded off the clock is what the finding is.
  "rest-unpaid": { label: "Rests recorded off the clock", order: 6 },
  "rest-tacked": { label: "Rests taken against the lunch", order: 7 },
  "rest-late": { label: "Rests taken late in the shift", order: 8 },
};

export const kindOf = (e) => KINDS[e.kind] || { label: "Other", order: 9 };
