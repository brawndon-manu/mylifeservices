// what an employee can tell us is wrong with their timesheet, and what
// accepting that changes.
//
// the kinds come in pairs on purpose. a break can be wrong in both directions:
// the punches show one that wasn't really taken, or one was taken that never
// got punched. those pull the premium in opposite directions, so both have to
// be sayable - otherwise the only reportable problems are the ones that happen
// to favour one side.
//
// nothing in here changes a figure on its own. an employee reporting something
// records a claim; the numbers only move when management accepts it. that's
// deliberate - these are payroll documents, and a hours figure should never
// move because of an unreviewed message.
//
// this module is deliberately free of any pdf/parse import so the timesheet review page
// can use the labels without dragging the engine into the browser bundle.
// `recomputeSheet` takes applyOvertime as an argument for the same reason.

// §226.7 pays one hour per violation, max one meal + one rest premium a day.
const PREMIUM_HOURS_PER_VIOLATION = 1;

const r2 = (n) => Math.round((n || 0) * 100) / 100;

export const CORRECTION_KINDS = {
  hours: {
    label: "The hours for this day are wrong",
    help: "The total shown doesn't match what you actually worked.",
    scope: "day",
    // they tell us what it should be; management confirms before it moves
    asksHours: true,
    hint: "How many hours should this day be?",
    hoursHelp:
      "Total time on the clock, not counting an unpaid lunch. Decimals are fine - 7 hours 30 minutes is 7.5.",
  },
  meal_missed: {
    label: "It shows a lunch, but I worked through it",
    help:
      "Your punches have a meal break on this day. Tell us if you worked through it and we will correct the record.",
    scope: "day",
    asksHours: false,
  },
  meal_taken: {
    label: "I did take my lunch, it just isn't punched",
    help:
      "This day has no meal break in the punches. Tell us if you took one and forgot to clock out, and we will correct the record.",
    scope: "day",
    asksHours: false,
    // an unpunched break exists only in the person's memory, so the claim has
    // to say WHEN - the same rule the question cards enforce ("we need a
    // record of this"), and the time is what the office keys into QuickSolve.
    asksTimes: "meal",
  },
  meal_ontime: {
    label: "I took my lunch on time, the punch is wrong",
    help:
      "Your punches put this meal after the fifth hour. Tell us if you actually went on time and the clock-out is what is wrong.",
    scope: "day",
    asksHours: false,
  },
  rest_missed: {
    label: "I didn't get my rest breaks",
    help:
      "Your punches show your rest breaks on this day. Tell us if you did not actually get them.",
    scope: "day",
    asksHours: false,
  },
  rest_taken: {
    label: "I did take my rest breaks, they just aren't punched",
    help:
      "This day is short on rest breaks in the punches. Tell us if you took them without clocking out.",
    scope: "day",
    asksHours: false,
    // same rule as the lunch: an unpunched ten needs its time on the record
    asksTimes: "rest",
  },
  day_missing: {
    label: "I worked a day that isn't listed",
    help: "A whole shift is missing from this timesheet.",
    scope: "newDay",
    asksHours: true,
    hint: "How many hours did you work that day?",
    hoursHelp:
      "Total time on the clock, not counting an unpaid lunch. Put the date in the box below so payroll knows which day.",
  },
  day_extra: {
    label: "There's a day here I didn't work",
    help: "This timesheet lists a shift that isn't mine.",
    scope: "day",
    asksHours: false,
  },
  other: {
    label: "Something else",
    help: "Tell us what's wrong and payroll will look at it.",
    scope: "sheet",
    asksHours: false,
    needsNote: true,
  },
};

export const CORRECTION_KEYS = Object.keys(CORRECTION_KINDS);

export function isCorrectionKind(k) {
  return Object.prototype.hasOwnProperty.call(CORRECTION_KINDS, k);
}

export function correctionLabel(kind) {
  return CORRECTION_KINDS[kind]?.label || "Something else";
}

// a one-line plain-English summary of what accepting this would do to the
// figures, so nobody is approving a change they can't see the effect of.
export function correctionEffect(kind, day, claimedHours) {
  const mealAdd = day?.mealMin ? r2(day.mealMin / 60) : 0;
  switch (kind) {
    case "hours": {
      if (claimedHours == null || !day) return "Sets the hours for this day.";
      const delta = r2(claimedHours - (day.paidHours || 0));
      if (!delta) return "No change to the hours.";
      return `${delta > 0 ? "Adds" : "Removes"} ${Math.abs(delta).toFixed(2)} hrs on this day.`;
    }
    case "meal_missed":
      return mealAdd
        ? `Adds ${mealAdd.toFixed(2)} hrs back and owes a 1 hr meal premium.`
        : "Owes a 1 hr meal premium.";
    case "meal_taken":
      return "Removes the 1 hr meal premium for this day.";
    case "meal_ontime":
      return "Removes the 1 hr late-meal premium for this day.";
    case "rest_missed":
      return "Owes a 1 hr rest premium for this day.";
    case "rest_taken":
      return "Removes the 1 hr rest premium for this day.";
    case "day_missing":
      return claimedHours
        ? `Adds a ${r2(claimedHours).toFixed(2)} hr day.`
        : "Adds a day to this timesheet.";
    case "day_extra":
      return "Removes this day from the timesheet.";
    default:
      return "No automatic change - handled by payroll.";
  }
}

// turn an accepted correction into a per-day patch. `day` is the stored day this
// is about (null for a day being added).
export function patchFor(kind, day, claimedHours) {
  switch (kind) {
    case "hours":
      return claimedHours == null ? {} : { paidHours: r2(claimedHours) };
    case "meal_missed": {
      // they worked through a punched meal: the unpaid gap becomes paid time
      // and the premium is owed. we know the gap length, so this one is exact.
      const patch = { mealViolation: true };
      if (day?.mealMin) patch.paidHours = r2((day.paidHours || 0) + day.mealMin / 60);
      return patch;
    }
    case "meal_taken":
      // they took it without punching. the premium comes off. hours are left
      // alone on purpose - docking someone for an unpunched break is a
      // management decision, so it goes through the hours kind explicitly.
      return { mealViolation: false };
    case "meal_ontime":
      // the meal happened, the clock-out time is what's wrong. same effect on
      // the premium; the punch itself isn't rewritten, since the sheet has to
      // keep showing what the clock actually recorded.
      return { mealViolation: false, mealLate: false };
    case "rest_missed":
      // rest is paid either way, so only the premium moves
      return { restViolation: true };
    case "rest_taken":
      return { restViolation: false };
    case "day_missing":
      return { added: true, paidHours: r2(claimedHours || 0) };
    case "day_extra":
      return { removed: true };
    default:
      return {};
  }
}

// merge a patch into whatever is already stored for that date
// EVERY FIELD THE MISC ANSWER WRITES, named once.
//
// Undoing a classification has to take off exactly what it put on, and a list
// written out at the undo site is a list that goes stale the day a sixth field
// joins the patch. Same shape of trap as the `applyOverrides` whitelist, which
// silently ignored three fields for a build and left Uribe's sheet claiming
// 0.17 hours were added while the total said otherwise.
//
// A test walks `patchesFor` for all three answers and fails if it writes a key
// that is not here.
export const MISC_PATCH_FIELDS = [
  "miscKind",
  "miscWorked",
  "restRequired",
  "mealRequired",
  "restViolation",
  "mealViolation",
];

// WHAT MARKS AN OVERRIDE AS OURS RATHER THAN THEIRS.
//
// Both routes write the same `miscKind` onto the day - a reviewer using the
// classify control and an employee answering the question - so the day itself
// can never say who decided. Only the reviewer's override carries this.
export const MISC_CLASSIFY_SOURCE = "misc-classify";

// The dates a REVIEWER settled the Misc time on, which is what decides whether
// the employee is still asked about it.
//
// ONE FUNCTION, TWO CALLERS, ON PURPOSE. The review page uses it to build the
// question set and the answer action uses it to re-derive that same set before
// it will accept anything. Those two disagreeing is not a cosmetic bug: the
// page shows a card, the action cannot find the question behind it, and the
// answer comes back "that question is not on this timesheet any more".
export function reviewerSettledDates(overrides) {
  return new Set(
    Object.entries(overrides || {})
      .filter(([, ov]) => ov?._source === MISC_CLASSIFY_SOURCE)
      .map(([date]) => date),
  );
}

// THE TIMES AN ACCEPTED REPORT CLAIMED, as the day-override patch field.
// Joined to whatever an earlier answer already put on that date rather than
// replacing it, so accepting a lunch claim cannot erase a stated rest.
// Returns null when the row carries nothing usable - spreading null into a
// patch adds no key, which is what an absent claim should do.
export function claimedTimesPatch(overrides, date, statedBreaks) {
  const claimed = Array.isArray(statedBreaks)
    ? statedBreaks.filter((b) => b?.from && b?.to)
    : [];
  if (!claimed.length || !date) return null;
  const prev = Array.isArray(overrides?.[date]?.statedBreaks)
    ? overrides[date].statedBreaks
    : [];
  return { statedBreaks: [...prev, ...claimed] };
}

export function mergeOverride(overrides, date, patch) {
  if (!date || !patch || !Object.keys(patch).length) return overrides || {};
  const next = { ...(overrides || {}) };
  next[date] = { ...(next[date] || {}), ...patch };
  return next;
}

export function applyOverrides(days, overrides) {
  const ov = overrides || {};
  const out = [];

  for (const d of days) {
    const patch = ov[d.date];
    if (!patch) {
      out.push({ ...d });
      continue;
    }
    if (patch.removed) continue;
    const next = { ...d };
    if (patch.paidHours != null) next.paidHours = patch.paidHours;
    if (patch.mealViolation != null) next.mealViolation = patch.mealViolation;
    if (patch.mealLate != null) next.mealLate = patch.mealLate;
    if (patch.restViolation != null) next.restViolation = patch.restViolation;
    // A rest count the employee moved. Declining "that ten minutes was your
    // rest period" takes the credit back off, and the printed count has to
    // follow the premium or the sheet argues with itself - that disagreement
    // was already found once, lower on 66 days and higher on 22.
    if (patch.restTaken != null) next.restTaken = patch.restTaken;
    // A REST TIME THE EMPLOYEE GAVE US THEMSELVES. The repair we propose is a
    // mechanical guess - the first single-field fix that lands between ten and
    // fifteen minutes - so it can name the wrong ten minutes on a day a break
    // genuinely happened. Riding on the day row means the renderer sees it
    // through `data.days` on the on-demand path as well, without the batch's
    // shared restsByDate having to carry something that belongs to one person.
    if (patch.statedRest) next.statedRest = patch.statedRest;
    // EVERY break the employee told us about on a day nothing recorded. Rides
    // on the day row for the same reason statedRest does: the renderer reads
    // `data.days` on the on-demand path, and this belongs to one person rather
    // than to the batch's shared restsByDate.
    if (patch.statedBreaks) next.statedBreaks = patch.statedBreaks;
    // MINUTES THAT STOPPED BEING OFF-CLOCK TIME, and everything the sheet draws
    // from them. `restsOffClock*` is what stripes a cell and `addedHours` is
    // what prints "+0.17 added" beside the daily total.
    //
    // A WHITELIST IS WHY THIS WAS MISSED. `patchesFor` had been setting all
    // three since the answer started moving hours, and applyOverrides copied
    // none of them - so Uribe's daily total corrected to 6.00 while the comment
    // beside it still declared 0.17 added. Mánu 2026-08-11: "the daily total got
    // corrected but it still shows the +0.17 added." Nothing errors when a field
    // is left out here; it is silently ignored, which is the trap.
    if (patch.addedHours != null) next.addedHours = patch.addedHours;
    if (patch.restsOffClock != null) next.restsOffClock = patch.restsOffClock;
    if (patch.restsOffClockMin != null) next.restsOffClockMin = patch.restsOffClockMin;
    // WHAT MISC TIME TURNED OUT TO BE, and the entitlement that hangs off it.
    //
    // Same trap as the three above, one rule later. Saying "that Misc time was
    // hours worked" puts the time back into the stretch it sits in, which moves
    // `restRequired` and `mealRequired`, which moves both violations. Leave any
    // of the five out of this list and the answer saves, the card says it was
    // recorded, and not one figure moves - silently, because a field missing
    // here is ignored rather than refused.
    if (patch.miscKind != null) next.miscKind = patch.miscKind;
    if (patch.miscWorked != null) next.miscWorked = patch.miscWorked;
    if (patch.restRequired != null) next.restRequired = patch.restRequired;
    if (patch.mealRequired != null) next.mealRequired = patch.mealRequired;
    next.corrected = true;
    out.push(next);
  }

  // days added by hand don't exist in the original list
  for (const [date, patch] of Object.entries(ov)) {
    if (!patch?.added) continue;
    if (days.some((d) => d.date === date)) continue;
    out.push({
      date,
      paidHours: patch.paidHours || 0,
      rawHours: 0,
      regularHours: 0,
      otHours: 0,
      doubleHours: 0,
      mealViolation: patch.mealViolation ?? false,
      restViolation: patch.restViolation ?? false,
      mealCount: 0,
      restCount: 0,
      restRequired: 0,
      punches: [],
      breaks: [],
      corrected: true,
      addedByHand: true,
    });
  }

  out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return out;
}

// recompute a whole sheet from its stored days plus accepted overrides.
// overtime has to be redone rather than patched: changing one day's hours can
// push a whole workweek past 40, and the 7th-day rule depends on the shape of
// the week. `applyOvertime` is injected so this file stays client-safe.
export function recomputeSheet({ days, payPeriod, overrides }, applyOvertime, reentitle) {
  const patched = applyOverrides(days || [], overrides);
  // WHAT EACH DAY OWED BEFORE ANY OVERRIDE TOUCHED IT, so the reband below can
  // tell "an answer took this premium off" from "the day never owed one".
  // Read from the input days, which every server rebuild feeds from the
  // pristine set - applyOverrides has already written the answer over the
  // flags by the time the reband runs.
  const owedBefore = new Map((days || []).map((d) => [d.date, {
    meal: d.mealViolation === true || d.mealLate === true,
    rest: d.restViolation === true,
  }]));
  // WHAT HANGS OFF THE HOURS HAS TO FOLLOW THE HOURS.
  //
  // An override that moves `paidHours` used to stop there, leaving the day with
  // the entitlement it was analysed with. Mánu 2026-08-11 found it on his own
  // sheet: answering that a ten belonged inside his shift took him from 6.17 to
  // 6.00, which puts the meal waiver back within reach and drops the second rest
  // - and neither happened, so his own answer left him charged two premium hours
  // he no longer owed.
  //
  // Only days the override actually touched are re-derived. A day nobody
  // answered about keeps exactly what the engine said at upload.
  const touched = new Set(Object.keys(overrides || {}));
  const rebanded = reentitle
    ? patched.map((d) => {
        if (!touched.has(d.date)) return d;
        const banded = { ...d, ...reentitle(d, d.paidHours) };
        // AN ANSWER OUTRANKS A RE-DERIVATION. `reentitle` works the violations
        // out from the hours and the counts, which is right for a day nobody has
        // spoken about - but a question answered "yes, I took it" is a fact from
        // the person who was there, and it was being computed away on every
        // rebuild. Dinley 08/07 answered her mis-entered ten and the sheet kept
        // saying one of two missing, because the override set
        // `restViolation: false` and this line put it straight back to true.
        const p = (overrides || {})[d.date] || {};
        if (p.restViolation != null) banded.restViolation = p.restViolation;
        if (p.mealViolation != null) banded.mealViolation = p.mealViolation;
        // WHOSE ANSWER TOOK A PREMIUM OFF THIS DAY, stamped where it happens.
        //
        // The batch counters read these markers: an hour the employee waved
        // off stays in the original figure until their signature lands, and
        // only an hour a reviewer recorded settles on its own.
        //
        // A day that OWED the hour coming in and does not owe it going out,
        // on a date an override touched, was dropped by that override - and
        // not only through a violation key in the patch. An answer that moves
        // paid hours lets the re-derivation waive the meal and drop the
        // second rest with no flag set anywhere, which was the leak: those
        // hours settled themselves on an employee's own answer. So the flag
        // stamp is read where there is one, and the date-level attribution
        // covers every cascade. A misc classification carries its _source and
        // is a reviewer's act; anything unattributed reads as the employee on
        // purpose - the failure mode is an hour that stays visible until
        // somebody signs, never one that settles itself. See answer-actor.js.
        const fallbackBy =
          p._source === "misc-classify" ? "admin" : (p._answeredBy || "employee");
        const was = owedBefore.get(d.date);
        banded.mealDroppedBy =
          was?.meal && banded.mealViolation !== true && banded.mealLate !== true
            ? (p.mealViolation === false ? (p._mealAnsweredBy || fallbackBy) : fallbackBy)
            : null;
        banded.restDroppedBy =
          was?.rest && banded.restViolation !== true
            ? (p.restViolation === false ? (p._restAnsweredBy || fallbackBy) : fallbackBy)
            : null;
        return banded;
      })
    : patched;
  const withOt = applyOvertime(rebanded, payPeriod || null);

  const mealDays = withOt.filter((d) => d.mealViolation).map((d) => d.date);
  const restDays = withOt.filter((d) => d.restViolation).map((d) => d.date);

  return {
    days: withOt.map((d) => ({
      ...d,
      paidHours: r2(d.paidHours),
      rawHours: r2(d.rawHours),
      regularHours: r2(d.regularHours),
      otHours: r2(d.otHours),
      doubleHours: r2(d.doubleHours),
    })),
    // summed from the days AS ROUNDED above, not from the unrounded ones, so a
    // recomputed sheet totals to what it prints. Mánu 2026-08-09, "the sheet
    // wins" - see totalsFromDays() in stored.js for why.
    totals: {
      rawHours: r2(withOt.reduce((n, d) => n + r2(d.rawHours || 0), 0)),
      paidHours: r2(withOt.reduce((n, d) => n + r2(d.paidHours || 0), 0)),
      regularHours: r2(withOt.reduce((n, d) => n + r2(d.regularHours || 0), 0)),
      otHours: r2(withOt.reduce((n, d) => n + r2(d.otHours || 0), 0)),
      doubleHours: r2(withOt.reduce((n, d) => n + r2(d.doubleHours || 0), 0)),
    },
    premiums: {
      mealDays,
      restDays,
      mealHours: mealDays.length * PREMIUM_HOURS_PER_VIOLATION,
      restHours: restDays.length * PREMIUM_HOURS_PER_VIOLATION,
      totalHours:
        (mealDays.length + restDays.length) * PREMIUM_HOURS_PER_VIOLATION,
    },
    partialWeekDates: withOt.filter((d) => d.weekPartial).map((d) => d.date),
  };
}

// a sheet can only be signed once nothing is outstanding
export function hasOpenCorrections(corrections) {
  return (corrections || []).some((c) => c.status === "open");
}

// WHAT THEY TOLD US, IN WORDS THEY CAN READ BACK.
//
// `resolutionNote` on the correction row is payroll's audit note. It is written
// for the person reconciling the batch, so it names what the answer did to the
// premium and cites the case the hour comes from, and the timesheet review page
// was printing it straight to the employee. That breaks the standing rule for
// anything an employee reads: what is owed is admin's business.
//
// So this is a second sentence for the same row, built from the row itself. The
// stored note is NOT touched - payroll still needs every word of it, and
// rewriting it would lose the audit trail to fix a display problem.
//
// IT ONLY EVER RESTATES THEIR OWN ANSWER. No figure, no consequence, no rule.
// The question card above already said what the rule is; this is the receipt.
function statedAt(list, { name = false } = {}) {
  const times = (list || [])
    .filter((b) => b && b.from && b.to)
    .map((b) => (name ? `${b.kindOf === "meal" ? "meal" : "rest"} ` : "") + `${b.from} to ${b.to}`);
  return times.length ? times.join(", ") : null;
}

export function employeeResolution(correction, question = null) {
  const c = correction || {};
  const kind = String(c.kind || "").replace(/^q_/, "");
  // `choice` holds the answer as given, which `status` cannot: two of the three
  // outcomes on the two-lunches card are declines, and a partial is a decline
  // that carries times. Falling back to the status keeps rows written before
  // the column existed readable.
  const pick = c.choice || (c.status === "accepted" ? "yes" : c.status === "declined" ? "no" : null);
  if (!pick) return null;
  const yes = pick === "yes";
  const at = statedAt(c.statedBreaks);

  switch (kind) {
    case "repair":
    case "restNoTimes":
      return yes
        ? `You said you took the break${at ? `, at ${at}` : ""}.`
        : "You said you did not take the break.";

    case "restIsMealLength":
      return yes
        ? "You said the thirty minute break was your meal."
        : "You said it was a rest break, not your meal.";

    case "restOutsideScheduled":
      // confirming KEEPS the recorded time on this one, so the sentence is
      // about the time being right rather than about the break happening
      return yes
        ? "You said you took the break at the time recorded."
        : `You said the recorded time was wrong${at ? `, and gave ${at} instead` : ""}.`;

    case "nothingDocumented":
      // the legacy combined kind, still on rows answered before the split. Its
      // times can carry both a meal and a rest, so they are named.
      return yes
        ? `You said you took your breaks and did not write them down${
          statedAt(c.statedBreaks, { name: true }) ? `, at ${statedAt(c.statedBreaks, { name: true })}` : ""
        }.`
        : "You said you did not get your breaks that day.";

    case "nothingDocumentedMeal":
      return yes
        ? `You said you took your meal break and did not write it down${at ? `, at ${at}` : ""}.`
        : "You said you did not get your meal break that day.";

    case "nothingDocumentedRest":
      if (pick === "partial") {
        return `You said you got some of your rest periods${at ? `, at ${at}` : ""}, and not the others.`;
      }
      return yes
        ? `You said you took your rest periods and did not write them down${at ? `, at ${at}` : ""}.`
        : "You said you did not get your rest periods that day.";

    case "mealLate":
      return yes
        ? "You said your lunch really did start that late."
        : "You said your lunch was on time and the punch is what is wrong.";

    case "restTooLongOffClock":
      // THREE OUTCOMES, AND TWO OF THEM ARE DECLINES. Which sentence is right
      // depends on whether the day carried two lunches, and the correction row
      // does not say - that lives on the question, so it is read from there when
      // the page has it and given a wording that holds either way when it does not.
      if (pick === "wrongone") {
        return "You said only one lunch happened, and the recorded one is it.";
      }
      if (question?.row?.twoLunches) {
        return yes
          ? "You said both lunches are real."
          : "You said the second lunch was added by accident.";
      }
      return yes
        ? "You said this was a real break you took."
        : "You said the entry was a mistake.";

    case "shortMealRest":
      return yes
        ? "You said the short meal block was your rest break."
        : "You said it was not your rest break.";

    // THE ONE ANSWER THAT HAD NO RECEIPT, found on Malacova's fortnight
    // 2026-09-02: eleven 8-hour days she answered as PTO read "compliant"
    // with nothing anywhere saying why. The card's own vocabulary: yes = paid
    // time off, no = sick pay - see kindFor in questions.js.
    case "miscTime": {
      const what =
        pick === "yes" ? "paid time off"
          : pick === "no" ? "sick pay"
            : pick === "worked" ? "worked time"
              : pick === "cancelled" ? "a client cancellation"
                : null;
      return what ? `You said this time was ${what}.` : null;
    }

    case "mealShort":
      return yes
        ? "You said you took a full thirty minutes for lunch anyway."
        : "You said you did not get a meal break that day.";

    default:
      return null;
  }
}

// WHICH ANSWERS A REASON BELONGS UNDER.
//
// A reason is why a break was missed, so it is only shown against the answer
// that says one was. The late lunch is the exception in shape but not in kind:
// the break happened and the reason is why it started when it did, which is the
// same thing the employee typed and the same row it was typed into.
export function resolutionTakesReason(correction) {
  const c = correction || {};
  const kind = String(c.kind || "").replace(/^q_/, "");
  const pick = c.choice || (c.status === "accepted" ? "yes" : c.status === "declined" ? "no" : null);
  if (kind === "mealLate") return pick === "yes";
  if (kind === "nothingDocumented" || kind === "nothingDocumentedMeal" || kind === "nothingDocumentedRest") {
    return pick === "no" || pick === "partial";
  }
  return false;
}
