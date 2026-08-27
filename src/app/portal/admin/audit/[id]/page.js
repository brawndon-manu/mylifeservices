import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { isCappedService } from "@/lib/timesheet/compliance";
import { preferredName } from "@/lib/contacts";
import { scheduleKey, serviceOf, clientOf, blockTimes } from "@/lib/timesheet/schedule";
import { clockShifts } from "@/lib/timesheet/clock";
import { auditRow, shiftKeyOf, sameClient, displayClient } from "@/lib/timesheet/note-audit";
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
  const batch = await prisma.serviceNoteBatch.findUnique({ where: { id } });
  if (!batch) notFound();

  const notes = batch.notes || [];

  // ONLY THE PAY PERIODS THESE NOTES TOUCH, and only the current upload of each.
  //
  // Written the obvious way round - every MLS batch with its timesheets - this
  // page never returned. A sheet's `data` holds its whole analyzed breakdown,
  // and 29 batches of 60 sheets is hundreds of megabytes to answer a question
  // about two fortnights. So the periods are chosen from their dates FIRST and
  // the sheets are fetched only for the batches that survive.
  //
  // Newest upload wins per fortnight, the same rule the repeat patterns page
  // applies: a re-uploaded period is a second row holding the same days, and
  // counting both would bill every shift in it twice.
  const dateKey = (d) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(d || "");
    return m ? Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]) : 0;
  };
  const notesFrom = dateKey(batch.periodFrom);
  const notesTo = dateKey(batch.periodTo);

  const heads = await prisma.timesheetBatch.findMany({
    where: { program: "MLS" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, periodFrom: true, periodTo: true,
      clockUrl: true, clockName: true, clockFindings: true,
    },
  });

  const current = new Map();
  for (const p of heads) {
    const key = `${p.periodFrom}|${p.periodTo}`;
    if (current.has(key)) continue;                       // an older upload of it
    // the period has to overlap the range the notes cover at all
    if (dateKey(p.periodFrom) > notesTo || dateKey(p.periodTo) < notesFrom) continue;
    current.set(key, p);
  }

  // ONLY THE ROSTER OUT OF EACH SHEET, projected in Postgres rather than here.
  //
  // `data` holds the whole analyzed breakdown - punches, breaks, questions,
  // answers - and all this page wants from it is `scheduleCheck.byDate`.
  // Selecting the column and reaching into it in JavaScript pulls every sheet's
  // full record across the wire, which took this page over four minutes for two
  // fortnights. The arrow operators do the same reach inside the database and
  // return a fraction of the bytes.
  const ids = [...current.values()].map((p) => p.id);
  const sheets = ids.length
    ? await prisma.$queryRawUnsafe(
      `SELECT t."sourceName",
              t.data->'scheduleCheck'->'byDate' AS bydate,
              u."name" AS legal_name,
              u."preferredFirstName" AS preferred_first,
              u."preferredLastName" AS preferred_last
         FROM "Timesheet" t
         LEFT JOIN "User" u ON u.id = t."userId"
        WHERE t."batchId" = ANY($1)`,
      ids,
    )
    : [];

  // ---- what was BILLED: every rostered block, off the sheets themselves ----
  const shifts = new Map();          // person|date|startMin -> shift
  const namesSeen = new Map();
  for (const t of sheets) {
    const key = scheduleKey(t.sourceName);
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
          const who = scheduleKey(row.name);
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
            Object.assign(best.x, {
              // THE FULL CLIENT NAME. The roster abbreviates to "Sherwold, A"
              // and the clock export spells it out as "Sherwold, Abigail", in
              // the same Last, First shape the rest of the portal uses. Kept
              // apart from `client`, which stays the roster's own spelling so
              // the matching that got us here is not rewritten under it.
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
          } else {
            // nothing rostered for that client that day, so the clock row is all
            // there is and its own schedule columns are the only account of the
            // booking
            const key = `${who}|${row.date}|${row.schedFrom}|clock`;
            shifts.set(key, {
              ...row, who, clocked: true, rosterMissing: true,
              originalFrom: row.schedFrom, originalTo: row.schedTo,
            });
          }
        }
      } catch (e) {
        console.error(`audit: clock export unreadable (${f.name}):`, e);
      }
    }
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
    const k = `${scheduleKey(n.employee)}|${n.date}`;
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

  const taken = new Set();
  const rows = [];
  for (const shift of shifts.values()) {
    const sameDay = (byPersonDay.get(`${shift.who}|${shift.date}`) || [])
      .filter((n) => !taken.has(n));
    // the booking's client, against the client the note was written about
    const forThisClient = shift.client
      ? sameDay.filter((n) => sameClient(n.client, shift.client))
      : sameDay;
    let note = null;
    if (forThisClient.length) {
      const anchor = shift.actualFrom ?? shift.schedFrom ?? 0;
      note = forThisClient
        .map((n) => ({ n, d: Math.abs((n.startMin ?? 0) - anchor) }))
        .sort((a, b) => a.d - b.d)[0].n;
      taken.add(note);
    }
    const read = auditRow(shift, note);
    const shiftKey = shiftKeyOf({
      employeeKey: shift.who,
      date: shift.date,
      startMin: shift.schedFrom ?? shift.actualFrom,
      // FULL WHERE ANYTHING HAS IT. Mánu 2026-08-27: "lets show full names of
      // clients". The clock export is preferred over the note because it is
      // already "Last, First" like every other name on these screens, while the
      // note writes "Abigail \"Abbie\" Sherwold". The roster's abbreviation is
      // the last resort, for a shift no clock row and no note ever reached.
      client: displayClient(shift.clientFull || note?.client, shift.client) || null,
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
      // FULL WHERE ANYTHING HAS IT. Mánu 2026-08-27: "lets show full names of
      // clients". The clock export is preferred over the note because it is
      // already "Last, First" like every other name on these screens, while the
      // note writes "Abigail \"Abbie\" Sherwold". The roster's abbreviation is
      // the last resort, for a shift no clock row and no note ever reached.
      client: displayClient(shift.clientFull || note?.client, shift.client) || null,
      service: shift.service || null,
      schedFrom: shift.schedFrom ?? null, schedTo: shift.schedTo ?? null,
      originalFrom: shift.originalFrom ?? null, originalTo: shift.originalTo ?? null,
      actualFrom: shift.actualFrom ?? null, actualTo: shift.actualTo ?? null,
      gpsIn: shift.gpsIn ?? null, gpsOut: shift.gpsOut ?? null,
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
  // Trimmed to what the screen prints. The whole note is a paragraph of prose
  // and there can be hundreds of them.
  const orphans = notes
    .filter((n) => !taken.has(n))
    .map((n) => ({
      who: namesSeen.get(scheduleKey(n.employee)) || n.employee,
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
        shiftKey: true, decision: true, reason: true, createdAt: true,
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
        by: d.decidedBy ? preferredName(d.decidedBy) : null,
        at: d.createdAt.toISOString(),
      }
      : null;
  }

  rows.sort((a, b) => b.score - a.score || a.who.localeCompare(b.who) || a.date.localeCompare(b.date));

  return (
    <section className="mx-auto max-w-[90rem] px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin/audit">Back to Audit</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        {batch.periodFrom} to {batch.periodTo}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Service notes against what was billed
      </h1>

      <AuditCards
        rows={rows}
        orphans={orphans}
        periods={[...current.values()]
          .map((p) => `${p.periodFrom} to ${p.periodTo}`)
          .sort((a, b) => dateKey(b.slice(0, 8)) - dateKey(a.slice(0, 8)))}
        totals={{
          notes: notes.length,
          shifts: rows.length,
          clocked: clockLoaded,
          orphans: orphans.length,
          sourceName: batch.sourceName,
        }}
      />
    </section>
  );
}
