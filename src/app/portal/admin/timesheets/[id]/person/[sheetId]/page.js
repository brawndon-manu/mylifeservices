import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets, isSuper } from "@/lib/roles";
import { signTimesheetToken } from "@/lib/timesheet-token";
import { restKey, restNameFor, restRowTimes, clockMin, serviceFit } from "@/lib/timesheet/rests";
import { blockTimes, serviceOf } from "@/lib/timesheet/schedule";
import { drawnRest } from "@/lib/timesheet/recorded-breaks";
import { violationsFor, VIOLATION_KINDS, violationHead } from "@/lib/timesheet/violations";
import { mealBookedInside } from "@/lib/timesheet/questions";
import { buildFindings, kindOf } from "@/lib/timesheet/findings";
import { reanalyzeDays, restWindowsByDate } from "@/lib/timesheet/reanalyze";
import { CORRECTION_KINDS } from "@/lib/timesheet/corrections";
import { correctionHeading } from "@/lib/timesheet/question-nouns";
import { preferredName } from "@/lib/contacts";
import BackLink from "@/components/BackLink";
import DayPeek from "../../checks/DayPeek";
import FlagButton from "../../checks/FlagButton";
import CheckStatusChip from "@/components/CheckStatusChip";
import { batchReach, markKey } from "@/lib/timesheet/mark-key";
import BreakAnswer from "../../checks/BreakAnswer";
import { answersByFinding, breakFindingKey } from "@/lib/timesheet/break-answers";
import MiscClassify from "./MiscClassify";
import UndoDay from "../../../_components/UndoDay";
import RecomputeButton from "../../corrections/RecomputeButton";
import { PresenceBar, PresenceCard } from "../../Presence";

// THE DAY BY DAY. Two different buttons pointed here - "View their schedule"
// from the checks screen and "View their day by day" from the all-employees
// list - so one page had two names depending on how you arrived. Day by day is
// the one that says what is on it.
export const metadata = { title: "Their day by day", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const f2 = (n) => (n == null ? "-" : (Math.round(n * 100) / 100).toFixed(2));

// WHICH PILE A FINDING CAME FROM, said on the row rather than left implied.
// The checks screen answers this with five coloured boxes you filter by; a
// person's page has no filter, so the group has to travel with the row or
// "needs you to decide" and "settled, nothing to do" look identical.
//
// Full literal strings: Tailwind v4 compiles only what it can see in source.
const GROUP = {
  decide: { label: "Needs a decision", cls: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/40 dark:text-rose-300" },
  unworked: { label: "Never worked", cls: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-300" },
  violation: { label: "Violation", cls: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-800/70 dark:bg-fuchsia-950/40 dark:text-fuchsia-300" },
  anomaly: { label: "Anomaly", cls: "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800/70 dark:bg-violet-950/40 dark:text-violet-300" },
  settled: { label: "Settled, no action", cls: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300" },
};

// One day's findings, in the checks screen's own words. `lead` is that screen's
// card copy and it is READ, never rewritten - the whole reason the builder moved
// into `findings.js` was so one finding cannot be described two ways.
function Findings({ list }) {
  if (!list?.length) return null;
  return (
    <ul className="mt-2 space-y-2 border-t border-border pt-2">
      {list.map((e, i) => {
        const g = GROUP[e.d.group] || GROUP.anomaly;
        return (
          <li key={e.rowKey || `${e.kind}-${e.date}-${i}`} className="text-xs">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${g.cls}`}>
                {g.label}
              </span>
              <span className="font-semibold text-foreground">{kindOf(e).label}</span>
              {e.d.head && <span className={`font-semibold ${e.d.tone || "text-muted"}`}>{e.d.head}</span>}
            </div>
            {e.d.lead && <p className="mt-1 leading-relaxed text-muted">{e.d.lead}</p>}
          </li>
        );
      })}
    </ul>
  );
}

// What THEY said about the day, and what was decided. Empty on every batch today
// because there are no correction rows in the database at all.
function Reported({ list }) {
  if (!list?.length) return null;
  return (
    <ul className="mt-2 space-y-2 border-t border-border pt-2">
      {list.map((c) => (
        <li key={c.id} className="text-xs">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="rounded border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-300">
              {c.kind.startsWith("q_") ? "They answered" : "They reported"}
            </span>
            {/* TWO DIFFERENT VOCABULARIES MEET HERE. `CORRECTION_KINDS` covers
                what an EMPLOYEE reports (hours wrong, worked through lunch);
                the `q_` kinds are questions WE put to them, and nothing mapped
                those - so this fell through to the internal name and showed a
                reviewer `restOutsideScheduled` and `miscTime`. */}
            <span className="font-semibold text-foreground">
              {correctionHeading(c.kind) || CORRECTION_KINDS[c.kind]?.label || c.kind}
            </span>
            <span className="text-faint">{c.status}</span>
          </div>
          {c.note && <p className="mt-1 leading-relaxed text-muted">{c.note}</p>}
          {c.resolutionNote && (
            <p className="mt-1 leading-relaxed text-faint">
              {c.resolutionNote}
              {c.resolvedBy && ` (${preferredName(c.resolvedBy)})`}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

// WHAT SAYING "IT WAS WORK" WOULD ADD TO THIS DAY, in premium hours.
//
// Run through `reanalyzeDays`, which is the same code the rebuild runs, so the
// figure a reviewer sees before clicking is the figure they get after. One day
// at a time: the answer only ever changes the day it is given on.
function costOfWorked(day, inputs) {
  const [after] = reanalyzeDays([day], inputs).days;
  if (!after) return 0;
  return (
    (after.restViolation && !day.restViolation ? 1 : 0) +
    (after.mealViolation && !day.mealViolation ? 1 : 0)
  );
}

// ONE PERSON, THEIR WHOLE PERIOD, EVERY DAY OF IT.
//
// The checks list is one row per person because the job is a conversation, not
// a day. This is where that conversation gets its detail: what the documents
// recorded on each of their days, which of those days broke a rule, and what to
// tell them to change in QuickSolve.
//
// THE QUIET DAYS ARE DRAWN TOO. A schedule with the clean days deleted is not a
// schedule, it is the list again with extra steps - and the useful thing is
// often the comparison. Flores has a ten minute punch gap at 12:30 on the 1st
// and the same gap on the 2nd, which reads as a rest nobody logged rather than
// two unrelated days, and you can only see that with both in front of you.
export default async function PersonSchedulePage({ params, searchParams }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const { id, sheetId } = await params;
  // WHERE THEY CAME FROM, so Back goes there.
  //
  // Mánu 2026-08-13: opening somebody from the all-employees list and pressing
  // Back landed on Data checks, which is not where he was. This page is now
  // reachable from two screens - the checks list and the employee list - and a
  // single hard-coded Back is wrong on one of them whichever one it names.
  //
  // Carried in the query string rather than read off the Referer header: a
  // header is absent on a hard reload and unreliable behind proxies, and this
  // has to be right every time or it is worse than not existing. Anything other
  // than the one value we set falls back to Data checks, so a hand-typed or
  // stale URL cannot produce a broken link.
  const from = (await searchParams)?.from;
  const back =
    from === "people"
      ? { href: `/portal/admin/timesheets/${id}/people`, label: "Back to all employees" }
      : { href: `/portal/admin/timesheets/${id}/checks`, label: "Back to Data checks" };
  const sheet = await prisma.timesheet.findUnique({
    where: { id: sheetId },
    // `restsUrl` because the preview asks whether a rest report was
    // collected at all. Left off the select it comes back undefined, which
    // is indistinguishable from "no report", which reads as restUnknown -
    // the difference between charging somebody and not.
    include: { batch: { select: { id: true, periodFrom: true, periodTo: true, partialPeriod: true, partialFrom: true, partialThrough: true, restsByDate: true, restsUrl: true } } },
  });
  // a sheet id from another batch would render somebody's days under the wrong
  // period heading, so the pairing is checked rather than assumed
  if (!sheet || sheet.batchId !== id) notFound();

  // HOW FAR THE BATCH'S DATA REACHES. The rest report spans everybody on the
  // batch and is the freshest thing in the export, so its last date is the
  // batch's reach even though only one sheet is loaded here.
  const reach = batchReach({ restsByDate: sheet.batch.restsByDate, timesheets: [sheet] });

  // HOW TO REACH THEM, on the page where the reason to reach them is.
  //
  // Every one of these findings ends in a conversation - "if they took it, it
  // needs logging in QuickSolve" is something somebody has to say to them - and
  // the number for it was two screens away in Contacts. Read here rather than
  // put on the sheet's own select, because it belongs to the ACCOUNT and a sheet
  // with no account matched has nobody to show.
  const contact = sheet.userId
    ? await prisma.user.findUnique({
      where: { id: sheet.userId },
      select: {
        name: true, preferredFirstName: true, preferredLastName: true,
        email: true, phone: true, title: true, workingHours: true,
      },
    })
    : null;

  // WHAT THEY SEE, OPENED AS THEM. Same gate as the all-employees list: the
  // token is only minted for SUPER, and `?preview=1` refuses every write on the
  // far side - except on a rehearsal batch, where the whole point is that it
  // behaves like the real thing.
  const canPreview = isSuper(user?.role);
  const previewToken = canPreview ? signTimesheetToken(sheet.id) : null;

  // WHAT THEY HAVE ALREADY SAID ABOUT A MISSED BREAK, for this person across
  // the whole period. Keyed the same way the marks are, so an answer taken on
  // Wednesday's export is still the answer on Thursday's.
  const breakAnswers = answersByFinding(
    sheet.userId
      ? await prisma.timesheetBreakAnswer.findMany({
        where: {
          periodFrom: sheet.batch.periodFrom,
          periodTo: sheet.batch.periodTo,
          personKey: sheet.userId,
        },
      })
      : [],
  );

  // BY PERSON AND PERIOD, not by this upload's sheet id. findFirst rather than
  // findUnique because there is no unique index on the new key yet: two uploads
  // of one fortnight can each carry a mark for the same person, and collapsing
  // them would mean deleting a row somebody made. Newest wins.
  const flag = sheet.userId
    ? await prisma.timesheetCheckFlag.findFirst({
      where: {
        periodFrom: sheet.batch.periodFrom,
        periodTo: sheet.batch.periodTo,
        personKey: sheet.userId,
        findingKey: "person",
      },
      orderBy: { updatedAt: "desc" },
      // `status` is what the chip reads. Left off the select it comes back
      // undefined, the chip renders as unset, and every mark on the batch
      // silently looks like nobody has started - which is the same trap
      // `restsUrl` sprang three times yesterday.
      select: {
        rowKey: true, status: true, via: true, flaggedName: true, flaggedImage: true,
        coveredThrough: true,
      },
    })
    : null;

  // EVERYTHING THE CHECKS SCREEN WOULD SAY ABOUT THEM, tied to the day it
  // happened on. Mánu 2026-08-12: "anything that would come up in the
  // corrections page should be tied to this. anything that comes up in the
  // datachecks page should be tied to this. even if our engine resolved it."
  //
  // This page used to render violations only, which is how Uribe 07/28 came to
  // read "nothing flagged" while the checks list carried a card saying his rest
  // was recorded off the clock. One day, two screens, opposite answers.
  //
  // The whole batch has to be loaded because the Rest Periods Report is one
  // document held on the BATCH and its rows are matched back to people by name -
  // there is no way to ask it for one person without it. The checks screen pays
  // the same cost.
  const full = await prisma.timesheetBatch.findUnique({
    where: { id },
    include: {
      timesheets: {
        orderBy: { sourceName: "asc" },
        select: { id: true, sourceName: true, signedAt: true, overrides: true, data: true },
      },
    },
  });
  const mine = buildFindings(full).entries.filter(
    (e) =>
      e.timesheetId === sheet.id &&
      // the violation row is ABOUT A PERSON and carries no date, and every one
      // of its findings is already drawn per day below with its own detail.
      // Keeping it would say the same thing twice under a vaguer heading.
      e.kind !== "violation",
  );
  const findingsByDate = new Map();
  for (const e of mine) {
    const k = e.date || "";
    if (!findingsByDate.has(k)) findingsByDate.set(k, []);
    findingsByDate.get(k).push(e);
  }
  for (const list of findingsByDate.values()) {
    list.sort((a, b) => kindOf(a).order - kindOf(b).order);
  }

  // Problems they reported, and the questions they answered. There are none in
  // the database on any batch today - Mánu clears them between test runs - so
  // this renders nothing until somebody reports or answers something. Wired
  // rather than left out, because the day it exists is the day somebody is on
  // the phone asking about it.
  const corrections = await prisma.timesheetCorrection.findMany({
    where: { timesheetId: sheet.id },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: {
      resolvedBy: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
    },
  });
  const correctionsByDate = new Map();
  for (const c of corrections) {
    const k = c.date || "";
    if (!correctionsByDate.has(k)) correctionsByDate.set(k, []);
    correctionsByDate.get(k).push(c);
  }

  const v = violationsFor(sheet.data);
  const byDate = sheet.data?.scheduleCheck?.byDate || {};

  // THE INPUTS THE RE-ANALYSIS NEEDS, built once for this person. Same two the
  // rebuild reconstructs, keyed the same way - `restNameFor` because the report
  // files Delgado Pineda, Ruth under "Delgado Pineda, Angel".
  const windows = restWindowsByDate(
    (sheet.batch.restsByDate || []).filter(
      (r) => restKey(r?.name || "") === restKey(restNameFor(sheet.sourceName, sheet.data)),
    ),
    { restRowTimes, clockMin, serviceFit },
  );
  const previewFor = (date) => ({
    scheduleByDate: byDate,
    restTimesFor: () => windows.get(date) || null,
    restSourceAvailable: !!sheet.batch.restsUrl,
    overrides: { [date]: { miscWorked: true } },
  });

  // a finding on a date they did not work, so no day card exists to hang it
  // under. Rest report rows do this: the report can carry a row for a date the
  // timesheet has no hours on. Shown rather than dropped.
  const dayDates = new Set((sheet.data?.days || []).map((d) => d.date));
  const orphans = [...findingsByDate.entries()].filter(([date]) => !dayDates.has(date));

  // THE SAME PICTURE THE CHECKS SCREEN DRAWS, built the same way - see the long
  // note in checks/page.js. Schedule parsing pulls in the pdf stack, so the
  // blocks are resolved here on the server and the client gets plain objects.
  // As the documents hold it, with no answers applied: this is the audit view.
  const restName = restNameFor(sheet.sourceName, sheet.data);
  const dayViews = new Map();
  for (const d of sheet.data?.days || []) {
    const blocks = [];
    for (const sh of byDate[d.date]?.shifts || []) {
      const at = blockTimes(sh.text);
      const service = serviceOf(sh.text);
      if (at && service) blocks.push({ from: at.start, to: at.end, service, meal: !!sh.meal });
    }
    const drawn = [];
    for (const row of sheet.batch.restsByDate || []) {
      if (row.date !== d.date || restKey(row.name) !== restKey(restName)) continue;
      const at = drawnRest(row, { mealScheduled: d.mealScheduled });
      if (at) drawn.push(at);
    }
    dayViews.set(d.date, {
      day: { date: d.date, punches: d.punches || [], breaks: d.breaks || [], miscBreaks: d.miscBreaks || [] },
      rests: drawn,
      scheduled: blocks,
      // THE SAME CALENDAR THE EMPLOYEE SEES, INCLUDING THIS. A meal the roster
      // booked inside a block being worked draws dashed on their page and drew
      // as an ordinary schedule block here, so the two screens disagreed about
      // the day the reviewer is ringing them about. Read from the engine, not
      // re-derived, and only where the day actually owes a meal.
      bookedMeal: !!(d.mealViolation && !d.mealLate && mealBookedInside(byDate[d.date])),
    });
  }

  const b = sheet.batch;
  const period = b.partialPeriod
    ? `${b.partialFrom} to ${b.partialThrough}`
    : `${b.periodFrom} to ${b.periodTo}`;

  return (
    // THE ONE PAGE WHERE "WHICH CARD ARE THEY ON" IS EXACT. They opened one
    // person; that is the row. On a scrolling list it would be a guess from
    // scroll position, so the list reads this rather than inventing its own.
    // NO PROVIDER HERE. It is mounted once in the batch layout so every
    // screen under a batch counts as being in it - and a second one under the
    // same user would overwrite the first on every beat, the two fighting
    // over which page they were on. This reads from that one through context.
    <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <BackLink href={back.href}>{back.label}</BackLink>
      <PresenceBar />
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">Admin</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {sheet.sourceName}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {period}
        {b.partialPeriod && " · partial period"} · {v.days.length}{" "}
        {v.days.length === 1 ? "day" : "days"} worked
      </p>

      {/* THEIR DETAILS AND THEIR PAGE, together, because they are the two halves
          of the same next step: every finding on this screen ends in somebody
          ringing them about it, and the thing worth having open while you do is
          what they can see. */}
      {(contact || previewToken) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-surface-2 px-4 py-3">
          {contact && (
            <>
              {/* NO NAME HERE. It is the h1 six lines up, and the export's
                  spelling is the one that matters on this screen anyway - it is
                  what every rest row is matched on. The title stays: it is the
                  one thing on this row the heading does not already say. */}
              {contact.title && (
                <span className="text-sm font-semibold text-foreground">{contact.title}</span>
              )}
              {contact.phone && (
                <a
                  href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                  className="text-sm font-medium text-brand underline-offset-2 hover:underline"
                >
                  {contact.phone}
                </a>
              )}
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="text-sm font-medium text-brand underline-offset-2 hover:underline"
                >
                  {contact.email}
                </a>
              )}
              {contact.workingHours && (
                <span className="text-sm text-muted">{contact.workingHours}</span>
              )}
            </>
          )}
          {!contact && (
            <span className="text-sm text-muted">
              No portal account is matched to this sheet, so there is nobody to contact and no
              page to open.
            </span>
          )}
          {previewToken && (
            <a
              href={`/t/${previewToken}?preview=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-sm font-semibold text-foreground transition hover:border-brand hover:text-brand"
            >
              Preview their timesheet review page →
            </a>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4 rounded-xl border border-border bg-surface p-5">
        {[
          ["Paid hours", f2(sheet.paidHours)],
          ["Premium hours", f2(sheet.premiumHours)],
          ["Days worked", String(v.days.length)],
          ["To raise", String(v.total)],
        ].map(([k, val], i) => (
          <div key={k}>
            <span className="block text-[11px] font-bold uppercase tracking-wide text-faint">
              {k}
            </span>
            <span
              className={`mt-0.5 block text-xl font-bold tabular-nums ${
                i === 3 && v.total ? "text-fuchsia-600 dark:text-fuchsia-400" : "text-foreground"
              }`}
            >
              {val}
            </span>
          </div>
        ))}
        <div className="ml-auto self-center">
          <span className="flex items-center gap-2">
            <CheckStatusChip flag={flag} reach={reach} />
            <FlagButton
              batchId={id}
              rowKey={`person-${sheet.id}`}
              personKey={sheet.userId}
              findingKey="person"
              coveredThrough={reach}
              flag={flag}
            />
          </span>
        </div>
      </div>

      {/* REBUILD THIS ONE SHEET.
          Until now the only way to reach `recomputeTimesheet` was a button that
          appears when a sheet has an override or a reported problem, so a clean
          sheet could not be rebuilt from anywhere in the portal at all. That
          matters more since the engine started re-running on rebuild: a batch
          uploaded before a rule landed keeps the old answer until something
          rebuilds it, and one person at a time is the safe way to start. */}
      {!sheet.signedAt && (
        <div className="mt-4 rounded-lg border border-border bg-surface-2 p-4">
          {/* COUNTED, NOT ASSUMED. This was `accepted={0}` unconditionally, so
              the line beside the button told anybody reading a sheet with
              accepted corrections on it that nothing had been accepted and the
              figures would stay put. The rows are already loaded above. */}
          <RecomputeButton
            timesheetId={sheet.id}
            accepted={corrections.filter((c) => c.status === "accepted").length}
          />
          <p className="mt-2 text-xs leading-relaxed text-faint">
            Recalculating re-runs the engine over their stored days, so any rule that
            landed after this batch was uploaded reaches them. It changes nobody
            else. What they are PAID cannot move: if it does, it refuses
            the re-analysis and keeps the figures the sheet already had.
          </p>
        </div>
      )}

      {/* WHY their rests are missing, once. Every one of their rest violations
          below is real and charged, but the cause is the same on all of them:
          the Rest Periods Report does not mention this person, so nothing
          recorded a break for them anywhere. Said per day it was the identical
          sentence five times down Aranda's page. */}
      {v.noReport > 0 && (
        <p className="mt-5 border-l-2 border-amber-600 pl-3 text-sm leading-relaxed text-amber-700 dark:text-amber-400">
          The Rest Periods Report never mentions this person, so nothing recorded
          a break for them anywhere. That is why{" "}
          {v.noReport === 1 ? "one of the rest findings below reads" : `all ${v.noReport} of the rest findings below read`}{" "}
          as nothing taken. Getting them into that report in QSP is what settles
          it, and one decision moves all of it at once.
        </p>
      )}

      <h2 className="mt-9 text-xs font-bold uppercase tracking-wide text-faint">
        Day by day{" "}
        <span className="text-[11px] font-semibold normal-case tracking-normal tabular-nums">
          {v.days.length}
        </span>
      </h2>

      <div className="mt-3 space-y-3">
        {v.days.map(({ day: d, list }) => {
          // "NOTHING FLAGGED" HAS TO MEAN NOTHING, and it did not: this page
          // knew only about violations, so a day carrying an off-clock rest and
          // a misfiled report row still announced itself as clean. Uribe 07/28
          // is the one Mánu opened. The claim now counts everything the day
          // actually holds.
          const also = findingsByDate.get(d.date) || [];
          const said = correctionsByDate.get(d.date) || [];
          const quiet = !list.length && !also.length && !said.length;

          // MISC TIME NOBODY HAS ACCOUNTED FOR YET.
          //
          // `miscBlocks` is absent from every day stored before 2026-08-12, so
          // this control appears only on a batch that has been recomputed or
          // re-uploaded since. That is the honest behaviour: the field is the
          // engine's own answer, and inventing it on the screen would be a
          // second opinion about which blocks were Misc.
          const misc = d.miscBlocks || [];
          const ov = sheet.overrides?.[d.date] || {};
          // WHAT THE EXPENSIVE ANSWER WOULD COST.
          //
          // Worked out through the SAME re-analysis the rebuild runs, not
          // through `patchesFor`. The patch no longer carries an entitlement at
          // all - it records the flag and the engine decides - so asking it what
          // "worked" costs would now come back with nothing, and asking it the
          // old way was wrong on 3 of 33 days because it could not see the
          // schedule blocks and its meal test ignored the waiver.
          const wouldAdd = misc.length && !ov.miscKind ? costOfWorked(d, previewFor(d.date)) : 0;
          return (
          // EACH DAY REPORTS ITSELF, so two people inside the same person's page
          // can see which day the other is reading. Hovering a day outranks the
          // page's own row - it is the more precise answer - and letting go
          // falls back to "they have this person open".
          //
          // The date is stripped to digits because the row key is sanitised to
          // letters, numbers and dashes on the way to redis, and "07/31/26"
          // would otherwise collide with "073126" from any other shape.
          <PresenceCard
            key={d.date}
            rowKey={`day-${sheet.id}-${String(d.date).replace(/\D/g, "")}`}
            // `card-lift` here too, so a day behaves like every other card in
            // the portal. The employee rows got it and these did not, which made
            // this the one list that sat flat under the pointer.
            className={`card-lift rounded-lg border border-border bg-surface p-4 shadow-sm border-l-4 ${
              list.length
                ? "border-l-fuchsia-500"
                : also.length || said.length
                  ? "border-l-violet-500"
                  : "border-l-emerald-700/40"
            }`}
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-sm font-semibold tabular-nums text-foreground">{d.date}</p>
              <p className="text-xs text-faint">{f2(d.paidHours)} hrs</p>
              {list.length > 0 && (
                <p className="text-sm font-semibold text-fuchsia-700 dark:text-fuchsia-300">
                  {list.map(violationHead).join(", ")}
                </p>
              )}
              {!list.length && (also.length > 0 || said.length > 0) && (
                <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">
                  {also.length + said.length === 1
                    ? "1 thing to look at"
                    : `${also.length + said.length} things to look at`}
                </p>
              )}
              {quiet && (
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  nothing flagged
                </p>
              )}
            </div>

            {/* WHAT DID THEY SAY? The one thing none of the four QSP exports
                carries.
                ONE CONTROL PER VIOLATION, not per day. A day can be short a meal
                AND two rests, and those are two different conversations with two
                different answers - a single pair of buttons could only record one
                of them. The rest control also offers every count the day allows,
                because "took one of the two" is a real answer. */}
            {sheet.userId && list.map((x) => {
              const isRest = x.kind === "rest-not-taken";
              const kind = isRest ? "rest" : x.kind === "meal-late" ? "meal-late" : "meal";
              // THREE KINDS, THREE KEYS - a late meal and a missing meal are
              // different questions about the same day and must not share a row.
              //
              // Built by `breakFindingKey` now rather than spelled out here. The
              // employee's own page has to produce the IDENTICAL string, because
              // a reason taken on a call and a reason they typed are the same
              // fact about the same day and belong in one row. Two spellings of
              // this would be two rows that can disagree, both printing.
              const key = breakFindingKey(kind, d.date);
              return (
                <BreakAnswer
                  key={x.kind}
                  batchId={id}
                  personKey={sheet.userId}
                  findingKey={key}
                  date={d.date}
                  kind={kind}
                  // how many the day is SHORT. `short` is the rest shortfall; a
                  // meal is always the one.
                  missing={isRest ? (x.short || 1) : 1}
                  noRoom={!!x.noRoom}
                  label={VIOLATION_KINDS[x.kind].label}
                  answer={breakAnswers.get(markKey(sheet.userId, key)) || null}
                />
              );
            })}

            {list.length > 0 && (
              <ul className="mt-2 divide-y divide-border border-y border-border">
                {list.map((x) => (
                  <li key={x.kind} className="grid gap-x-4 gap-y-0.5 py-2 text-xs sm:grid-cols-[190px_200px_1fr]">
                    <span className="font-semibold text-fuchsia-700 dark:text-fuchsia-300">
                      {VIOLATION_KINDS[x.kind].label}
                    </span>
                    <span className="text-muted">{x.detail}</span>
                    {/* what to say to them. the only reason this screen exists,
                        and it comes from the kind table so the list and this
                        page cannot end up phrasing it differently. */}
                    {/* WHAT TO SAY TO THEM, and on a day that could not have held
                        a meal that is a different sentence: the usual one sends
                        somebody to QuickSolve to punch one in, and there is
                        nothing there to punch. From the kind table either way, so
                        the list and this page cannot phrase it differently. */}
                    <span className="italic text-faint">
                      {(x.noRoom && VIOLATION_KINDS[x.kind].askNoRoom) || VIOLATION_KINDS[x.kind].ask}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* EVERYTHING ELSE THE CHECKS SCREEN HOLDS ABOUT THIS DAY, in its
                own words - the copy comes from `findings.js` rather than being
                written again here, so the two screens cannot describe one
                finding two ways. The settled ones are here too: "we looked and
                it was fine" is the answer somebody needs on the phone. */}
            <Findings list={findingsByDate.get(d.date)} />
            <Reported list={correctionsByDate.get(d.date)} />

            {misc.length > 0 && (
              <MiscClassify
                timesheetId={sheet.id}
                date={d.date}
                blocks={misc}
                miscMin={d.miscMin || 0}
                paidHours={d.paidHours || 0}
                kind={ov.miscKind || d.miscKind || null}
                by={ov._source === "misc-classify" ? ov._by : null}
                at={ov._source === "misc-classify" ? ov._at : null}
                wouldAdd={wouldAdd}
                restRequired={d.restRequired || 0}
                mealRequired={!!d.mealRequired}
              />
            )}

            {/* PUTTING A DAY BACK, FROM THE PAGE THE DAYS ARE ON.
                Added 2026-08-17. `clearDayOverride` had exactly one caller, the
                green box on a Data checks row of kind `flag` - a day where the
                schedule and the timesheet disagree about the hours. Measured:
                0 of those in July across 59 sheets, 1 in August on somebody
                carrying no override. So the control had never rendered
                anywhere, and the 2026-08-16 fix that makes it delete the day's
                ANSWERS had never been seen.

                Most overrides come from an answer, which is the case that fix
                is about, and an answer lands on whatever day it is about rather
                than on a mismatch day.

                NOT ON A MISC-CLASSIFY DAY: `MiscClassify` above has its own
                undo for exactly those, sitting with the classification it
                undoes. Two undo buttons on one day is worse than the one that
                was missing.

                NOT ON A SIGNED SHEET, matching the Data checks row, which is
                gated on `!e.signed`. Changing the figures under a signature
                leaves somebody attesting to a document that no longer says
                what they signed. */}
            {!sheet.signedAt &&
              ov._source !== "misc-classify" &&
              Object.keys(ov).length > 0 && (
                <UndoDay timesheetId={sheet.id} date={d.date} ov={ov} />
              )}

            <DayPeek {...(dayViews.get(d.date) || {})} />
          </PresenceCard>
          );
        })}
      </div>

      {/* A finding on a date they did not work, so there is no day card to hang
          it under. The Rest Periods Report does this: it can carry a row for a
          date the timesheet has no hours on. Dropping them would be the same
          fault this page was just fixed for. */}
      {orphans.length > 0 && (
        <>
          <h2 className="mt-9 text-xs font-bold uppercase tracking-wide text-faint">
            On days with no hours{" "}
            <span className="text-[11px] font-semibold normal-case tracking-normal tabular-nums">
              {orphans.reduce((n, [, l]) => n + l.length, 0)}
            </span>
          </h2>
          <div className="mt-3 space-y-3">
            {orphans.map(([date, l]) => (
              <div key={date || "no-date"} className="rounded-lg border border-border bg-surface p-4 border-l-4 border-l-violet-500">
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {date || "No date on the record"}
                </p>
                <Findings list={l} />
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-8 rounded-lg border border-border bg-surface-2 p-4 text-sm text-muted">
        <p className="font-semibold text-foreground">Fixing these</p>
        <p className="mt-1">
          Correct the entries in QSP, then upload the period again. Nothing on
          this page edits QSP, and nothing here has changed their hours - a
          violation is charged from what the documents already say.
        </p>
        <p className="mt-2">
          <a
            href={`/portal/admin/timesheets/sheet/${sheet.id}/download`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand underline underline-offset-4"
          >
            Open their sheet
          </a>{" "}
          to see the document itself.
        </p>
      </div>
    </section>
  );
}
