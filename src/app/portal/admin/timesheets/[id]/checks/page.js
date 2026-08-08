import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { restKey, clockMin } from "@/lib/timesheet/rests";
import { workedBeforeMin, RULES } from "@/lib/timesheet/parse";
import {
  anomalyLabel,
  ANOMALY_KINDS,
  describePunchIssue,
  scheduledPaidHours,
} from "@/lib/timesheet/anomalies";
import BackLink from "@/components/BackLink";
import CorrectDay from "./CorrectDay";
import Evidence from "./Evidence";
import ChecksFilter from "./ChecksFilter";
import RecomputeButton from "../corrections/RecomputeButton";

export const metadata = { title: "Data checks", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const f2 = (n) => (n == null ? "-" : (Math.round(n * 100) / 100).toFixed(2));

// Two client bookings that overlap in time are not a punch error. QSP writes
// them as one run of punches, so the second booking's start lands before the
// first one's end and the engine reads a break running backwards.
//
// On 07/16-07/31 EVERY punch issue in the batch was this - 17 of 17 - and every
// one of them offered a "repair" that cut hours, 23.59 in total. Delgado Pineda
// 07/19 proposed 7.28 down to 1.38 on a day the schedule confirms at 7.28.
// None was applied, because a repair has to be confirmed by the schedule first,
// but they were being shown as though they had been.
const RANGE = /^(\d{1,2}(?::\d{2})?[ap])-(\d{1,2}(?::\d{2})?[ap])/i;
function toMin(t) {
  const m = /^(\d{1,2})(?::(\d{2}))?([ap])$/i.exec(t);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "p") h += 12;
  return h * 60 + Number(m[2] || 0);
}
// What a scheduled block actually IS, read off the text QSP prints:
// "10:30a-2:06p Duff, E-ILS Service (3:36)" is a client visit, "2p-2:30p -ILS
// Travel(0:30)" is not.
//
// This matters because the row used to say "two client bookings overlap" on
// every one of these, and on 07/16-07/31 that was true of exactly 2 of 17. The
// other 15 are a client visit running over travel (12), training (2), admin (1)
// or misc. Telling somebody two clients were double-booked when one of them was
// the drive between them sends them looking for a scheduling problem that isn't
// there.
function blockKind(text) {
  const m = /^\s*(.*?)-(?:ILS\s*)?([A-Za-z ]+?)\s*\(/.exec(String(text || "").replace(RANGE, ""));
  if (!m) return "another scheduled block";
  const client = m[1].trim();
  const type = m[2].trim().toLowerCase();
  if (type === "service") return client ? "a client booking" : "a service block";
  if (type === "travel") return "a travel block";
  if (type === "training") return "a training block";
  if (type === "admin") return "an admin block";
  if (type === "misc") return "a miscellaneous block";
  if (type === "meal break") return "a meal break";
  return "another scheduled block";
}

// null when nothing overlaps; otherwise the phrase naming the two blocks that do
function overlapInfo(shifts) {
  const r = (shifts || [])
    .map((s) => {
      const m = RANGE.exec(String(s.text || "").trim());
      return m ? { a: toMin(m[1]), b: toMin(m[2]), text: s.text } : null;
    })
    .filter((x) => x && x.a != null && x.b != null)
    .sort((x, y) => x.a - y.a);

  for (let i = 1; i < r.length; i++) {
    if (r[i].a >= r[i - 1].b) continue;
    const one = blockKind(r[i - 1].text);
    const two = blockKind(r[i].text);
    if (one === two) {
      const plural =
        one === "another scheduled block" ? "scheduled blocks" : `${one.replace(/^an? /, "")}s`;
      return { subject: `Two ${plural}` };
    }
    return { subject: `${one.charAt(0).toUpperCase()}${one.slice(1)} and ${two}` };
  }
  return null;
}

// The findings that are not about a single day, so they get no row.
//
// Every figure here is a query over what the batch already stored - nothing is
// re-parsed and no source file is fetched. That is only possible because
// `day.printed` carries QSP's own printed overtime alongside its daily total;
// summing it per person reproduces the payroll report's overtime column exactly
// (verified against all four disagreements on 07/16-07/31), which is what
// TASKS.md #69 was asking for.
function batchNotes(sheets) {
  const out = [];

  // 1. people the Rest Periods Report never mentions. Under the rule that a
  // break only counts if something recorded it, every qualifying day of theirs
  // owes a premium. It is the single biggest assumption in the period's total
  // and it is the one David will ask about, so it does not get to stay implicit.
  let noSourceDays = 0;
  const noSourcePeople = new Set();
  for (const t of sheets) {
    for (const d of t.data?.days || []) {
      if (d.restViolation && d.restSource === "none") {
        noSourceDays++;
        noSourcePeople.add(t.sourceName);
      }
    }
  }
  if (noSourceDays) {
    out.push({
      n: String(noSourceDays),
      unit: noSourceDays === 1 ? "hour" : "hours",
      head: `${noSourcePeople.size} ${noSourcePeople.size === 1 ? "person is" : "people are"} not in the Rest Periods Report at all`,
      why: "Nothing recorded a break for them, so every qualifying day is charged a rest premium. One flag would move all of it either way, so it is a decision rather than a defect.",
    });
  }

  // 2. our regular/overtime split against QSP's own printed overtime. The TOTAL
  // agrees in every case - this is only about which side of the line the hours
  // fall, which is what #67 has been stuck on.
  const otOff = [];
  for (const t of sheets) {
    const printedOt = (t.data?.days || []).reduce((n, d) => n + (d.printed?.overtime || 0), 0);
    if (Math.abs(printedOt - (t.otHours ?? 0)) > 0.03) {
      otOff.push({ name: t.sourceName, ours: t.otHours ?? 0, qsp: printedOt });
    }
  }
  if (otOff.length) {
    const gap = otOff.reduce((n, x) => n + Math.abs(x.qsp - x.ours), 0);
    out.push({
      n: gap.toFixed(2),
      unit: "hours",
      head: `${otOff.length} ${otOff.length === 1 ? "person's" : "people's"} overtime split disagrees with what QSP printed`,
      why:
        otOff
          .map((x) => `${x.name.split(",")[0]} ${f2(x.ours)} against ${f2(x.qsp)}`)
          .join(", ") + ". The total hours agree in every case; only the split between regular and overtime differs.",
    });
  }

  // 3. a person QSP spells differently across its own exports. Applied, and said
  // out loud - a 50% link must never read as a fact.
  const aliases = [];
  for (const t of sheets) {
    for (const [report, v] of Object.entries(t.data?.premiumSupport?.readAs || {})) {
      if (v && !v.exact) aliases.push(`${t.sourceName} reads "${v.name}" on the ${report}`);
    }
  }
  if (aliases.length) {
    out.push({
      n: String(aliases.length),
      unit: aliases.length === 1 ? "name" : "names",
      head: "A name is spelled differently across the exports",
      why: `${aliases.join("; ")}. Matched on the portal account rather than by comparing the exports to each other, applied, and shown rather than silently substituted.`,
    });
  }

  return out;
}

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
    const agrees = ctx.scheduledHours != null && Math.abs((ctx.paidHours ?? 0) - ctx.scheduledHours) < 0.05;
    return {
      // NOT "settled". The figures are right, but "no action" is exactly what
      // this is not - two bookings billed over the top of each other is a thing
      // somebody should know about, and filing it under settled buried it.
      group: "anomaly",
      head: `${f2(p.hoursNow)} hrs${agrees ? ", confirmed" : ""}`,
      tone: agrees ? "text-emerald-700 dark:text-emerald-400" : "text-muted",
      lead: agrees
        ? `${ctx.overlapping.subject} overlap in time, which QSP writes as one run of punches, so one reads as a break running backwards. It is not. The schedule has both and they come to ${f2(ctx.scheduledHours)} hrs, which is what this day pays. Nothing to do.`
        : `${ctx.overlapping.subject} overlap in time, so one reads as a break running backwards. That part is expected. The schedule comes to ${f2(ctx.scheduledHours)} hrs against the ${f2(p.hoursNow)} paid here, so this one is worth opening.`,
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
      : `A possible repair was found (${(p.say.applied || []).join("; ") || "punches reordered"}). It would make the day ${f2(p.say.hours)} hrs instead of ${f2(p.say.was)}${cuts ? ", which is less" : ""}. It has NOT been applied and nothing here has changed the pay.`,
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
function describeRestRow(r) {
  const len = r.minutes == null ? "no times" : `${r.minutes} min`;
  if (r.counted) {
    return r.reversed
      ? {
          group: "settled",
          head: "read as a normal rest",
          tone: "text-muted",
          lead: `QSP has the out and in times the wrong way round, so its own total reads ${r.derivation}. Flipped, it is a ${r.minutes} minute break like any other, and it counts as one.`,
        }
      : {
          group: "anomaly",
          head: `${len}, counted`,
          tone: "text-violet-700 dark:text-violet-300",
          lead: `Longer than the ten minutes a paid rest period allows. It counts and owes nothing, but it is worth knowing about - fifteen minutes is one and a half times the entitlement.`,
        };
  }
  if (r.repair) {
    return {
      group: "decide",
      head: `${len}, probably a mis-pick`,
      tone: "text-rose-700 dark:text-rose-400",
      lead: `QSP reads ${r.derivation}, which is not a rest break. It looks like ${r.repair.why}: ${r.repair.from} should be ${r.repair.to}, which gives a normal ${r.repair.minutes} minute break. Accepting that REMOVES a rest premium, so it needs you rather than the engine.`,
    };
  }
  return {
    group: "anomaly",
    head: r.minutes == null ? "no times recorded" : `${len}, not a rest`,
    tone: "text-violet-700 dark:text-violet-300",
    lead:
      r.minutes == null
        ? "Neither an out nor an in time was recorded, so nothing can say a break was taken. The premium stands. Worth fixing in QSP so the next period reads properly."
        : `QSP reads ${r.derivation}. No single mis-picked field turns that into a rest break, so the engine will not guess at it. The premium stands and the entry should be corrected in QSP.`,
  };
}

export default async function ChecksPage({ params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const { id } = await params;
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    include: {
      timesheets: {
        orderBy: { sourceName: "asc" },
        include: {
          user: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
        },
      },
    },
  });
  if (!batch) notFound();

  const entries = [];
  let anySchedule = false;

  for (const t of batch.timesheets) {
    const sched = t.data?.scheduleCheck || { matched: false };
    if (sched.matched) anySchedule = true;
    const byDate = sched.byDate || {};
    const common = {
      timesheetId: t.id,
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
      entries.push({
        ...common,
        kind: "punch",
        date: p.date,
        p: withSay,
        overlapping: !!overlapInfo(schedDay?.shifts),
        d: describePunchRow(withSay, {
          overlapping: overlapInfo(schedDay?.shifts),
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
  const restByName = new Map(batch.timesheets.map((t) => [restKey(t.sourceName), t]));
  for (const r of (batch.restsByDate || []).filter((x) => x.kind)) {
    const t = restByName.get(restKey(r.name));
    entries.push({
      // the real sheet, so "Open their sheet" works. rest rows are keyed on the
      // report row rather than the sheet, since one person can contribute
      // several - Zuchniak has eight.
      timesheetId: t?.id || null,
      rowKey: `rest-${restKey(r.name)}-${r.date}-${r.out || "x"}`,
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
      d: describeRestRow(r),
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
          `They did take a rest break, ${hrs} hours of work into a ${day.paidHours} hour day, ` +
          `where a first rest belongs in the first four. Nothing is charged for it: the rule is the ` +
          `middle of each work period "insofar as practicable" rather than a deadline, so this is ` +
          `a scheduling pattern to fix rather than a premium to pay. The day is otherwise ` +
          `compliant, which is why it is here at all: days that already owe a rest premium are ` +
          `left out, because a late rest cannot cost anything on top of one.`,
      },
    });
  }

  // A rest taken hard against the rostered lunch, or recorded inside it.
  //
  // Reported, never charged. The schedule cannot roster a rest period at all -
  // it holds meal breaks only - so the employer gave a standalone lunch in
  // every one of these and the break was stacked against it afterwards. Where
  // the opportunity was provided the premium is not owed.
  // the day's recorded rest windows, for quoting the actual times back
  const restWindowsFor = new Map();
  for (const r of batch.restsByDate || []) {
    if (!r.counted || !r.date) continue;
    const out = clockMin(r.out);
    const inn = clockMin(r.in);
    if (out == null || inn == null || inn <= out) continue;
    const k = `${restKey(r.name)}|${r.date}`;
    if (!restWindowsFor.has(k)) restWindowsFor.set(k, []);
    restWindowsFor.get(k).push(`${r.out} to ${r.in}`);
  }
  const restTimesText = (t, d) =>
    (restWindowsFor.get(`${restKey(t.sourceName)}|${d.date}`) || []).join(", ");
  const restRow = (t, d, key, head, lead) => ({
    timesheetId: t.id,
    rowKey: `${key}-${t.id}-${d.date}`,
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

  for (const t of batch.timesheets) {
    for (const d of t.data?.days || []) {
      // A rest recorded INSIDE the rostered lunch. The one rest finding that
      // moves a figure: unpaid meal minutes were never a rest period, so it
      // does not count and the premium follows.
      if (d.restsInsideMeal) {
        entries.push(restRow(t, d, "rest-in-meal",
          d.restsInsideMeal === 1 ? "a rest recorded inside the lunch" : `${d.restsInsideMeal} rests recorded inside the lunch`,
          `The report puts a rest at ${restTimesText(t, d)}, inside the lunch the schedule rostered. ` +
          `A rest period is PAID time and a meal period is unpaid, so ten minutes inside the lunch ` +
          `cannot be a rest period - most often it is part of the lunch that got logged as one. ` +
          `IT HAS NOT BEEN COUNTED as a rest taken, which is why this day reads ${d.restTaken} of ` +
          `${d.restRequired}${d.restViolation ? " and owes a premium" : ""}. The opportunity to take ` +
          `a ten minute break always exists here, so this was not one the employer failed to provide.`));
      }
      // A rest logged before clock-in or after clock-out. It was not a rest
      // taken during work, and it STILL COUNTS - Mánu's call was to surface it
      // rather than move premiums on the engine's say-so. Which makes saying it
      // plainly the whole job of this row.
      if (d.restsOutsideShift) {
        entries.push(restRow(t, d, "rest-outside",
          d.restsOutsideShift === 1 ? "a rest logged outside the shift" : `${d.restsOutsideShift} rests logged outside the shift`,
          `The Rest Periods Report records ${restTimesText(t, d)} on a day worked ` +
          `${d.workedMin ? Math.round((d.workedMin / 60) * 100) / 100 : d.paidHours} hours. ` +
          `A break before clock-in or after clock-out is not paid time, so it was never a rest ` +
          `period - most often it is a default nobody changed rather than anything that happened. ` +
          `IT HAS NOT BEEN COUNTED as a rest taken, which is why this day reads ${d.restTaken} of ` +
          `${d.restRequired}${d.restViolation ? " and owes a premium" : ""}. That the entry was not ` +
          `caught during the work day is on us, not on them, so the premium is not theirs to lose. ` +
          `Worth fixing at source in QSP so the next period does not repeat it.`));
      }
      // A rest that fell inside a punched-out gap. Paid time that went unpaid.
      if (d.restsUnpaid) {
        entries.push(restRow(t, d, "rest-unpaid",
          d.restsUnpaid === 1 ? "a rest that was not paid" : `${d.restsUnpaid} rests that were not paid`,
          `The report records a rest at ${restTimesText(t, d)}, and the punches have them off the ` +
          `clock across it. A rest period is paid time, so unpaid minutes were not one - it HAS NOT ` +
          `BEEN COUNTED as a rest taken, which is why this day reads ${d.restTaken} of ` +
          `${d.restRequired}${d.restViolation ? " and owes a premium" : ""}. No hours are added ` +
          `back: the premium is what compensates a rest that did not happen, and paying for the ` +
          `minutes as well would be paying for a break we have just said was not taken. Wages would ` +
          `only be owed if they were WORKING while off the clock, and nothing here says they were.`));
      }
      if (!d.restTackedOn) continue;
      entries.push({
        timesheetId: t.id,
        rowKey: `rest-tacked-${t.id}-${d.date}`,
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

  // What each row is ABOUT, so the list can be grouped by it. The anomaly pile
  // went from 21 to 69 in a day as the rest-timing work landed, and a flat list
  // that long stops being something anybody reads - six kinds of finding
  // interleaved by surname is a wall, not a screen.
  const KINDS = {
    punch: { label: "Punches that do not read", order: 0 },
    flag: { label: "Punches the schedule can settle", order: 1 },
    rest: { label: "Rest report entries that cannot be read", order: 2 },
    "rest-in-meal": { label: "Rests recorded inside the lunch", order: 3 },
    "rest-outside": { label: "Rests logged outside the shift", order: 4 },
    "rest-unpaid": { label: "Rests that were never paid", order: 5 },
    "rest-tacked": { label: "Rests taken against the lunch", order: 6 },
    "rest-late": { label: "Rests taken late in the shift", order: 7 },
  };
  const kindOf = (e) => KINDS[e.kind] || { label: "Other", order: 9 };

  const ORDER = { decide: 0, unworked: 1, anomaly: 2, settled: 3 };
  entries.sort(
    (a, b) =>
      ORDER[a.d.group] - ORDER[b.d.group] ||
      kindOf(a).order - kindOf(b).order ||
      a.who.localeCompare(b.who) ||
      String(a.date).localeCompare(String(b.date)),
  );

  const counts = { decide: 0, unworked: 0, anomaly: 0, settled: 0 };
  for (const e of entries) counts[e.d.group]++;
  const needsPerson = counts.decide + counts.unworked;

  const notes = batchNotes(batch.timesheets);

  // the recompute prompt belongs to a SHEET, not a day, so it rides on the
  // first row that sheet contributes rather than repeating on every one
  const recomputeShown = new Set();
  for (const e of entries) {
    if (Object.keys(e.overrides).length > 0 && !e.signed && !recomputeShown.has(e.timesheetId)) {
      recomputeShown.add(e.timesheetId);
      e.showRecompute = true;
    }
  }

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <BackLink href={`/portal/admin/timesheets/${batch.id}`}>Back to the batch</BackLink>

      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Data checks
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {batch.periodFrom} to {batch.periodTo}
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
        Nothing here has changed anybody&apos;s hours. The engine reproduces what
        QSP exported to the hundredth of an hour, so everything below is a problem
        in the source data rather than in the arithmetic.{" "}
        {entries.length === 0 ? (
          "Nothing was flagged in this batch."
        ) : (
          <>
            <span className="font-semibold text-foreground">
              {needsPerson} of these need a person.
            </span>{" "}
            The rest are here so you can audit them.
          </>
        )}
      </p>

      {!anySchedule && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          No schedule export was uploaded with this batch, so the hours could only
          be checked against themselves. A punch typed into the wrong box is
          invisible that way - especially when two of them cancel out and leave a
          total that looks perfectly normal. Upload the period again with the
          Employee Schedules PDF to get the second check.
        </div>
      )}

      {entries.length === 0 ? (
        <p className="mt-10 rounded-xl border border-emerald-300/60 bg-emerald-50 p-6 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
          Nothing looks wrong in this batch. Every punch pair runs forwards, no
          stretch on the clock is impossibly long, and
          {anySchedule
            ? " every day agrees with the schedule."
            : " no schedule was provided to compare against."}
        </p>
      ) : (
        <ChecksFilter
          counts={counts}
          groups={entries.map((e) => e.d.group)}
          kinds={entries.map((e) => kindOf(e).label)}
          notes={notes}
        >
          {entries.map((e) => (
            <div
              key={e.rowKey || `${e.timesheetId}-${e.kind}-${e.date}`}
              className={`rounded-lg border border-border bg-surface p-4 border-l-4 ${
                e.d.group === "decide"
                  ? "border-l-rose-500"
                  : e.d.group === "unworked"
                    ? "border-l-amber-500"
                    : "border-l-emerald-600/70"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm">
                  <span className="font-semibold text-foreground">{e.who}</span>
                  <span className="ml-2 text-xs text-faint">{e.date}</span>
                </p>
                <p className={`text-sm font-semibold ${e.d.tone}`}>{e.d.head}</p>
              </div>

              <p className="mt-1.5 text-sm leading-relaxed text-muted">{e.d.lead}</p>

              <details className="group mt-2">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-brand">
                  <span aria-hidden="true" className="transition-transform group-open:rotate-90">
                    ▶
                  </span>
                  What the documents say
                </summary>
                <div className="mt-2 rounded-md border border-border bg-surface-2 p-3">
                  {e.kind === "punch" && (
                    <>
                      {e.p.anomalies.map((a, j) => (
                        <p key={j} className="mb-1 text-xs leading-relaxed text-muted">
                          <span className="font-semibold text-foreground">
                            {anomalyLabel(a.kind)}:
                          </span>{" "}
                          {a.shown} - {a.note}
                          <span className="block italic">{ANOMALY_KINDS[a.kind]?.why}</span>
                        </p>
                      ))}
                      <p className="mt-2 font-mono text-xs text-muted">
                        QSP has: {e.p.shownPunches.join("  ")}
                      </p>
                      {/* No "Likely" on a day the schedule explains as two
                          overlapping bookings. The suggester only knows three
                          shapes, and on this day it fires the reversed-break
                          rule - which assumes the four times are ONE shift with
                          a break in the middle. They are not: they are two jobs
                          that overlap. Delgado Pineda 07/19 came out as 7.28 ->
                          1.38, deleting 5.90 paid hours on a day the schedule
                          independently confirms at 7.28. It was never applied,
                          because a repair has to be schedule-confirmed first -
                          but printing it in the affirmative colour directly
                          under a headline that says "It is not" tells the
                          reader to believe something the row has just denied. */}
                      {e.p.suggestion && !e.overlapping && (
                        <p className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
                          Likely: {e.p.suggestion.punches.join("  ")}
                        </p>
                      )}
                    </>
                  )}
                  {/* a rest row comes from a spreadsheet, not from punches, so
                      the punch/schedule panel has nothing to say about it and
                      would render "no punches were read for this day" - true,
                      and about the wrong document entirely. */}
                  {e.kind === "rest" ? (
                    <>
                      <p className="font-mono text-xs text-foreground">
                        QSP has: out {e.r.out || "(blank)"} · in {e.r.in || "(blank)"} · total{" "}
                        {e.r.printedHours}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {/* the printed column is rounded to two decimals, so the
                            jump from it to minutes is shown rather than asserted */}
                        {e.r.derivation}
                        {e.r.reversed && " · out is after in, so the row runs backwards"}
                      </p>
                      {e.r.repair && (
                        <p className="mt-1 font-mono text-xs text-emerald-700 dark:text-emerald-400">
                          Likely: {e.r.repair.field === "out" ? "out" : "in"} {e.r.repair.from} →{" "}
                          {e.r.repair.to} = {e.r.repair.minutes} min
                        </p>
                      )}
                      <p className="mt-2 text-xs italic text-muted">{e.r.note}</p>
                      <a
                        href={`/portal/admin/timesheets/${batch.id}/source?doc=rests`}
                        className="mt-2 inline-block text-xs font-medium text-brand hover:text-brand-dark"
                      >
                        Download the Rest Periods Report →
                      </a>
                    </>
                  ) : (
                    <Evidence
                      batchId={batch.id}
                      timesheetId={e.timesheetId}
                      date={e.date}
                      day={e.dayByDate[e.date] || null}
                      shifts={e.byDate[e.date]?.shifts}
                      schedulePages={e.byDate[e.date]?.pages}
                      hasSource={!!batch.sourceUrl}
                      hasSchedule={!!batch.scheduleUrl}
                    />
                  )}
                </div>
              </details>

              {/* correcting is offered per day against the figure that day
                  actually holds, never as a blanket "trust the schedule" - that
                  is what would have turned a page-break bug into an offer to
                  overwrite a correct 8.00 */}
              {e.kind === "flag" &&
                !e.signed &&
                e.f.timesheet != null &&
                e.dayHours[e.date] != null && (
                  <CorrectDay
                    timesheetId={e.timesheetId}
                    date={e.date}
                    timesheet={e.f.timesheet}
                    schedule={e.f.schedule}
                    existing={e.overrides[e.date] || null}
                  />
                )}

              <div className="mt-2 flex flex-wrap items-center gap-4">
                {/* a rest-report name that matched no timesheet has no sheet to
                    open. say which name did not match rather than linking to
                    /sheet/null/download. */}
                {e.timesheetId ? (
                  <a
                    href={`/portal/admin/timesheets/sheet/${e.timesheetId}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-brand hover:text-brand-dark"
                  >
                    Open their sheet →
                  </a>
                ) : (
                  <span className="text-xs text-amber-700 dark:text-amber-400">
                    No timesheet in this batch matches &ldquo;{e.r?.name}&rdquo;
                  </span>
                )}
                {e.showRecompute && (
                  <RecomputeButton
                    timesheetId={e.timesheetId}
                    accepted={Object.keys(e.overrides).length}
                  />
                )}
              </div>
            </div>
          ))}
        </ChecksFilter>
      )}

      <div className="mt-8 rounded-lg border border-border bg-surface-2 p-4 text-sm text-muted">
        <p className="font-semibold text-foreground">Fixing these</p>
        <p className="mt-1">
          Correct the entries in QSP, then upload the period again. Nothing on
          this page edits QSP, and nothing here is applied to the figures on its
          own - a suggestion is only ever shown next to what QSP actually holds.
        </p>
        <p className="mt-2">
          <Link
            href={`/portal/admin/timesheets/${batch.id}/corrections`}
            className="font-semibold text-brand underline underline-offset-4"
          >
            Problems reported by staff
          </Link>{" "}
          are tracked separately.
        </p>
      </div>
    </section>
  );
}
