import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { isCappedService } from "@/lib/timesheet/compliance";
import { preferredName } from "@/lib/contacts";
import { scheduleKey, serviceOf, clientOf, blockTimes } from "@/lib/timesheet/schedule";
import { clockShifts } from "@/lib/timesheet/clock";
import { auditRow, shiftKeyOf, sameClient, displayClient, clientKey } from "@/lib/timesheet/note-audit";
// the full-name key the client-anchored tables share (Client, ClientReport,
// ClientAuthorization) - not the same reduction as note-audit's clientKey,
// which matches on surname + initial
import { clientKey as authClientKey } from "@/lib/client-attestations/names";
import { monthLabelOf } from "@/lib/timesheet/budget-capture";
import { buildWhoKey } from "@/lib/timesheet/people";
import { parseComments } from "@/lib/timesheet/comments";
import { parseScheduleNotesXls } from "@/lib/timesheet/schedule-notes";
import BackLink from "@/components/BackLink";
import AuditCards from "./AuditCards";

export const metadata = { title: "Audit", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// THE THREE RECORDS OF ONE SHIFT, LINED UP.
//
// The roster says what was billed, the clock export says what was worked, and
// the service note says what was documented. They come from three separate
// uploads and are joined here on the person and the day.
//
// Nothing on this page changes an hour, a premium or a signed timesheet. It
// reports what three documents say and ranks the disagreements for a person to
// read - see the note at the top of note-audit.js for why none of these rules
// concludes anything on its own.
export default async function AuditBatchPage({ params }) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");

  const { id } = await params;
  // THE AUDIT IS A PAY PERIOD NOW, 2026-08-27. Mánu: "i want to be able to
  // upload all of this info just to the timesheets page. and the audit card and
  // more to come can just get it from that info ... i also want to do it by
  // timesheet pay period."
  //
  // It used to be its own upload over its own date range, which meant one notes
  // file spanning two fortnights and a page that had to work out which pay
  // periods it touched. Every document now arrives together on the batch, so
  // the period is simply the batch.
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    select: {
      id: true, periodFrom: true, periodTo: true,
      clockUrl: true, clockName: true, clockFindings: true,
      notesName: true, serviceNotesName: true,
      scheduleNotesUrl: true, scheduleNotesName: true,
      serviceNotes: { select: { notes: true, noteCount: true, pdfCount: true, serviceCount: true } },
    },
  });
  if (!batch) notFound();

  const notes = batch.serviceNotes?.notes || [];

  const dateKey = (d) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(d || "");
    return m ? Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]) : 0;
  };

  // PINNED TO THE BATCH BEING READ, not to the newest upload of its period.
  //
  // A period gets re-uploaded constantly and each upload carries its own
  // exports. Reading this batch's notes against a different batch's roster
  // would put two documents on one card that never arrived together.
  const current = new Map([[`${batch.periodFrom}|${batch.periodTo}`, batch]]);

  // the days this page covers, which is now simply the pay period. It used to
  // be the range the notes themselves spanned, because the notes were uploaded
  // over a range somebody picked.
  const notesFrom = dateKey(batch.periodFrom);
  const notesTo = dateKey(batch.periodTo);

  // ONLY THE ROSTER OUT OF EACH SHEET, projected in Postgres rather than here.
  //
  // `data` holds the whole analyzed breakdown - punches, breaks, questions,
  // answers - and all this page wants from it is `scheduleCheck.byDate`.
  // Selecting the column and reaching into it in JavaScript pulls every sheet's
  // full record across the wire, which took this page over four minutes for two
  // fortnights. The arrow operators do the same reach inside the database and
  // return a fraction of the bytes.
  const ids = [...current.values()].map((p) => p.id);
  // THE SCHEDULE NOTE, which is the reason staff typed on the shift itself.
  //
  // Mánu 2026-08-27: "we need the schdule notes and the service notes included."
  // Nothing new had to be uploaded - the Simple Timesheet has carried them in
  // its "Comments Details" block since the first upload, 216 of them across
  // 08/16-08/31 against the clock export's 66, and every one names its own day
  // and block: "08/16/26 2:45p-5:34p: Client ended early due to being tired".
  //
  // They matter here because they are usually the ANSWER to the finding. Adams
  // 08/16 bills 2:45p-6p and clocked out at 5:34p, and the explanation was
  // sitting in the upload the whole time.
  const sheets = ids.length
    ? await prisma.$queryRawUnsafe(
      `SELECT t."sourceName",
              t.data->'scheduleCheck'->'byDate' AS bydate,
              t.data->'comments' AS comments,
              u."name" AS legal_name,
              u."preferredFirstName" AS preferred_first,
              u."preferredLastName" AS preferred_last
         FROM "Timesheet" t
         LEFT JOIN "User" u ON u.id = t."userId"
        WHERE t."batchId" = ANY($1)`,
      ids,
    )
    : [];

  // ONE PERSON, WHATEVER THE DOCUMENT CALLS THEM. See people.js - the timesheet
  // prints the legal name, the clock export and the notes the one they go by,
  // and one spelling in the portal is simply wrong.
  const staff = await prisma.user.findMany({
    select: { name: true, preferredFirstName: true, preferredLastName: true },
  });
  const whoKey = buildWhoKey(staff);

  // ---- what was BILLED: every rostered block, off the sheets themselves ----
  const shifts = new Map();          // person|date|startMin -> shift
  const namesSeen = new Map();
  for (const t of sheets) {
    const key = whoKey(t.sourceName);
    if (t.legal_name || t.preferred_first || t.preferred_last) {
      namesSeen.set(key, preferredName({
        name: t.legal_name,
        preferredFirstName: t.preferred_first,
        preferredLastName: t.preferred_last,
      }));
    }
    const byDate = t.bydate || {};
    for (const [date, entry] of Object.entries(byDate)) {
      // a day outside the notes' own range has no note to check it against and
      // only makes the page longer
      if (dateKey(date) < notesFrom || dateKey(date) > notesTo) continue;
      for (const block of entry.shifts || []) {
        if (block.meal) continue;
        // ONLY SERVICE HOURS. Mánu 2026-08-26: "this is only needed for service
        // hours like ILS Service and Self Determination". Travel, admin, misc
        // and training are billed and worked, and no service note is written
        // against them - putting them on this screen asked travel time to
        // explain itself on two thirds of the rows.
        if (!isCappedService(serviceOf(block.text))) continue;
        const times = blockTimes(block.text);
        if (!times) continue;
        shifts.set(`${key}|${date}|${times.start}`, {
          who: key,
          name: t.sourceName,
          date,
          schedFrom: times.start,
          schedTo: times.end,
          scheduledMin: times.end - times.start,
          service: serviceOf(block.text) || null,
          client: clientOf(block.text) || null,
          workedMin: null, actualFrom: null, actualTo: null,
          noIn: false, noOut: false, gpsIn: null, gpsOut: null,
          clocked: false,
        });
      }
    }
  }

  // THE SCHEDULE NOTES, indexed per person and day.
  //
  // Their times are the CLOCK times, not the booking's: Adams 08/16 reads
  // "2:45p-5:34p" against a shift rostered 2:45p-6p. So a note is matched to
  // the booking whose window it overlaps most, the same way a clock row is.
  //
  // TWO SOURCES OF THE SAME NOTES, and the .xls is preferred where it exists.
  // The timesheet's printed "Comments Details" block gives a day and a time and
  // no client; the Employee Schedule Notes export gives the client on 256 of
  // 290. 31% of person-days carry more than one note and a day holds 3.6 shifts
  // on average, so without the client a reason lands on the right shift about
  // as often as the wrong one.
  //
  // Read back off Blob rather than stored: 4ms for a fortnight, against the
  // 1.5 seconds that makes the service notes worth keeping parsed.
  const schedNotes = new Map();
  const pushNote = (key, note) => {
    const k = `${key}|${note.date}`;
    if (!schedNotes.has(k)) schedNotes.set(k, []);
    schedNotes.get(k).push(note);
  };
  let scheduleNotesLoaded = false;
  if (batch.scheduleNotesUrl) {
    try {
      const res = await fetch(batch.scheduleNotesUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`the file came back ${res.status}`);
      for (const n of parseScheduleNotesXls(Buffer.from(await res.arrayBuffer()))) {
        if (dateKey(n.date) < notesFrom || dateKey(n.date) > notesTo) continue;
        pushNote(whoKey(n.employee), n);
      }
      scheduleNotesLoaded = true;
    } catch (e) {
      // the block on the timesheet below carries the same notes, so a report
      // that will not come back off Blob costs the client and nothing else
      console.error("schedule notes export could not be read:", e);
    }
  }
  if (!scheduleNotesLoaded) {
    for (const t of sheets) {
      const key = whoKey(t.sourceName);
      for (const c of parseComments(t.comments)) {
        const at = blockTimes(`${c.from}-${c.to}`);
        pushNote(key, { ...c, client: null, start: at?.start ?? null, end: at?.end ?? null });
      }
    }
  }

  // ---- what was CLOCKED: read back off each period's stored export ----
  //
  // MATCHED BY CLIENT AND OVERLAP, not by an exact scheduled start minute.
  //
  // The two documents disagree about the start on purpose. The roster carries
  // the TRIMMED booking and the clock export carries the ORIGINAL, so a person
  // who clocks in late has a roster block starting later than the clock row that
  // belongs to it. Macareno 08/19: rostered "10:40a-1p Hernandez, J-ILS
  // Service(2:20)", clock schedule 10:30a-1p, clocked in at 10:40a. Correctly
  // trimmed, and exactly the honest shape.
  //
  // Keyed on the exact start minute those two never met, so the clock row was
  // added as a SECOND shift billed off its own stale schedule - 2.50 hours
  // against a 2.33 hour clock - and the screen reported an overbill that had not
  // happened. Mánu flagged it before this was found.
  //
  // So a clock row goes to the rostered block for the same client whose time it
  // overlaps most, and only becomes a shift of its own when there is no such
  // block at all.
  let clockLoaded = 0;
  // rows that matched no booking by overlap, held for the second pass below
  const leftoverRows = [];
  // what attaching a clock row to a booking means, in one place: the punches,
  // QSP's original booking, and the full client spelling. Never the schedule
  // columns as billed hours - the clock export says what was clocked, not what
  // was billed.
  const attachRow = (x, row) => Object.assign(x, {
    // THE FULL CLIENT NAME. The roster abbreviates to "Sherwold, A" and the
    // clock export spells it out as "Sherwold, Abigail", in the same Last,
    // First shape the rest of the portal uses. Kept apart from `client`, which
    // stays the roster's own spelling so the matching that got us here is not
    // rewritten under it.
    clientFull: row.client || null,
    // QSP's "Original End Time" - the booking before anyone touched it
    originalFrom: row.schedFrom, originalTo: row.schedTo,
    actualFrom: row.actualFrom, actualTo: row.actualTo,
    workedMin: row.workedMin,
    startDelta: row.startDelta, endDelta: row.endDelta,
    noIn: row.noIn, noOut: row.noOut,
    gpsIn: row.gpsIn, gpsOut: row.gpsOut,
    selfCreated: row.selfCreated, reason: row.reason, says: row.says,
    clocked: true,
  });
  // WHICH PERIODS HAVE A CLOCK EXPORT AT ALL. "Nobody clocked this shift" and
  // "no clock export was uploaded for this fortnight" look identical on a card
  // and mean opposite things - the first is about a person, the second is about
  // a missing file. 08/01-08/15 has no export, so without this every shift in it
  // reads as an accusation.
  const periodsWithClock = new Set();

  const byPersonDayShift = new Map();
  for (const shift of shifts.values()) {
    const k = `${shift.who}|${shift.date}`;
    if (!byPersonDayShift.has(k)) byPersonDayShift.set(k, []);
    byPersonDayShift.get(k).push(shift);
  }
  const overlapOf = (a1, a2, b1, b2) =>
    a1 == null || a2 == null || b1 == null || b2 == null
      ? 0
      : Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

  for (const period of current.values()) {
    const files = period.clockFindings?.files?.length
      ? period.clockFindings.files
      : period.clockUrl
        ? [{ url: period.clockUrl, name: period.clockName }]
        : [];
    for (const f of files) {
      if (!f.url) continue;
      try {
        const res = await fetch(f.url, { cache: "no-store" });
        if (!res.ok) throw new Error(`the file came back ${res.status}`);
        periodsWithClock.add(`${period.periodFrom} to ${period.periodTo}`);
        for (const row of clockShifts(Buffer.from(await res.arrayBuffer()))) {
          if (!isCappedService(row.service)) continue;
          if (dateKey(row.date) < notesFrom || dateKey(row.date) > notesTo) continue;
          clockLoaded++;
          const who = whoKey(row.name);
          const sameDay = (byPersonDayShift.get(`${who}|${row.date}`) || [])
            .filter((x) => !x.clocked && sameClient(x.client, row.client));
          const best = sameDay
            .map((x) => ({
              x,
              // the clock row's own window against the booking's
              overlap: Math.max(
                overlapOf(x.schedFrom, x.schedTo, row.schedFrom, row.schedTo),
                overlapOf(x.schedFrom, x.schedTo, row.actualFrom, row.actualTo),
              ),
            }))
            .sort((a, b) => b.overlap - a.overlap)[0];

          if (best && best.overlap > 0) {
            // THE CLOCK EXPORT SAYS WHAT WAS CLOCKED. IT DOES NOT SAY WHAT WAS
            // BILLED, and its own schedule columns must never be allowed to.
            attachRow(best.x, row);
          } else {
            // decided AFTER every overlapping row has claimed its booking -
            // attaching now would let this row take a block that a later,
            // overlapping row is the real match for
            leftoverRows.push({ row, who });
          }
        }
      } catch (e) {
        console.error(`audit: clock export unreadable (${f.name}):`, e);
      }
    }
  }

  // A RESCHEDULED BOOKING KEEPS ITS PUNCHES.
  //
  // Urena 08/20: Elder. Morton was booked 7:45a-8a, she clocked exactly that -
  // GPS at both ends - and the booking was then moved to 10:30a-12:30p. Booking
  // and punches no longer overlap at all, so the row failed to attach. The
  // punches became a phantom shift "billing" the 0.25h the timesheet never
  // billed, the real 2h block read as never clocked, and billed-over-clocked -
  // two hours billed against fifteen clocked minutes, the comparison this
  // screen exists to make - fired on neither card.
  //
  // So a leftover row still goes to its own client's still-unclocked booking,
  // overlap or none, nearest start first. Only a row with NO booking for that
  // client that day becomes a shift of its own, and that is what rosterMissing
  // has meant all along.
  for (const { row, who } of leftoverRows) {
    const cands = ((byPersonDayShift.get(`${who}|${row.date}`) || []))
      .filter((x) => !x.clocked && sameClient(x.client, row.client))
      .sort((a, b) =>
        Math.abs((a.schedFrom ?? 0) - (row.schedFrom ?? 0))
        - Math.abs((b.schedFrom ?? 0) - (row.schedFrom ?? 0)));
    if (cands.length) {
      attachRow(cands[0], row);
      continue;
    }
    const key = `${who}|${row.date}|${row.schedFrom}|clock`;
    shifts.set(key, {
      ...row, who, clocked: true, rosterMissing: true,
      originalFrom: row.schedFrom, originalTo: row.schedTo,
    });
  }

  // ---- what was DOCUMENTED: the notes, one per shift ----
  //
  // MATCHED ON THE CLIENT FIRST, and this is not a refinement - it is the
  // difference between a true reading and a false accusation.
  //
  // Paired on the person, the day and the nearest start time alone, a note with
  // no shift of its own lands on whatever else that person worked. Ashley Cain
  // filed two notes on 08/17, both for Anthony Grant, both 6-7pm, describing the
  // same Del Taco visit twice. The first found Grant's 6-7pm booking. The second
  // was dropped onto Saneeha Amin's unrelated 10a-2p shift, which then read as
  // four hours billed against one hour documented - a finding about a shift
  // where nothing had happened at all.
  //
  // A note names its client, so it is only ever offered to that client's
  // bookings. Anything left over is an orphan and reported as one, which is
  // where a duplicate belongs.
  const byPersonDay = new Map();
  for (const n of notes) {
    const k = `${whoKey(n.employee)}|${n.date}`;
    if (!byPersonDay.has(k)) byPersonDay.set(k, []);
    byPersonDay.get(k).push(n);
  }

  // WHICH PAY PERIOD EACH SHIFT BELONGS TO.
  //
  // Mánu 2026-08-26: "can we seperate these by the timesheets dates, or should i
  // reupload the notes for each set of dates."
  //
  // Split here rather than re-uploaded. The notes export runs over a range the
  // operator picks - this one covers 8/1 to 8/26, which is three pay periods -
  // and every note carries its own date, so the split costs nothing. Uploading
  // the same notes once per period would put the same note in the database
  // several times and make a job out of something the data already answers.
  //
  // It matters because approving is a BILLING judgement and billing runs per
  // pay period: a reviewer works one fortnight at a time.
  const periodOf = (date) => {
    const d = dateKey(date);
    for (const p of current.values()) {
      if (d >= dateKey(p.periodFrom) && d <= dateKey(p.periodTo)) return `${p.periodFrom} to ${p.periodTo}`;
    }
    return "Outside every uploaded pay period";
  };

  // A NAMED CLIENT CLAIMS ITS NOTE FIRST.
  //
  // Some bookings carry no client at all - "10a-1p -Self Determination
  // Program(3:00)" - and a shift with no client used to be offered every note
  // that person wrote that day, taking the nearest by start time. On Mánu's
  // 08/03 the clientless 10a block took the Gerson Mejia note and the 1:30p
  // Mejia booking was then reported as having none, with the note sitting in the
  // file naming both him and the client.
  //
  // So it runs twice: every booking that names a client matches on that client,
  // and only then may a clientless booking take what is left. Self Determination
  // still finds its note, and never somebody else's.
  const taken = new Set();
  const rows = [];
  const noteFor = new Map();

  const claim = (shift, byClient) => {
    const sameDay = (byPersonDay.get(`${shift.who}|${shift.date}`) || [])
      .filter((n) => !taken.has(n));
    const candidates = byClient
      ? sameDay.filter((n) => sameClient(n.client, shift.client))
      : sameDay;
    if (!candidates.length) return null;
    const anchor = shift.actualFrom ?? shift.schedFrom ?? 0;
    const note = candidates
      .map((n) => ({ n, d: Math.abs((n.startMin ?? 0) - anchor) }))
      .sort((a, b) => a.d - b.d)[0].n;
    taken.add(note);
    return note;
  };

  // EVERY SPELLING OF EVERY CLIENT THE PERIOD HOLDS, keyed the way `sameClient`
  // matches. Built from the documents that write names out in full - the clock
  // export and the service notes - so a shift neither of them reached can still
  // print the client's name rather than the roster's abbreviation.
  const fullClient = new Map();
  const rememberClient = (name) => {
    const key = clientKey(name);
    if (!key || !name || fullClient.has(key)) return;
    // an abbreviation is not a full name: "Evans, R" must never be remembered
    // as the answer for "evans|r", or it would beat the real one
    if (/^[^,]+,\s*[A-Za-z]\.?$/.test(String(name).trim())) return;
    fullClient.set(key, name);
  };
  for (const shift of shifts.values()) rememberClient(shift.clientFull);
  for (const n of notes) rememberClient(n.client);

  const everyShift = [...shifts.values()];

  // ONE SCHEDULE NOTE PER BOOKING - the client first, then the overlap.
  //
  // A note that names a client belongs to that client's booking and to no
  // other, however well the times line up. Where the note names nobody - 34 of
  // 290, and every note from the timesheet's printed block - the overlap is all
  // there is to go on, which is how this worked before the export that names
  // clients existed.
  const takenNote = new Set();
  const fitsClient = (c, shift) => (c.client ? sameClient(c.client, shift.client) : true);
  for (const shift of everyShift) {
    const mine = (schedNotes.get(`${shift.who}|${shift.date}`) || [])
      .filter((c) => !takenNote.has(c) && fitsClient(c, shift));
    if (!mine.length) continue;
    const from = shift.actualFrom ?? shift.schedFrom;
    const to = shift.actualTo ?? shift.schedTo;
    const best = mine
      .map((c) => ({
        c,
        named: c.client && shift.client ? 1 : 0,
        overlap: c.start == null || from == null ? 0
          : Math.max(0, Math.min(c.end ?? 0, to ?? 0) - Math.max(c.start, from)),
      }))
      // a named client outranks a better overlap: the times here are the
      // clock's and a booking either side of this one can overlap further
      .sort((a, b) => b.named - a.named || b.overlap - a.overlap)[0];
    if (best && (best.named || best.overlap > 0)) {
      takenNote.add(best.c);
      shift.scheduleNote = best.c;
    }
  }
  for (const shift of everyShift) {
    if (shift.client) noteFor.set(shift, claim(shift, true));
  }
  for (const shift of everyShift) {
    if (!shift.client) noteFor.set(shift, claim(shift, false));
  }
  // A NOTE THAT NAMES NOBODY, AGAINST A BOOKING THAT DOES.
  //
  // Aaron Jones 08/17, 8a-10a. The timesheet bills it as `Caviar, J - ILS
  // Service`. QSP now shows the same block as ILS Admin with no client on it -
  // Mánu opened it on his phone - and the note he wrote for it is filed the
  // same way, with no client. So the note and the booking describe one shift
  // and disagree about what it was, which is the disagreement this screen
  // exists to show. Reported as "no service note" it said the opposite.
  //
  // Offered LAST, so every note that names a client has already gone to that
  // client's booking and every client-less booking has had its pick.
  //
  // THE TIMES HAVE TO BE THE SAME MINUTE. A note naming nobody carries nothing
  // else to tie it to one booking rather than the one after it, and a person
  // can be booked with four clients in a day. An exact start is the whole of
  // the evidence, so it is the whole of the test.
  for (const shift of everyShift) {
    if (noteFor.get(shift)) continue;
    const anchor = shift.schedFrom;
    if (anchor == null) continue;
    const note = (byPersonDay.get(`${shift.who}|${shift.date}`) || [])
      .find((n) => !taken.has(n) && !n.client && n.startMin === anchor);
    if (!note) continue;
    taken.add(note);
    noteFor.set(shift, note);
  }

  for (const shift of everyShift) {
    const note = noteFor.get(shift) || null;
    // the rule needs the difference between "no export was uploaded" and "the
    // export has no row for this shift" - only the second is a finding
    shift.noClockRow =
      periodsWithClock.has(periodOf(shift.date)) && shift.clocked !== true;
    const read = auditRow(shift, note);
    // FULL WHERE ANYTHING HAS IT. The clock export is preferred over the note
    // because it is already "Last, First" like every other name on these
    // screens; the roster's abbreviation is the last resort, for a shift no
    // clock row and no note ever reached.
    //
    // AND THE PERIOD IS ASKED BEFORE THAT LAST RESORT. A client's full name is
    // one fact about the client, not about the shift: where any document names
    // them anywhere in the fortnight, that spelling is theirs on every card.
    // Without this a shift the clock export has no row for kept the roster's
    // "Evans, R" while the rest of the period read "Evans, Rosemary", and one
    // client appeared twice in the client picker - 23 shifts on 08/16-08/27.
    const client =
      displayClient(shift.clientFull || note?.client || fullClient.get(clientKey(shift.client)), shift.client)
      || null;
    const shiftKey = shiftKeyOf({
      employeeKey: shift.who,
      date: shift.date,
      startMin: shift.schedFrom ?? shift.actualFrom,
      client,
    });
    rows.push({
      key: shiftKey,
      shiftKey,
      employeeKey: shift.who,
      startMin: shift.schedFrom ?? shift.actualFrom ?? null,
      who: namesSeen.get(shift.who) || shift.name,
      date: shift.date,
      period: periodOf(shift.date),
      clockAvailable: periodsWithClock.has(periodOf(shift.date)),
      // WHETHER THE EXPORT HAS A ROW FOR THIS SHIFT, which is a different fact
      // from whether the period has an export at all. 21 of the 862 billable
      // shifts on 08/16-08/27 are booked on the roster and absent from the
      // clock export - B. Rotter's 08/24 9:30a and 10:30a among them - and
      // without this they read as though no file had been uploaded. Mánu's own
      // 08/26 is one of them and he answered what they are: admin-type work,
      // where QSP requires no clock in or out.
      inClockExport: shift.clocked === true,
      client,
      service: shift.service || null,
      schedFrom: shift.schedFrom ?? null, schedTo: shift.schedTo ?? null,
      originalFrom: shift.originalFrom ?? null, originalTo: shift.originalTo ?? null,
      actualFrom: shift.actualFrom ?? null, actualTo: shift.actualTo ?? null,
      // the punch display draws a cross off these, so a missing one must not
      // read as a shift nobody tried to clock
      noIn: !!shift.noIn, noOut: !!shift.noOut,
      gpsIn: shift.gpsIn ?? null, gpsOut: shift.gpsOut ?? null,
      // the reason staff typed on the shift, where there is one. The clock
      // export carries the same text on a third of them and is the fallback.
      scheduleNote: shift.scheduleNote
        ? { from: shift.scheduleNote.from, to: shift.scheduleNote.to, text: shift.scheduleNote.text }
        : shift.reason
          ? { from: null, to: null, text: String(shift.reason).replace(/^Reason\s+given:\s*/i, "") }
          : null,
      note: note
        ? {
          start: note.start, end: note.end, words: note.words,
          summary: note.summary, comments: note.comments, categories: note.categories,
          signedAt: note.signedAt, signedDate: note.signedDate, signedAfterMin: note.signedAfterMin,
          miles: note.miles, page: note.page,
        }
        : null,
      ...read,
    });
  }

  // A NOTE THAT NEVER FOUND A SHIFT. Two things land here and both are worth
  // seeing: a service documented that nothing in the uploaded periods bills
  // for, and a SECOND note for a client whose booking already has one - which
  // is how Ashley Cain's duplicate 08/17 note shows up now instead of being
  // dropped onto somebody else's shift.
  //
  // A NOTE ON A BLOCK THIS SCREEN DOES NOT EXAMINE IS NOT ONE OF THEM. The
  // Employee Service Notes export carries the note's own service type, and 387
  // of the 564 unmatched notes on 08/16-08/27 are written against ILS Travel,
  // Admin, Misc or Training. The audit reads billable service shifts only, so
  // those were never going to match anything - counting them turned "notes that
  // matched no billed shift" from 53 into 568 the moment the second report was
  // attached, and every one of the new ones was a note doing its job.
  //
  // The PDF does not record a service type, so its notes carry none and are
  // kept: nothing here guesses that an unmatched note was about admin.
  //
  // Trimmed to what the screen prints. The whole note is a paragraph of prose
  // and there can be hundreds of them.
  const onAService = (n) =>
    !n.service || isCappedService(n.service);
  const orphans = notes
    .filter((n) => !taken.has(n) && onAService(n))
    .map((n) => ({
      who: namesSeen.get(whoKey(n.employee)) || n.employee,
      date: n.date,
      period: periodOf(n.date),
      client: n.client,
      start: n.start,
      end: n.end,
      minutes: n.minutes,
      words: n.words,
      summary: (n.summary || "").slice(0, 220),
    }))
    .sort((a, b) => a.who.localeCompare(b.who) || a.date.localeCompare(b.date));

  // WHAT HAS ALREADY BEEN DECIDED. Looked up by the shift's own key rather than
  // by anything belonging to this upload, which is the point of the key.
  const decisions = rows.length
    ? await prisma.shiftReview.findMany({
      where: { shiftKey: { in: rows.map((r) => r.shiftKey) } },
      select: {
        shiftKey: true, decision: true, reason: true, billableMin: true, createdAt: true,
        decidedBy: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
      },
    })
    : [];
  const byKey = new Map(decisions.map((d) => [d.shiftKey, d]));
  for (const r of rows) {
    const d = byKey.get(r.shiftKey);
    r.review = d
      ? {
        decision: d.decision,
        reason: d.reason,
        billableMin: d.billableMin,
        by: d.decidedBy ? preferredName(d.decidedBy) : null,
        at: d.createdAt.toISOString(),
      }
      : null;
    // the key the authorization table shares, so the client roll-up can look
    // this shift's client up in the month's authorized hours
    r.authKey = r.client ? authClientKey(r.client) : null;
  }

  // THE MONTH'S AUTHORIZED HOURS, where a Budget Capture Report covering this
  // period's month(s) has been uploaded. Summed over a client's service types;
  // the roll-up prints billable hours against it.
  const monthKeyOf = (d) => {
    const m = /^(\d{2})\/\d{2}\/(\d{2})$/.exec(d || "");
    return m ? `20${m[2]}-${m[1]}` : null;
  };
  const monthKeys = [...new Set([monthKeyOf(batch.periodFrom), monthKeyOf(batch.periodTo)].filter(Boolean))];
  const authRows = monthKeys.length
    ? await prisma.clientAuthorization.findMany({
      where: { monthKey: { in: monthKeys } },
      select: { monthKey: true, clientKey: true, authorizedHours: true },
    })
    : [];
  const authorized = {};
  for (const a of authRows) {
    if (!authorized[a.clientKey]) authorized[a.clientKey] = { hours: 0, months: new Set() };
    authorized[a.clientKey].hours += a.authorizedHours;
    authorized[a.clientKey].months.add(a.monthKey);
  }
  for (const k of Object.keys(authorized)) authorized[k] = { hours: authorized[k].hours };
  const authMonthLabel = monthKeys.map(monthLabelOf).join(" + ") || null;
  const hasAuthorizations = authRows.length > 0;

  rows.sort((a, b) => b.score - a.score || a.who.localeCompare(b.who) || a.date.localeCompare(b.date));

  return (
    <section className="mx-auto max-w-[90rem] px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin/audit">Back to Audit</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        {batch.periodFrom} to {batch.periodTo}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Service notes against what was billed
        </h1>
        {/* the findings leave this screen as a document - flags only for now,
            on Mánu's call. Rendered fresh from the current decisions on every
            open, so it can never disagree with the cards behind it. */}
        {rows.some((r) => r.review?.decision === "flagged") && (
          <a
            href={`/portal/admin/audit/${batch.id}/report`}
            target="_blank"
            className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
          >
            Flagged report (PDF)
          </a>
        )}
      </div>

      <AuditCards
        rows={rows}
        orphans={orphans}
        authorized={hasAuthorizations ? authorized : null}
        authMonthLabel={authMonthLabel}
        periods={[...current.values()]
          .map((p) => `${p.periodFrom} to ${p.periodTo}`)
          .sort((a, b) => dateKey(b.slice(0, 8)) - dateKey(a.slice(0, 8)))}
        totals={{
          notes: notes.length,
          shifts: rows.length,
          clocked: clockLoaded,
          orphans: orphans.length,
          // which of the two service notes reports this period actually got.
          // Neither is complete on its own, so a period holding one of them is
          // a period whose "no service note" count is partly about the file.
          fromPdf: batch.serviceNotes?.pdfCount || 0,
          fromXls: batch.serviceNotes?.serviceCount || 0,
          notesName: batch.notesName || null,
          serviceNotesName: batch.serviceNotesName || null,
        }}
      />
    </section>
  );
}
