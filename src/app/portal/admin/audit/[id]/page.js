import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { isCappedService } from "@/lib/timesheet/compliance";
import { preferredName } from "@/lib/contacts";
import { scheduleKey, serviceOf, clientOf, blockTimes } from "@/lib/timesheet/schedule";
import { clockShifts } from "@/lib/timesheet/clock";
import { auditRow, shiftKeyOf } from "@/lib/timesheet/note-audit";
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
  let clockLoaded = 0;
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
        for (const row of clockShifts(Buffer.from(await res.arrayBuffer()))) {
          if (!isCappedService(row.service)) continue;
          if (dateKey(row.date) < notesFrom || dateKey(row.date) > notesTo) continue;
          clockLoaded++;
          const key = `${scheduleKey(row.name)}|${row.date}|${row.schedFrom}`;
          const existing = shifts.get(key);
          if (existing) Object.assign(existing, { ...row, who: existing.who, clocked: true });
          else shifts.set(key, { ...row, who: scheduleKey(row.name), clocked: true });
        }
      } catch (e) {
        console.error(`audit: clock export unreadable (${f.name}):`, e);
      }
    }
  }

  // ---- what was DOCUMENTED: the notes, one per shift ----
  //
  // Matched on the person and the day, then paired to the nearest shift by start
  // time - and a shift already holding a note is not offered again, so two notes
  // on a busy day cannot both land on the same booking.
  const byPersonDay = new Map();
  for (const n of notes) {
    const k = `${scheduleKey(n.employee)}|${n.date}`;
    if (!byPersonDay.has(k)) byPersonDay.set(k, []);
    byPersonDay.get(k).push(n);
  }
  const taken = new Set();
  const rows = [];
  for (const shift of shifts.values()) {
    const candidates = (byPersonDay.get(`${shift.who}|${shift.date}`) || [])
      .filter((n) => !taken.has(n));
    let note = null;
    if (candidates.length) {
      const anchor = shift.actualFrom ?? shift.schedFrom ?? 0;
      note = candidates
        .map((n) => ({ n, d: Math.abs((n.startMin ?? 0) - anchor) }))
        .sort((a, b) => a.d - b.d)[0].n;
      taken.add(note);
    }
    const read = auditRow(shift, note);
    const shiftKey = shiftKeyOf({
      employeeKey: shift.who,
      date: shift.date,
      startMin: shift.schedFrom ?? shift.actualFrom,
      client: shift.client || note?.client || null,
    });
    rows.push({
      key: shiftKey,
      shiftKey,
      employeeKey: shift.who,
      startMin: shift.schedFrom ?? shift.actualFrom ?? null,
      who: namesSeen.get(shift.who) || shift.name,
      date: shift.date,
      client: shift.client || note?.client || null,
      service: shift.service || null,
      schedFrom: shift.schedFrom ?? null, schedTo: shift.schedTo ?? null,
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

  // a note that never found a shift: the service was documented and nothing in
  // the uploaded periods bills for it
  const orphans = notes.filter((n) => !taken.has(n));

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
