import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyTimesheetToken } from "@/lib/timesheet-token";
import { preferredName } from "@/lib/contacts";
import { sheetDisplayName } from "@/lib/timesheet/display-name";
import TimesheetSigner from "./TimesheetSigner";
import BreakReason from "./BreakReason";
import { employeeAsk, breakFindingKey, resetAction } from "@/lib/timesheet/break-answers";
import ReportProblem from "./ReportProblem";
import TimesheetQuestion from "./TimesheetQuestion";
import TimesheetViews from "./TimesheetViews";
import DayByDay from "./DayByDay";
import {
  submitSignedTimesheet,
  submitTimesheetCorrections,
  answerTimesheetQuestion,
  acknowledgeSpan,
} from "@/app/portal/admin/timesheets/actions";
import {
  correctionLabel, employeeResolution, resolutionTakesReason, reviewerSettledDates,
} from "@/lib/timesheet/corrections";
import {
  buildQuestions, signingGate, dependencyGate, questionId, answerProgress,
} from "@/lib/timesheet/questions";
import { blockTimes, serviceOf } from "@/lib/timesheet/schedule";
import { restKey, restNameFor } from "@/lib/timesheet/rests";
import { drawnBreaksFor, mealAmPmSlip } from "@/lib/timesheet/recorded-breaks";
import { premiumStanding } from "@/lib/timesheet/premium-split";
import { answerBreakReason } from "@/app/portal/admin/timesheets/actions";
import { getCurrentUser } from "@/lib/current-user";
import { isSuper } from "@/lib/roles";
import { sendModeSummary } from "@/lib/timesheet-mode";
import { sendTimesheets } from "@/app/portal/admin/timesheets/actions";
import PreviewSend from "./PreviewSend";
import PreviewReset from "./PreviewReset";
import LiveRefresh from "./LiveRefresh";
import ModeBar from "./ModeBar";
import { restMealPolicyLink } from "@/lib/policy-form";

// no-login page where an employee reviews and signs their own timesheet. lives
// outside /portal so proxy.js doesn't bounce it to login - the signed token IS
// the credential, and it only ever unlocks this one timesheet.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Timesheet review · My Life Services",
  robots: { index: false, follow: false },
};

export default async function SignTimesheetPage({ params, searchParams }) {
  const { token } = await params;
  const id = verifyTimesheetToken(token);
  if (!id) notFound();

  // WHICH OF THE TWO MODES A REVIEWER IS IN, and the safe one is the default.
  //
  // The token alone opens this page - it is the credential, and it has to be,
  // because the person it belongs to has no login. So neither parameter GRANTS
  // anything; they only pick which mode a signed-in SUPER gets, and a stranger
  // appending either to a leaked link still gets the ordinary page.
  //
  // PREVIEW IS WHAT YOU LAND IN. It used to be the other way round: a reviewer
  // opening somebody's link without `?preview=1` had every write live, on a real
  // payroll record, with nothing on screen saying so - and the first thing
  // anybody does on a page like this is click something. This batch has already
  // lost one answer to a stray click. So the live half is now a deliberate press
  // rather than the state you arrive in by forgetting a parameter.
  const sp = await searchParams;
  const viewer = await getCurrentUser();

  const refuse = async () => {
    "use server";
    return { ok: false, error: "preview" };
  };

  // AN ANSWER GIVEN IN LIVE IS THEIRS, not the reviewer's. The mode is for the
  // call where they cannot get this page up on their phone: the words are
  // theirs, the reviewer is the one holding the mouse, and their signature is
  // still what makes any of it count. Bound here so the choice is the server's
  // and never something the browser can send.
  const answerAsThem = async (args) => {
    "use server";
    return answerTimesheetQuestion({ ...args, actor: "employee" });
  };

  const ts = await prisma.timesheet.findUnique({
    where: { id },
    include: {
      // `id` and the employee's email are for the preview's send button, which
      // is the only thing on this page that needs either
      // `testOnly` decides what this page CALLS them - see `sheetDisplayName`.
      // Left out it arrives undefined, reads as an ordinary batch, and the page
      // shows the account's name while the sheet under it shows another. Third
      // time this select has caught me today.
      batch: {
        select: {
          id: true, periodFrom: true, periodTo: true, restsByDate: true,
          testOnly: true, program: true,
        },
      },
      user: { select: { name: true, preferredFirstName: true, preferredLastName: true, email: true } },
      // every correction, not just the open ones: the open ones block signing,
      // and the resolved `q_` rows are the answers already given to the five
      // pre-signing questions. one relation, so it cannot be included twice.
      corrections: {
        select: {
          id: true, date: true, kind: true, note: true, status: true,
          createdAt: true, resolutionNote: true,
          // which of a three-outcome card they picked. Same trap as
          // `statedBreaks` below: left out it is undefined rather than absent,
          // and every such answer reloads showing the wrong button.
          choice: true,
          // needed to tell a partial from a plain decline - see `partials`
          // below. Left out, it comes back undefined and every partial reloads
          // as "Missed them", which is a different thing to have told payroll.
          statedBreaks: true,
          // the question as it was asked, which is what brings an answered card
          // back once its finding is resolved. Left out it arrives undefined,
          // every restore silently does nothing, and the page looks exactly as
          // it did before the fix - the `restsUrl` failure again.
          question: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!ts) notFound();

  // WHETHER PREVIEW ACTUALLY REFUSES, which is not the same question as whether
  // this IS a preview.
  //
  // The refusal exists for one reason: a stray click while looking at somebody
  // else's page must not land on a real person's record. On a REHEARSAL BATCH
  // that reason does not apply - `testOnly` means every rule holds exactly as it
  // does live and the only thing that differs is that its mail goes to one
  // address. Refusing there makes the one batch kept for rehearsing the only one
  // that cannot be rehearsed, which is backwards.
  //
  // So the guard narrows to what it was actually protecting: a preview of a real
  // person's real batch still refuses everything, and a preview of a test batch
  // behaves exactly like the employee's own page.
  // A SUPER READING THEIR OWN SHEET IS NOT A REVIEWER. They arrive here to sign
  // it like anybody else, and putting them in a mode they have to click out of
  // would stop them signing their own timesheet.
  const ownSheet = !!viewer?.id && viewer.id === ts.userId;
  // `realRole`, because "view as" must not hand somebody the employee's page.
  // `getCurrentUser` swaps `role` for the previewed one, so a SUPER viewing as
  // STAFF reads as an ordinary visitor here - which would put them back on the
  // unlabelled page where every click is live, the one thing this replaces.
  // The answer action already resolves the actor the same way.
  const reviewing = isSuper(viewer?.realRole || viewer?.role) && !ownSheet;
  const live = reviewing && !!sp?.live;
  const preview = reviewing && !live;

  const rehearsal = !!ts.batch?.testOnly;
  const refuses = preview && !rehearsal;
  const act = (real) => (refuses ? refuse : real);

  const openCorrections = ts.corrections.filter((c) => c.status === "open");

  // WHERE THIS PERSON'S PREMIUM ACTUALLY STANDS. The same function the email
  // and the PDF read, so the three cannot tell three different stories - which
  // is exactly what they were doing before 2026-08-09 late.
  const standing = premiumStanding(ts.data?.days || [], ts.corrections);

  // the signed policy the questions rest on, so the sentence naming it can be
  // opened. Only looked up when there is an assumption left to explain.
  const policy = standing.assumptions > 0 ? await restMealPolicyLink() : null;

  // EVERY QUESTION THIS SHEET RAISES, from the one classifier the server action
  // re-derives from too. THEY NO LONGER ALL BLOCK SIGNING: after the 2026-08-11
  // flip, leaving a break question alone keeps the pay on, so `signingGate` is
  // what decides - only a change we made or data we could not read holds a
  // signature up.
  // WHICH DAYS A REVIEWER ALREADY DECIDED THE MISC TIME ON. Those are settled
  // and are never put to the employee; a day they answered THEMSELVES keeps its
  // question so they can change it. `_source` is written only by
  // `classifyMiscTime`, so this is the one thing that tells the two apart -
  // both routes write the same `miscKind` onto the day.
  // the same helper the answer action uses, so the set the page renders from
  // and the set the server validates against cannot drift
  const reviewerSettled = reviewerSettledDates(ts.overrides);
  const questions = buildQuestions(ts.data, {
    restRows: ts.batch.restsByDate || [],
    sourceName: ts.sourceName,
    reviewerSettled,
  });
  // answers live per date and per kind; a grouped question counts as answered
  // once any of its dates has an answer, because it is answered as one thing
  const answered = ts.corrections.filter(
    (c) => String(c.kind || "").startsWith("q_") && c.status !== "open",
  );

  // NOTHING THEY ANSWERED DROPS OFF THE PAGE.
  //
  // An answer that resolves its finding deletes its own question, so the card
  // carrying "Change this" went with it and a mis-click could not be corrected.
  // Every premium-bearing issue has to stay here and stay changeable until the
  // signature: the correction usually happens while they are on the phone, and
  // they need to see it land before they sign.
  //
  // Restored from the snapshot frozen on the answer, not rebuilt - rebuilding
  // from `data.daysOriginal` was measured and cannot do it. Rows written before
  // 2026-08-16 carry no snapshot and behave as they did.
  //
  // Only where the question is genuinely gone. A live question always wins, so
  // a day whose figures have since moved shows what it asks NOW rather than
  // what it asked then.
  const liveKeys = new Set(
    questions.flatMap((q) => (q.dates || [q.date]).map((d) => `${q.kind}|${d}`)),
  );
  const restored = [];
  const seenRestored = new Set();
  for (const c of answered) {
    const kind = String(c.kind).slice(2);
    if (!c.question || liveKeys.has(`${kind}|${c.date}`)) continue;
    const q = c.question;
    if (!q.id || seenRestored.has(q.id)) continue;
    seenRestored.add(q.id);
    restored.push(q);
  }
  if (restored.length) questions.push(...restored);
  const answers = {};
  // A DECLINED ANSWER THAT STILL CARRIES TIMES IS A PARTIAL - "I got one of my
  // two tens". A plain decline clears `statedBreaks`, so nothing else can leave
  // times on a declined row, and that is what lets the card come back showing
  // "Took one" instead of "Missed them" after a reload. No third status and no
  // migration for it.
  const partials = {};
  // the times they gave, so an answered card can show what they said instead of
  // re-rendering the whole question. Mánu 2026-08-11: "after the answer is given
  // i dont think it should show the options like this ... so they arent in
  // scrolling hell after a long time sheet."
  const answerTimes = {};
  // WHICH OF A CARD'S OUTCOMES THEY PICKED, where there are more than two.
  // `status` cannot say - it holds accepted or declined - and on
  // `restTooLongOffClock` two of the three answers are declines that move no
  // figure. Null on rows written before the column existed; the card falls back
  // to reading the status the way it always did.
  const choices = {};
  for (const q of questions) {
    const dates = q.dates || [q.date];
    // EVERY ROW THE ANSWER WROTE, not just the first. A grouped question writes
    // one correction per date and each now carries only ITS OWN times, so
    // reading the first row showed one date on a card that covers three.
    const hits = answered.filter((c) => c.kind === `q_${q.kind}` && dates.includes(c.date));
    if (!hits.length) continue;
    answers[q.id] = hits[0].status;
    if (hits[0].choice) choices[q.id] = hits[0].choice;
    const times = hits.flatMap((h) => (Array.isArray(h.statedBreaks) ? h.statedBreaks : []));
    if (times.length) {
      answerTimes[q.id] = times;
      if (hits[0].status === "declined") partials[q.id] = true;
    }
  }
  // WHO MAY SIGN, AND WHAT THE POPUP COUNTS. Two tiers: a question where the
  // engine CHANGED the document or could not READ it has to be settled first;
  // a break-premium question never blocks, because ignoring it is the choice
  // that keeps their pay. Measured on the live batch: 54 of 59 could sign
  // straight away, 5 gated on 6 questions.
  const gate = signingGate(questions, ts.corrections);

  // THE SHEET DOES NOT GENERATE UNTIL EVERY QUESTION ON IT HAS AN ANSWER,
  // 2026-08-14.
  //
  // `signingGate.canSign` has been unconditionally true since 2026-08-12, and
  // the reasoning was sound at the time: after the flip, leaving a question
  // alone KEEPS the pay, so blocking on silence held somebody's timesheet
  // hostage to a question whose safe answer they had already given by not
  // touching it.
  //
  // What changed is that silence is no longer the only safe answer to give. A
  // "no" now records WHY - the one half no QSP export carries - and that only
  // exists if somebody actually answers. A sheet generated over fifteen
  // untouched cards is a document with fifteen unexplained findings on it.
  //
  // COUNTED PER QUESTION, not per kind: `answerProgress` is the one function
  // that gets that right, and every screen that counted `new Set(kinds).size`
  // was wrong the moment one kind emitted two questions.
  //
  // Measured before building: 51 of 60 people on the live batch have at least
  // one, median 4 and most 11; July is 57 of 59, median 13 and most 24.
  const progress = answerProgress(questions, ts.corrections);

  // A REASON SOMEBODY RECORDED ON THEIR BEHALF, WAITING ON THEM.
  //
  // Separate from `signingGate` on purpose. That gate deliberately lets a sheet
  // be signed at any time, because leaving a question alone is the answer that
  // keeps their pay and blocking on silence held sheets hostage. This is not
  // silence: a reviewer has already put words in their mouth about a break they
  // did not take, and those words are about to be printed on the document. So
  // it is either checked or written before the sheet can be generated.
  //
  // Keyed on the period, so an answer taken against one export is still the
  // question on the next.
  // EVERY ANSWER, NOT ONLY THE ONES STILL WAITING. `breakAsks` below is the
  // filtered half - a row whose reason is written and checked has no `mode` and
  // drops out, which is right for the cards asking a question and wrong for the
  // panel reading their answers back. That panel needs exactly the rows this one
  // throws away.
  const breakAnswers = ts.userId
    ? (await prisma.timesheetBreakAnswer.findMany({
      where: {
        program: ts.batch.program || "MLS",
        periodFrom: ts.batch.periodFrom,
        periodTo: ts.batch.periodTo,
        personKey: ts.userId,
      },
      orderBy: { date: "asc" },
    }))
      .map((r) => ({
        ...r,
        mode: employeeAsk(r),
        // HOW LATE IT ACTUALLY WAS, which lives on the day rather than on the
        // answer. "5 hours 30 minutes into the day" is a fact somebody can check
        // against their own memory; "meal-late" is not.
        lateMinutes: r.kind === "meal-late"
          ? (ts.data?.days || []).find((d) => d.date === r.date)?.mealStartedAfterMin ?? null
          : null,
      }))
    : [];
  const breakAsks = breakAnswers.filter((r) => r.mode);
  // THEIR OWN WORDS, BY THE DAY AND THE BREAK THEY ARE ABOUT.
  //
  // `confirmedText` is what the employee typed. `reason` may be ours, taken off
  // a call, and an unchecked one must not be read back to them as something
  // they said - the card asking them to check it is still on the page. So ours
  // only counts once they have confirmed it.
  const saidByFinding = new Map();
  for (const r of breakAnswers) {
    const words = r.confirmedText || (r.confirmedAt ? r.reason : null);
    if (words) saidByFinding.set(r.findingKey, words);
  }
  // and the same thing as a plain object, because a Map does not survive the
  // trip to a client component
  const reasonsOnRecord = Object.fromEntries(saidByFinding);
  // THE ANSWER ROW AND THE REASON ROW ARE KEYED DIFFERENTLY, so this is the join.
  // A correction is `q_<kind>` on a date; a reason is `breakFindingKey` on the
  // same date. `nothingDocumented` is the pre-split kind and could be either
  // break, so both slots are tried rather than guessing one.
  const REASON_SLOT = {
    nothingDocumentedMeal: ["meal"],
    nothingDocumentedRest: ["rest"],
    nothingDocumented: ["meal", "rest"],
    mealLate: ["meal-late"],
  };
  const reasonFor = (c) => {
    const slots = REASON_SLOT[String(c.kind || "").replace(/^q_/, "")] || [];
    for (const slot of slots) {
      const said = saidByFinding.get(breakFindingKey(slot, c.date));
      if (said) return said;
    }
    return null;
  };
  // the question a correction answered, where the sentence needs something the
  // correction row does not carry. Only the two-lunches card does: which of its
  // three outcomes a decline was is on `choice`, but WHICH decline sentence is
  // right depends on the day having carried two lunches, and that is on the
  // question. Everything else ignores the second argument.
  const questionFor = (c) => {
    const kind = String(c.kind || "").replace(/^q_/, "");
    return questions.find(
      (q) => q.kind === kind && (q.dates || [q.date]).includes(c.date),
    ) || null;
  };
  // WHAT CANNOT BE ANSWERED YET, and what changing an answer would disturb.
  // A question whose answer moves the hours re-derives the day, so the break
  // questions for those same dates are asking about premiums that may be about
  // to stop existing. Scoped to the overlapping dates only.
  const deps = dependencyGate(questions, ts.corrections);

  // ONE CARD PER `batch`, FALLING BACK TO THE KIND. `restIsMealLength` keeps a
  // row per day inside its card, which the component handles when it is handed
  // more than one question.
  //
  // Grouping on the kind alone was right until the breaks question split into a
  // meal kind and a rest kind on 2026-08-10: that would have given somebody two
  // separate cards asking about the same days, one for lunches and one for tens.
  // They share a `batch`, so they stay one card and the day keeps its parts
  // together.
  //
  // FALLING BACK TO `questionId`, NOT THE BARE KIND, since 2026-08-12. The kind
  // was the same thing as the id right up until `restOutsideScheduled` started
  // emitting one question per date - and grouping on the kind put all three of
  // Uribe's back into the single card he had just asked to be rid of, which is
  // why splitting them in the engine appeared to do nothing at all on screen.
  //
  // `questionId` is already the right authority: it returns the bare kind for a
  // GROUPED kind and `kind:date` for everything else, so what shares a card is
  // decided in exactly one place instead of two that can disagree.
  // WHAT THE ROSTER BOOKED EACH STRETCH OF THE DAY AS, so the calendar can name
  // it. Read here, on the server, because `schedule.js` pulls in the pdf stack
  // and none of that belongs in a browser bundle - the client is handed plain
  // {from, to, service} and nothing else. The client name is dropped in
  // `serviceOf`, so it never reaches the page at all.
  // WHAT THE TWO-LUNCHES ANSWER DOES TO THE PICTURE.
  //
  // Mánu 2026-08-12: "when they confirm what it is the change can happen live to
  // that calendar view." All three answers move no money, so the ONLY thing they
  // can change is what the day shows - which makes the picture the entire point
  // of asking, and a card whose answer changed nothing visible would read as
  // having been ignored.
  //
  //   yes        both lunches are real, so both stay drawn
  //   no         the recorded one was added by accident - it comes off
  //   wrongone   only one lunch happened and the RECORDED one is it, so the
  //              lunch on the SCHEDULE is the wrong record and that comes off
  //
  // Keyed on date AND the row's own out-time, so a day carrying two of these
  // does not answer for both at once.
  //
  // THE DATA CHECKS CALENDAR DOES NONE OF THIS, deliberately - see the note on
  // `dayViews` there. That one is the audit picture and stays as QSP wrote it.
  const droppedRest = new Set();
  const droppedRosteredMeal = new Set();
  for (const q of questions) {
    if (q.kind !== "restTooLongOffClock" || !q.date) continue;
    const picked = choices[q.id];
    if (picked === "no") droppedRest.add(`${q.date}|${q.at}`);
    if (picked === "wrongone") droppedRosteredMeal.add(q.date);
  }

  const scheduledByDate = {};
  for (const [date, row] of Object.entries(ts.data?.scheduleCheck?.byDate || {})) {
    const blocks = [];
    for (const sh of row?.shifts || []) {
      const t = blockTimes(sh.text);
      const service = serviceOf(sh.text);
      if (!t || !service) continue;
      // they told us the rostered lunch is the record that is wrong
      if (sh.meal && droppedRosteredMeal.has(date)) continue;
      // A MEAL ROSTERED AT MIDNIGHT IS AN AM/PM SLIP, and this is the second
      // place that has to know it. `recordedBreaksFor` has read it twelve hours
      // over since 2026-08-09; this loop did not, and `dayWindow` grows the axis
      // to hold anything drawn - so one 12a-12:10a block ran that day's column
      // from 12a to 5p, seventeen hours and 1530px, for a day worked 9a to
      // 4:45p. The rostered lunch sat alone at the top and the whole worked day
      // was squashed into the bottom third.
      //
      // The times it WAS are carried through, because a block silently moved
      // twelve hours is a block the employee cannot check against their own
      // schedule.
      const slip = sh.meal ? mealAmPmSlip(t.start, t.end) : null;
      blocks.push({
        from: slip ? slip.from : t.start,
        to: slip ? slip.to : t.end,
        service,
        meal: !!sh.meal,
        ...(slip ? { ampmFixed: true, wasFrom: t.start, wasTo: t.end } : null),
      });
    }
    if (blocks.length) scheduledByDate[date] = blocks;
  }

  // THE REST ROWS FILED UNDER THIS PERSON'S OWN NAME, by date.
  //
  // Read straight off the report rather than out of a question, because a day
  // whose rests are all accounted for asks nothing - and that is exactly the day
  // that was drawing no rest at all. Mánu 2026-08-12 on his 07/30: "it says
  // nothing to check on this day ... it should show the miscellaneous time from
  // twelve to twelve ten. as well as the rest overlapping that exact time."
  //
  // MATCHED WITH THE ENGINE'S OWN `restKey`, not a second spelling of it, and
  // only where the name matches exactly. This is display only - it draws a block
  // and moves no figure - which is the difference between it and the recount
  // that once invented three premium hours for the wrong Delgado Pineda.
  //
  // AGAINST THE NAME THE REPORT USES, which is not always the one on the sheet.
  // "Delgado Pineda, Ruth" is filed under "Delgado Pineda, Angel" in the rest
  // report, and this page drew her no rest blocks at all while her signed sheet
  // counted them. `restNameFor` reads back the spelling upload already matched
  // through her portal account; it scores nothing here. See `restNameFor`.
  // WHERE EACH ROW IS DRAWN IS `drawnRest`'S ANSWER, not this loop's.
  //
  // It used to filter on `countsAsTaken` and take `Math.min` of the two columns,
  // and that is wrong in both directions on the rows that matter most. A
  // meal-length row never counts, so it drew nothing; a REPAIRED row drew at its
  // recorded time, so Martinez 07/23 - which the engine reads as a ten at
  // 3:50-4:00 and the signed sheet draws there - appeared on his own calendar as
  // fifty minutes starting at 3p. A picture beside a question about a break has
  // to agree with the document the question is about.
  //
  // AND THE ANSWER MOVES THE BLOCK. `drawnBreaksFor` folds in `statedBreaks` and
  // `statedRest` exactly as the sheet's `entriesFor` does, so a break the
  // employee has corrected is drawn where they said it was and the recorded one
  // it replaced stops being drawn. This loop used to read the report rows alone:
  // Uribe answered his 07/28 ten "the time was entered wrong, it was 11:50a",
  // the sheet rebuilt to 11:50a, the card said so - and the calendar underneath
  // still drew 12p-12:10p, which is the one place he would look to check.
  const mine = restKey(restNameFor(ts.sourceName, ts.data));
  const dayOn = new Map((ts.data?.days || []).map((d) => [d.date, d]));
  const rowsByDate = {};
  for (const row of ts.batch.restsByDate || []) {
    if (!row.date || restKey(row.name) !== mine) continue;
    (rowsByDate[row.date] ||= []).push(row);
  }
  const restsByDate = {};
  for (const date of new Set([...Object.keys(rowsByDate), ...dayOn.keys()])) {
    const d = dayOn.get(date) || null;
    const blocks = drawnBreaksFor(rowsByDate[date] || [], d, {
      mealScheduled: d?.mealScheduled ?? null,
      dropped: droppedRest,
    });
    if (blocks.length) restsByDate[date] = blocks;
  }

  // THEIR OWN ANSWER, PER QUESTION, for the panel at the top of the page. Built
  // here because `employeeResolution` needs the correction row and the question
  // together, and only this file has both.
  const saidById = {};
  for (const q of questions) {
    const hit = answered.find(
      (c) => c.kind === `q_${q.kind}` && (q.dates || [q.date]).includes(c.date),
    );
    if (hit) {
      const said = employeeResolution(hit, q);
      if (said) saidById[q.id] = said;
    }
  }

  // WHICH BACKWARDS ENTRIES HAVE BEEN TAKEN ON. Keyed to THIS sheet on purpose,
  // so a re-upload that still holds the times the wrong way round asks again.
  const ackOn = new Set(
    ts.corrections
      .filter((c) => String(c.kind || "").startsWith("fix_reversed_") && c.date)
      .map((c) => `${c.date}|${String(c.kind).replace("fix_reversed_", "")}`),
  );

  const cardKey = (q) => q.batch || questionId(q);
  const byKind = [];
  for (const q of questions) {
    const found = byKind.find((g) => cardKey(g[0]) === cardKey(q));
    if (found) found.push(q);
    else byKind.push([q]);
  }

  // THIS USED TO ASK FOR `ts.pdfUrl` AND NOTHING HAS ONE SINCE THE SHEET WENT
  // ON DEMAND. `rebuildSheetFor` nulls it deliberately - "the stored copy is
  // gone: the sheet is rendered on demand now" - and the viewer below reads
  // /t/[token]/pdf, which renders from `data` and never looks at pdfUrl. So the
  // gate was turning every single employee link into "isn't ready yet",
  // including the two that went to real people.
  //
  // What it was actually guarding is a sheet that cannot be rendered at all,
  // which is what the pdf route itself 404s on: no day rows.
  if (!(ts.data?.days || []).length) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          This timesheet isn&apos;t ready yet
        </h1>
        <p className="mt-3 text-base text-muted">
          Your link is valid, but the document didn&apos;t finish generating on our
          end. Nothing is wrong with your hours - payroll needs to re-send it.
          You can reply to the email that brought you here.
        </p>
      </section>
    );
  }

  // WHAT THIS PAGE CALLS THEM, which is not what the engine matches them by -
  // see `sheetDisplayName`. On a rehearsal batch it is the first name alone, so
  // a recording says "Manu" without `sourceName` being rewritten and every rest
  // row filed under the old spelling being stranded.
  const who = sheetDisplayName({
    user: ts.user, sourceName: ts.sourceName, batch: ts.batch,
    fallback: ts.user ? preferredName(ts.user) : null,
  });
  const period = `${ts.batch.periodFrom} to ${ts.batch.periodTo}`;

  return (
    // wider than a reading column on purpose: the main thing on this page is a
    // dense letter-size timesheet, and squeezing it into 768px put its 7pt table
    // text at roughly 7 pixels tall.
    // max-w-6xl since 2026-08-12, to buy the day-by-day calendar the width its
    // overlapping blocks need without stacking the answer options beside them.
    // See the note on the calendar column in DayByDay.
    // no-focus-zoom: every field here is text-sm, and a field under 16px makes
    // iOS Safari magnify the page and stay there. See the rule in globals.css.
    <section className="no-focus-zoom mx-auto max-w-6xl px-6 py-10 sm:py-14">
      {/* THE PAGE FOLLOWS THE SHEET. A change a reviewer makes on All employees
          reaches this page within a few seconds, without either of them saying
          reload - which is the difference between fixing something while an
          employee is on the phone and talking them through a refresh. Renders
          nothing; see LiveRefresh. */}
      <LiveRefresh token={token} />
      {/* SAYING WHOSE PAGE THIS IS. Without it a preview is indistinguishable
          from your own sheet - same layout, same questions, somebody else's
          hours - and the first thing anybody does on a page like this is click
          something. Named, not just flagged: "you are previewing" is a state,
          "previewing Uribe, Brandon" is a fact you can check against the row you
          came from. */}
      {reviewing && (
        <ModeBar
          token={token}
          live={live}
          name={ts.sourceName}
          period={`${ts.batch.periodFrom} to ${ts.batch.periodTo}`}
        />
      )}
      {live && (
        <div
          role="status"
          className="mb-6 rounded-xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-950/30"
        >
          <p className="text-sm font-bold text-rose-900 dark:text-rose-200">
            Live &mdash; this is {ts.sourceName}&apos;s real page. Everything you do here is saved.
          </p>
          {/* WHOSE ANSWER IT BECOMES IS NOT COSMETIC, so the banner says it.
              These are recorded as theirs: the words are theirs, and their
              signature is still what makes any of it count. See `answerAsThem`
              above and the note on `answeredById`. */}
          <p className="mt-1 text-sm text-rose-800 dark:text-rose-300">
            Anything you answer here is recorded as their own answer, and they see it on
            their phone within about five seconds. It still waits on their signature.
          </p>
        </div>
      )}
      {preview && (
        <div
          role="status"
          className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30"
        >
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Preview &mdash; this is {ts.sourceName}&apos;s page, exactly as they see it.
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            {rehearsal
              ? "This is a TEST BATCH, so everything here works for real - answers save, the sheet rebuilds, the signature is stored. The only thing that differs is that any email it sends goes to one address."
              : "Nothing you do here is saved. Answering a question or signing will be refused, so their record cannot be changed from this tab. Press Live to answer with them on the phone."}
          </p>
          {/* the one exception, and it goes the other way: this does not add an
              answer, it takes every answer off. Mánu 2026-08-12: "I meant to
              reset page. When you open up someone's time sheet corrections." */}
          <PreviewReset
            timesheetId={ts.id}
            name={ts.sourceName}
            /* NOT `answered`, WHICH IS A DIFFERENT QUESTION. That set is the
               `q_` rows the page restores cards for; a reset also takes the
               `fix_` acknowledgements off a backwards rest entry, and they are
               their answer like any other. Brandon's July sheet had one, so the
               button read 6 beside a confirm that correctly said 7. */
            answers={
              ts.corrections.filter((c) => {
                const k = String(c.kind || "");
                return k.startsWith("q_") || k.startsWith("fix_");
              }).length
            }
            /* what a reset would take off a break answer as well, counted
               through the same rule the action applies - see `resetAction`. The
               button said "reset their N answers" with N counting corrections
               only, so it promised less than it now does. */
            reasons={breakAnswers.filter((r) => resetAction(r, ts.userId)).length}
            signed={!!ts.signedAt}
          />
        </div>
      )}
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
        My Life Services
      </p>
      {/* THE TIMESHEET REVIEW PAGE. One name, used here, in the tab title, in
          the link admins follow to it, and in every comment that refers to it -
          it had five ("their own page", "the employee page", "the corrections
          page", "the signing page", "the sign-off page") and no way to say which
          screen anybody meant. */}
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Review your timesheet
      </h1>
      <p className="mt-2 text-sm text-muted">
        {who} · {period}
      </p>

      {/* ONE COLUMN. Two columns put Overtime beside Hours worked, where it read
          as a second half of the same figure rather than its own line. */}
      <div className="mt-5 grid gap-2 rounded-xl border border-border bg-surface p-4">
        <Figure label="Hours worked" value={ts.paidHours} strong />
        {ts.otHours > 0 && <Figure label="Overtime" value={ts.otHours} />}
        {ts.doubleHours > 0 && <Figure label="Double time" value={ts.doubleHours} />}
        {/* HOURS ONLY. "Break penalty pay included" and "Comes off only if you
            tell us you took them" both came out 2026-08-12 - Mánu: "make the top
            only show the hours worked". Overtime and double time stay: they are
            hours worked, not penalty pay, and they are what the sheet below
            prints. `standing` is still computed - the policy line and the
            questions read it. */}
      </div>
      {standing.assumptions > 0 && (
        /* THE POLICY, NAMED AND LINKED, AND NOTHING ELSE. Mánu 2026-08-12 cut
           this back to one sentence: the paragraph used to open "Those N hours
           ARE on this timesheet and you will be paid them unless you tell us
           otherwise" and go on to explain what saying so would cost. Every
           figure and every consequence is gone; what remains is why we are
           entitled to ask at all. Still shown only when there is an assumption
           on the sheet, which is what makes the policy relevant to the page. */
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Under the{" "}
          {policy ? (
            <a
              href={policy.path}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand underline underline-offset-2 hover:text-brand-dark"
            >
              Rest &amp; Meal Period Policy and Acknowledgement
            </a>
          ) : (
            <b>Rest &amp; Meal Period Policy and Acknowledgement</b>
          )}{" "}
          you signed, recording your rest periods and meal breaks is to be documented in your
          schedule.
        </p>
      )}

      {ts.message && (
        <div className="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm leading-relaxed text-foreground">
          {ts.message}
        </div>
      )}

      {ts.dueAt && !ts.signedAt && (
        <p className="mt-4 text-sm font-semibold text-amber-700 dark:text-amber-400">
          Please sign by{" "}
          {new Date(ts.dueAt).toLocaleDateString("en-US", {
            month: "long", day: "numeric", year: "numeric",
          })}
          .
        </p>
      )}

      {ts.signedAt ? (
        <div className="mt-6 rounded-xl border border-emerald-300/60 bg-emerald-50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            Signed - thank you.
          </p>
          <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-200/80">
            You signed this on{" "}
            {new Date(ts.signedAt).toLocaleDateString("en-US", {
              month: "long", day: "numeric", year: "numeric",
            })}
            . Payroll has your copy - nothing else to do.
          </p>
        </div>
      ) : openCorrections.length > 0 ? (
        // they've told us something is wrong, so there's nothing to sign until
        // it's sorted. show what we have on record so they can see it landed.
        <div className="mt-6 rounded-xl border border-amber-300/60 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/30">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Payroll is looking at this one.
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200/80">
            You reported{" "}
            {openCorrections.length === 1
              ? "a problem"
              : `${openCorrections.length} problems`}{" "}
            on{" "}
            {new Date(openCorrections[0].createdAt).toLocaleDateString("en-US", {
              month: "long", day: "numeric", year: "numeric",
            })}
            . Don&apos;t sign this version - once it&apos;s sorted you&apos;ll get
            a corrected timesheet to sign.
          </p>
          <ul className="mt-3 space-y-1">
            {openCorrections.map((c) => (
              <li key={c.id} className="text-sm text-amber-800 dark:text-amber-200/80">
                <span className="font-semibold">{c.date || "This timesheet"}</span>
                {" - "}
                {correctionLabel(c.kind)}
                {c.note && <span className="block text-xs opacity-80">{c.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          {/* asked BEFORE the signer, but only the mandatory ones hold it back.
              An unanswered break question leaves the premium ON, so making
              somebody work through twelve cards whose only outcome is less pay
              would be gating a signature on them giving money up. What still
              blocks is a punch we CHANGED or a row we could not READ - see
              `signingGate`. */}
          {/* TWO ARRANGEMENTS OF THE SAME QUESTIONS. "Day by day" walks the
              period with each day drawn on a time axis; "All questions" is the
              one card per kind that has always been here. Both hand the same
              props to the same component, so an answer given in either is the
              same row in the database. */}
          <TimesheetViews
            simple={
              <DayByDay
                days={ts.data.days}
                groups={byKind}
                scheduled={scheduledByDate}
                restsOnRecord={restsByDate}
                token={token}
                answers={answers}
                partials={partials}
                answerTimes={answerTimes}
                choices={choices}
                waiting={deps.waiting}
                disturbs={deps.disturbs}
                standing={standing}
                submitAction={act(live ? answerAsThem : answerTimesheetQuestion)}
                /* ONE PER VIOLATION, ON ITS OWN DAY. These rendered as a single
                   lump below everything, attached to nothing - a reason about
                   the 4th sat under a reason about the 11th with no picture and
                   no day between them. On All employees the admin control sits
                   on the day it is about, so the two screens now read the same
                   way round. `detailed` keeps the list, because that view has no
                   days to hang them on. */
                breakAsks={breakAsks}
                breakAction={act(answerBreakReason)}
                reasonsOnRecord={reasonsOnRecord}
                /* what they said, per question, so a settled row in the panel at
                   the top can say it back in their own words */
                saidById={saidById}
                /* backwards entries somebody has taken on - see `acknowledgeSpan` */
                ackOn={ackOn}
                ackAction={act(acknowledgeSpan)}
              />
            }
            detailed={[
              // THE SAME REASONS, AS A LIST. "All questions" has no days to hang
              // them on, so here they keep the shape they used to have on the
              // whole page - with the count restored, which is the one thing the
              // day-by-day version does not need to say.
              ...(breakAsks.length > 0
                ? [(
                  <div key="break-asks" className="mb-6">
                    <p className="text-sm text-muted">
                      {breakAsks.length === 1
                        ? "One thing to check before we can put your timesheet together."
                        : `${breakAsks.length} things to check before we can put your timesheet together.`}
                    </p>
                    {breakAsks.map((ask) => (
                      <BreakReason
                        key={ask.findingKey}
                        token={token}
                        ask={ask}
                        submitAction={act(answerBreakReason)}
                      />
                    ))}
                  </div>
                )]
                : []),
              ...byKind.map((group) => (
              <TimesheetQuestion
                /* THE CARD'S OWN KEY, NOT ITS KIND. A kind is one card only
                   while it emits one question: `repair` is one card per
                   out-time, so a sheet with two mis-entered rows handed React
                   two children keyed "repair" and it warned that one may be
                   duplicated or omitted. `cardKey` is what decided the grouping
                   in the first place, so it is what identifies the group. */
                key={cardKey(group[0])}
                token={token}
                questions={group}
                answers={answers}
                partials={partials}
                answerTimes={answerTimes}
                choices={choices}
                waiting={deps.waiting}
                disturbs={deps.disturbs}
                standing={standing}
                submitAction={act(live ? answerAsThem : answerTimesheetQuestion)}
                reasonsOnRecord={reasonsOnRecord}
              />
              )),
            ]}
          />


          {/* WHAT THEY TOLD US, back on the page. A confirmation that leaves no
              trace is indistinguishable from one nobody gave, and two of these
              questions rebuilt the sheet they are about to sign.

              IT NO LONGER PRINTS `resolutionNote`. That field is payroll's audit
              note - it says what the answer did to the premium and cites the
              case the hour comes from - and this panel was putting it in front
              of the employee, which is the one thing nothing they read may do.
              `employeeResolution` builds the same row's sentence for them: their
              own answer, their own times, and nothing about what it is worth.
              The stored note is untouched and every admin screen still shows it.

              AND THEIR REASON UNDER IT, where the answer was that a break was
              missed. That is the half no export carries, they typed it, and it
              is about to be printed on the sheet below - so it reads back here
              rather than only appearing on the document after they sign. */}
          {Object.keys(answers).length > 0 && (
            <div className="mt-5 rounded-xl border border-border bg-surface-2 p-5">
              <p className="text-sm font-semibold text-foreground">
                What you have told us about this timesheet
              </p>
              <ul className="mt-2.5 space-y-2">
                {answered.map((c) => {
                  const said = employeeResolution(c, questionFor(c));
                  const words = resolutionTakesReason(c) ? reasonFor(c) : null;
                  return (
                    <li key={`${c.kind}-${c.date}`} className="text-sm text-muted">
                      <span className="font-semibold text-foreground">{c.date}</span>
                      {" - "}
                      <span className={c.status === "declined" ? "text-emerald-700 dark:text-emerald-400" : ""}>
                        {c.status === "accepted" ? "confirmed" : "corrected"}
                      </span>
                      {said && <span className="block text-xs opacity-80">{said}</span>}
                      {words && (
                        <span className="mt-1 block border-l-2 border-border-strong pl-2 text-xs italic opacity-80">
                          &ldquo;{words}&rdquo;
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* THE SHEET IS ALWAYS ON THE PAGE NOW, and it updates as answers go
              in. Mánu 2026-08-11: "let's make the current time sheet appear at
              the bottom like it did for Amanda and update itself as answers are
              inputted, so I can see it live."

              It used to appear only once somebody could sign, so the four people
              with a blocking question could not see the document the questions
              were about - which is the wrong way round, since they are the ones
              being asked to check something on it.

              `answerCount` is the remount key. The PDF route is no-store and
              answering revalidates this page, but FormFiller fetches the file
              once on mount, so without a key change the viewer would keep
              showing the sheet from before the answer. */}
          {/* The "there are N questions above that need answering before you can
              sign" panel stood here. It went with the gate on 2026-08-12 - the
              sheet is signable at any time, so there is nothing to warn about.
              See `signingGate`. */}
          {/* WHAT WE STILL NEED FROM THEM. One card per day, and the sheet does
              not generate until every one is answered - see `breakAsks`. */}


          <TimesheetSigner
            key={`sheet-${answered.length}-${breakAsks.length}`}
            token={token}
            fileUrl={`/t/${token}/pdf?v=${answered.length}`}
            title={`timesheet-${period.replace(/[^\w]+/g, "-")}`}
            submitAction={act(submitSignedTimesheet)}
            /* THE POPUP IS REASSURANCE, NOT A WARNING. Ignoring these is the
               safe choice for the employee now, so the panel says the pay is
               already on the sheet rather than nagging them to finish. The
               count is this person's own. */
            unansweredOptional={gate.optionalOpen}
            premiumOnSheet={standing.charged}
            canSign={progress.settled && gate.canSign && breakAsks.length === 0}
            // a COUNT, not a list - see TimesheetSigner. `signingGate` returns 0
            // by design since the sheet became signable at any time, so this is
            // the only thing that can put a number in it.
            /* what is actually holding it, so the sentence can count them. Not
               `gate.blocking`, which is 0 by design since the gate stopped
               deciding - the open questions are the hold now. */
            blocking={(progress.asked - progress.answered) + breakAsks.length}
          />
          {/* WHERE THE SIGNATURE WOULD GO, because that is the one thing this
              tab cannot supply. Mánu 2026-08-12: "The email them their link
              should go to the bottom where it says sign and submit because you
              can't sign and submit for them."

              It sits under the signer rather than replacing it: on a call you
              want to be able to say "you will see a box asking for your name,
              then a Submit button" while looking at the same thing they will.
              What the page cannot do is press it for them - so the way out is
              here, at the point where the conversation runs out of things an
              admin is allowed to do. */}
          {/* IN BOTH MODES. This block used to be preview-only, which left the
              live half with no way out at the point where it is needed most:
              you have just answered the last question with them on the phone,
              the sheet will now generate, and the one thing you cannot do is
              press sign. Sending them the link is that way out, and it is not
              a preview-shaped act. */}
          {reviewing && (
            <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                You cannot sign this for them.
              </p>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                A signature has to come from {ts.sourceName}. Send them the link
                and they can sign it themselves once you have been through it.
              </p>
              <PreviewSend
                action={sendTimesheets.bind(null, ts.batch.id)}
                timesheetId={ts.id}
                name={ts.sourceName}
                email={ts.user?.email || null}
                mode={sendModeSummary()}
                alreadySent={!!ts.sentAt}
              />
            </div>
          )}

          <ReportProblem
            token={token}
            days={ts.data?.days || []}
            submitAction={act(submitTimesheetCorrections)}
          />
        </>
      )}
    </section>
  );
}

function Figure({ label, value, strong, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-muted">{label}</span>
      <span
        className={`text-sm font-semibold ${
          tone === "prem"
            ? "text-rose-600 dark:text-rose-400"
            // noted, not charged - the same grey the sheet itself uses for a
            // premium it assumed away rather than billed
            : tone === "muted"
              ? "text-muted"
              : "text-foreground"
        } ${strong ? "text-base" : ""}`}
      >
        {(Math.round((value || 0) * 100) / 100).toFixed(2)} hrs
      </span>
    </div>
  );
}
