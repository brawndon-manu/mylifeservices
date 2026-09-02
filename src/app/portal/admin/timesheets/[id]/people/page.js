import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { restKey, restNameFor } from "@/lib/timesheet/rests";
import { preferredName } from "@/lib/contacts";
import { sortKeyFrom, sortPeople } from "@/lib/timesheet/people-sort";
import SortBar from "../../_components/SortBar";
import Avatar from "@/components/Avatar";
import CheckStatusChip from "@/components/CheckStatusChip";
import ContactViaIcon from "@/components/ContactViaIcon";
import { violationsFor } from "@/lib/timesheet/violations";
import { tagsForPerson, isClean } from "@/lib/timesheet/person-tags";
import { attendanceOf } from "@/lib/timesheet/compliance";
import { STANDING_STATUSES, MARK_STATUS_VALUES, checkStatus, normalizeCheckStatus } from "@/lib/timesheet/check-status";
import { markKey, marksByKey, batchReach } from "@/lib/timesheet/mark-key";
import BackLink from "@/components/BackLink";
import FlagButton from "../checks/FlagButton";
import RowFlagButton from "../checks/RowFlagButton";
import RowComments from "../checks/RowComments";
import { PresenceBar, PresenceCard } from "../Presence";
import SheetMenu from "../../_components/SheetMenu";

export const metadata = { title: "All employees", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const f2 = (n) => (n == null ? "-" : (Math.round(n * 100) / 100).toFixed(2));

// IS THE PORTAL'S NAME FOR THEM THE SAME HUMAN NAME THE EXPORT PRINTS?
//
// "Uribe, Brandon" and "Brandon Uribe" are one name written two ways, and
// printing both on the row is noise. Compared as an unordered set of words so
// the surname-first form matches, lowercased and stripped of punctuation.
//
// NOT `restKey`, which looks like the obvious tool and is not: it is built for
// the Rest Periods Report's own "Last, First" spelling and would call these two
// different. The nearest wrong function is worse than a small right one.
const nameWords = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
const sameHuman = (a, b) => nameWords(a) === nameWords(b);

// FULL LITERAL CLASS STRINGS. Tailwind v4 compiles what it can see in source, so
// a class assembled from a variable produces no colour - the violations group
// shipped with a plain white border once for exactly that reason.
const TONE = {
  violation: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-800/70 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
  premium: "border-fuchsia-400 bg-fuchsia-100 text-fuchsia-900 dark:border-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-200",
  conflict: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/40 dark:text-rose-300",
  anomaly: "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800/70 dark:bg-violet-950/40 dark:text-violet-300",
  missing: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-300",
  // HOW THE SCHEDULE WAS BUILT, and deliberately the only cool colour here.
  // Every tone above is warm because it says something about this person's
  // record or their pay. A booking rostered past the cap was set before they
  // clocked in, so it is the office's to fix, and dressing it in the same rose
  // as a punch that does not read puts it on them.
  scheduling: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-300",
};

// EVERYBODY ON THE TIMESHEET, ONE CARD EACH.
//
// Mánu 2026-08-12: "a button to view all employees. it should show a card for
// every name in the timesheet. and have tags for every violation / premium /
// missing / conflict. under it it should see something to view their day by day
// with the calendar views so we can reach out to them."
//
// THE CLEAN ONES ARE THE POINT. The checks list only shows people something is
// wrong with, which on the August batch is 46 of 60 - so 14 people appear on no
// screen this portal has, and finding one of them to call meant knowing they
// existed. A list of everybody is also the only way to see that somebody is
// missing from the export entirely.
//
// It does not re-decide anything. Every tag reads a source that is already the
// single definition of its own question - see `person-tags.js`.
export default async function AllPeoplePage({ params, searchParams }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const { id } = await params;
  // the order lives in the URL so it can be sent to somebody. Unknown keys fall
  // back to the default rather than erroring - see sortKeyFrom.
  const sort = sortKeyFrom((await searchParams)?.sort);
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    include: {
      timesheets: {
        orderBy: { sourceName: "asc" },
        select: {
          id: true, sourceName: true, paidHours: true, premiumHours: true,
          // the SCALAR, not just the `user` relation below. a mark hangs off
          // this, and a select that omits it makes every person key null on
          // this screen while the checks screen reads them fine.
          userId: true,
          otHours: true, doubleHours: true,
          signedAt: true, sentAt: true, data: true,
          // the office hold - the kebab toggles it and the card wears the chip
          heldAt: true, heldByName: true, heldReason: true,
          // HOW TO REACH THEM, which is the whole job of this screen.
          //
          // `sharePhonePublicly` is NOT consulted, and that is deliberate: its
          // own comment says it hides the phone on the PUBLIC shared link
          // (/c/[id]) and that it is "still shown to signed-in staff in the
          // portal". This is an admin screen behind `canManageTimesheets`.
          //
          // The NAME still comes from `sourceName`, the export's own spelling,
          // for the same reason it does on the checks list: every figure here
          // is quoted from those documents and the name has to be the one a
          // reader can find in the PDF. The portal name rides underneath when
          // the two differ, because that is who you are about to call.
          user: {
            select: {
              name: true, preferredFirstName: true, preferredLastName: true,
              image: true, email: true, phone: true,
            },
          },
        },
      },
    },
  });
  if (!batch) notFound();

  // EVERY CONTACT EVER MADE ON THIS BATCH, oldest first so a card reads down the
  // way it happened. One query for the batch rather than one per person: sixty
  // rows would otherwise be sixty round trips for a list that is usually short.
  const history = new Map();
  for (const e of await prisma.timesheetContactLog.findMany({
    // only the ACTIONS. Rows with a derived status exist from when "waiting"
    // was a button somebody could press, and they say nothing the line above
    // them does not already say.
    // BY THE PERIOD. The log is the half that cannot be rebuilt - a mark can be
    // re-made, "we rang them on the 12th and again on the 13th" cannot - so it
    // must not be scoped to the upload that happened to be open at the time.
    where: {
      program: batch.program,
      periodFrom: batch.periodFrom, periodTo: batch.periodTo,
      status: { in: MARK_STATUS_VALUES },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, rowKey: true, status: true, via: true, byName: true, byImage: true, createdAt: true,
      personKey: true, findingKey: true,
    },
  })) {
    const hk = markKey(e.personKey, e.findingKey);
    if (!history.has(hk)) history.set(hk, []);
    history.get(hk).push({
      id: e.id,
      status: e.status,
      via: e.via,
      byName: e.byName,
      byImage: e.byImage,
      // formatted server side, in Pacific, for the same reason the mark's own
      // timestamp is: a shared worklist where "yesterday" must mean one thing
      when: e.createdAt.toLocaleString("en-US", {
        timeZone: "America/Los_Angeles", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit",
      }),
    });
  }

  // EVERY NOTE ON THE BATCH, grouped by row, oldest first so a card reads down
  // the way the conversation went. One query rather than sixty.
  const notes = new Map();
  for (const c of await prisma.timesheetRowComment.findMany({
    where: { batchId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, rowKey: true, userId: true, userName: true, userImage: true, body: true, createdAt: true },
  })) {
    if (!notes.has(c.rowKey)) notes.set(c.rowKey, []);
    notes.get(c.rowKey).push({
      id: c.id,
      userName: c.userName,
      userImage: c.userImage,
      body: c.body,
      // `isMine` decides whether a delete link shows. Worked out here so the
      // client is never handed a user id to compare against.
      isMine: c.userId === user.id,
      // formatted server side in Pacific, for the same reason every other
      // timestamp on this screen is: two people share this list.
      when: c.createdAt.toLocaleString("en-US", {
        timeZone: "America/Los_Angeles", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit",
      }),
    });
  }

  // EVERY FLAG ON THE BATCH, grouped by row. Many per row on purpose: two
  // people wanting eyes on the same person is the normal case, not a clash.
  const rowFlags = new Map();
  for (const f of await prisma.timesheetRowFlag.findMany({
    where: { batchId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, rowKey: true, userId: true, userName: true, userImage: true },
  })) {
    if (!rowFlags.has(f.rowKey)) rowFlags.set(f.rowKey, []);
    // `isMe` so the button knows whether pressing it raises or lowers, without
    // the client ever being handed a user id to compare
    rowFlags.get(f.rowKey).push({ ...f, isMe: f.userId === user.id, userId: undefined });
  }

  // the horizon this screen is showing - see mark-key.js
  const reach = batchReach(batch);

  const flags = (
    marksByKey(await prisma.timesheetCheckFlag.findMany({
      where: { program: batch.program, periodFrom: batch.periodFrom, periodTo: batch.periodTo },
      // `status` is what the chip reads. Left off the select it comes back
      // undefined, the chip renders as unset, and every mark on the batch
      // silently looks like nobody has started - which is the same trap
      // `restsUrl` sprang three times yesterday.
      select: {
        rowKey: true, status: true, via: true, flaggedName: true, flaggedImage: true, updatedAt: true,
        personKey: true, findingKey: true, coveredThrough: true,
      },
    }))
  );

  // Rest report rows worth a person's attention, counted per person. KEYED ON
  // THE REPORT'S OWN SPELLING, because QSP files Delgado Pineda, Ruth under
  // "Delgado Pineda, Angel" and matching on the timesheet's name finds none of
  // her eleven rows.
  const restRows = new Map();
  const byRestName = new Map(
    batch.timesheets.map((t) => [restKey(restNameFor(t.sourceName, t.data)), t.id]),
  );
  for (const r of (batch.restsByDate || []).filter((x) => x.kind)) {
    const sheetId = byRestName.get(restKey(r.name));
    if (!sheetId) continue;
    restRows.set(sheetId, (restRows.get(sheetId) || 0) + 1);
  }

  const people = batch.timesheets.map((t) => {
    const v = violationsFor(t.data);
    const tags = tagsForPerson(t, {
      restRowCount: restRows.get(t.id) || 0,
      // the batch's clock reading for them - the export writes nothing to a sheet
      attendance: attendanceOf(batch, t.sourceName),
    });
    // the portal's own name for them, shown under the export's spelling only
    // when the two actually differ - "Uribe, Brandon" over "Brandon Uribe" is
    // noise, and this list already has enough on each row.
    const portal = t.user ? preferredName(t.user) : null;
    return {
      id: t.id,
      who: t.sourceName,
      portal: portal && !sameHuman(portal, t.sourceName) ? portal : null,
      paid: t.paidHours,
      ot: t.otHours,
      double: t.doubleHours,
      premium: t.premiumHours,
      days: v.days.length,
      toRaise: v.total,
      tags,
      clean: isClean(tags),
      userId: t.userId,
      // the sheet menu's slice: the hold, the mileage either side of a
      // removal, and whether a signature would come off with it
      held: !!t.heldAt,
      heldByName: t.heldByName,
      heldReason: t.heldReason,
      miles: t.data?.qspMiles ?? null,
      milesRemoved: t.data?.qspMilesRemoved?.was ?? null,
      signed: !!t.signedAt,
      flag: flags.get(markKey(t.userId, "person")) || null,
      // normalised on the way in, so the summary strip below can group on the
      // current key without every legacy row falling out of its heading
      status: normalizeCheckStatus(flags.get(markKey(t.userId, "person"))?.status),
      // THE MARK IS ABOUT SOMETHING THAT NO LONGER EXISTS.
      //
      // Bucio, Mary was marked Waiting response on the 08/09 export. On the
      // 08/13 one she has a day more, seven hours more pay and no finding at
      // all - so the fix landed. The mark followed her across, correctly, and
      // then sat on the worklist in amber saying chase her about nothing.
      //
      // Not cleared: somebody did ring her and that is worth keeping. It just
      // stops being a to-do, which is the difference between a record and a
      // job.
      settledByEngine:
        !!flags.get(markKey(t.userId, "person")) && isClean(tags) && v.total === 0,
      via: flags.get(markKey(t.userId, "person"))?.via || null,
      // formatted here rather than in the client: a Date crossing the boundary
      // renders in whatever timezone the browser is in, and this is a shared
      // worklist where "yesterday" has to mean the same thing to both of them.
      log: history.get(markKey(t.userId, "person")) || [],
      rowFlags: rowFlags.get(`person-${t.id}`) || [],
      notes: notes.get(`person-${t.id}`) || [],
      flaggedByMe: (rowFlags.get(`person-${t.id}`) || []).some((f) => f.isMe),
      markedOn: flags.get(markKey(t.userId, "person"))?.updatedAt
        ? flags.get(markKey(t.userId, "person")).updatedAt.toLocaleString("en-US", {
            timeZone: "America/Los_Angeles", month: "short", day: "numeric",
            hour: "numeric", minute: "2-digit",
          })
        : null,
      image: t.user?.image || null,
      email: t.user?.email || null,
      phone: t.user?.phone || null,
    };
  });

  // whoever is looking, for the flag button to show while its write is in
  // flight. Name and picture only - the client never needs an id.
  const me = { name: preferredName(user) || user.name, email: user.email, image: user.image };

  // ORDERED FOR THE LIST ONLY. Everything counted below - the clean tally, the
  // status strip - reads `people`, and those are totals: they mean the same
  // thing whatever order the cards are in, and would be wrong to recompute per
  // sort. `sortPeople` returns a new array for that reason.
  const listed = sortPeople(people, sort);

  const clean = people.filter((p) => p.clean).length;
  const period = batch.partialPeriod
    ? `${batch.partialFrom} to ${batch.partialThrough}`
    : `${batch.periodFrom} to ${batch.periodTo}`;

  return (
    // the list reports itself as on the BATCH but on no row - saying "somewhere
    // on this page" is honest, and guessing a row from scroll position is not.
    // NO PROVIDER HERE. It is mounted once in the batch layout so every
    // screen under a batch counts as being in it - and a second one under the
    // same user would overwrite the first on every beat, the two fighting
    // over which page they were on. This reads from that one through context.
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <BackLink href={`/portal/admin/timesheets/${batch.id}/checks`}>Back to Data checks</BackLink>
      <PresenceBar />

      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">Admin</p>
      {/* ALL EMPLOYEES. The link in says "View all employees" and the way back
          says "Back to all employees", so the page says it too - it read
          "Everybody on this timesheet" and was a third phrasing of one screen.
          The period is on the line below, so nothing is lost by dropping it. */}
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        All employees
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
        {period}
        {batch.partialPeriod && " · partial period"} · every name in the export,
        including the {clean} with nothing flagged. The Data checks list only
        shows people something is wrong with, so this is the one place somebody
        clean can be found. Open anybody to see their day by day with the
        calendar under each day.
      </p>

      {/* the totals below are the same whatever order the cards are in, so the
          control sits between the copy and them rather than above everything */}
      <SortBar basePath={`/portal/admin/timesheets/${batch.id}/people`} current={sort} />

      <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4 rounded-xl border border-border bg-surface p-5">
        {[
          ["People", String(people.length)],
          // THE PERIOD'S OWN TOTALS. Summed from the sheets rather than read off
          // the batch, because the batch carries no total of its own - the same
          // arithmetic the payout report does, and it moves the moment a sheet
          // is rebuilt.
          ["Total hours", f2(people.reduce((n, p) => n + (p.paid || 0), 0))],
          ["Overtime", f2(people.reduce((n, p) => n + (p.ot || 0), 0))],
          ["Premium hours", f2(people.reduce((n, p) => n + (p.premium || 0), 0))],
          ["With something to raise", String(people.filter((p) => p.toRaise > 0).length)],
          ["Nothing flagged", String(clean)],
        ].map(([k, val]) => (
          <div key={k}>
            <span className="block text-[11px] font-bold uppercase tracking-wide text-faint">{k}</span>
            <span className="mt-0.5 block text-xl font-bold tabular-nums text-foreground">{val}</span>
          </div>
        ))}
      </div>

      {/* ONE FULL WIDTH ROW PER PERSON, not a grid of cards. Mánu 2026-08-12
          wants to keep adding to a person's row, and a three-across grid caps
          how much any one of them can hold - the third column is already narrow
          on a laptop. Down the page each row can grow as far right as it likes
          and the list still reads as a list.

          The name sits in a fixed width column so the names line up down the
          page. That is what makes sixty rows scannable: the eye runs down one
          edge instead of hunting for where each name starts. */}
      {/* WHO HAS GOT WHERE, at a glance, before you start reading rows.
          Mánu 2026-08-13 pointed at the meeting attendance screen: a heading per
          state, a count, and the faces underneath. The faces here are the
          EMPLOYEES in that state, which is what the pattern he pointed at does -
          the face of whoever MARKED them is on their own row, where it answers
          "who has contacted who" for that one person.
          "Nobody" is spelled out rather than left as an empty row, because an
          empty space under a heading reads as something failing to load. */}
      <div className="mt-6 grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-3">
        {/* THREE HEADINGS, AND THE FIRST ONE COUNTS DIFFERENTLY.
            Mánu 2026-08-13: "There should still be a contact there on the top. I
            know it'll be pretty much tied with waiting response, but still leave
            it there at the very top."
            Nobody RESTS in "contacted" any more - contacting leaves them waiting
            - so counting it the way the other two are counted would show zero
            for ever. It counts people who have been contacted AT LEAST ONCE,
            read off the log. That deliberately overlaps the other two: somebody
            verified was contacted first, and Mánu knows it reads that way. It is
            the number you want when the question is "how many have we actually
            reached", which no state can answer once the state has moved on. */}
        {[
          { ...checkStatus("contacted"), people: people.filter((p) => p.log.some((e) => e.status === "contacted")) },
          // `settledByEngine` people are deliberately excluded from their own
          // state's heading: they are not waiting on anybody, the export
          // already answered it. They keep their chip and their log on the card.
          ...STANDING_STATUSES.map((s) => ({
            ...s,
            people: people.filter((p) => p.status === s.key && !p.settledByEngine),
          })),
          {
            key: "settled-by-engine",
            label: "Settled by the export",
            short: "Settled",
            chip: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300",
            dot: "bg-emerald-600",
            people: people.filter((p) => p.settledByEngine),
          },
        ].map((s) => {
          const mine = s.people;
          return (
            <div key={s.key}>
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${s.dot}`} />
                <span className="text-[11px] font-bold uppercase tracking-wide text-faint">
                  {s.label}
                </span>
                <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-bold tabular-nums text-foreground">
                  {mine.length}
                </span>
              </div>
              {mine.length === 0 ? (
                <p className="mt-2 text-xs text-faint">nobody</p>
              ) : (
                <div className="mt-2 flex flex-wrap items-center">
                  {mine.slice(0, 10).map((p) => (
                    <span
                      key={p.id}
                      title={p.via ? `${p.who} (${p.via})` : p.who}
                      className="relative -ml-2 rounded-full ring-2 ring-surface first:ml-0"
                    >
                      <Avatar name={p.portal || p.who} email={p.email} image={p.image} size={24} />
                      {/* the little phone or envelope, tucked on the corner of
                          the face, so the stack says HOW as well as who */}
                      {p.via && (
                        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-surface p-0.5 text-muted ring-1 ring-border">
                          <ContactViaIcon via={p.via} size={9} />
                        </span>
                      )}
                    </span>
                  ))}
                  {mine.length > 10 && (
                    <span className="ml-2 text-xs text-faint">+{mine.length - 10}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 space-y-2">
        {listed.map((p) => {
          // SETTLED BY THE EXPORT WEARS ITS OWN COLOUR, not the state it came
          // from. Amber next to a name means chase them, and there is nothing
          // left to chase - the fix is already in the file.
          const statusMeta = p.settledByEngine
            ? {
              ...checkStatus(p.status),
              short: "Settled",
              label: "Settled by the export",
              chip: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300",
            }
            : checkStatus(p.status);
          return (
          // PresenceCard carries the row's own styling rather than wrapping it,
          // so reporting the pointer does not put a second box around every
          // card. It draws whoever else is on this row in the top right.
          //
          // A FLAGGED CARD IS OUTLINED RED, whoever raised it. An outline rather
          // than a tint, so it reads at a glance down a list of sixty without
          // fighting the left-hand status stripe.
          //
          // `card-lift` is the standard hover across the portal - the lift plus
          // the hard light-blue offset shadow - so these rows behave like every
          // other card rather than being the one list that sits flat. The
          // resting border and shadow-sm stay inline, per the note on the class
          // in globals.css.
          <PresenceCard
            key={p.id}
            rowKey={`person-${p.id}`}
            className={`card-lift rounded-lg border border-border bg-surface p-4 shadow-sm border-l-4 ${
              p.clean ? "border-l-emerald-600/50" : "border-l-fuchsia-500"
            } ${p.rowFlags.length ? "ring-2 ring-rose-500" : ""}`}
          >
            <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
              {/* WHO THEY ARE AND HOW TO REACH THEM, which is what this screen
                  is for: the next thing that happens after reading a row is
                  somebody picking up the phone. The address and the number are
                  real links, so it is one tap on a phone rather than a
                  copy-paste.
                  The picture earns its place by making sixty rows scannable by
                  face rather than by surname. `Avatar` falls back to initials on
                  a tinted circle when nobody has set one. */}
              <div className="flex w-full shrink-0 items-start gap-3 sm:w-72">
                <Avatar name={p.portal || p.who} email={p.email} image={p.image} size={36} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    {p.who}
                    {/* the state's own icon beside the name, so a face and a
                        name already say where this person is before the eye
                        reaches the right-hand side of the row */}
                    {statusMeta && (
                      <span className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-bold uppercase ${statusMeta.chip}`}>
                        <ContactViaIcon via={p.via} size={10} />
                        {statusMeta.short}
                      </span>
                    )}
                  </p>
                  {p.portal && <p className="text-xs text-faint">{p.portal}</p>}
                  <p className="mt-0.5 text-xs tabular-nums text-faint">
                    {f2(p.paid)} hrs
                    {p.ot > 0 && (
                      <span className="font-semibold text-amber-700 dark:text-amber-400">
                        {" "}· {f2(p.ot)} OT
                      </span>
                    )}
                    {" "}· {p.days} {p.days === 1 ? "day" : "days"}
                  </p>
                  {/* ONE LINE EACH, and that is the fix rather than the layout.
                      They shared a line with `truncate` on it, and in a 288px
                      column a work email fills the row on its own - so the phone
                      was ellipsised into the three dots Mánu asked about. A
                      phone number is short and is the thing you are most likely
                      to want to read, so it never truncates now.
                      The email keeps `truncate`: it is long, it is a link, and
                      the full address is in the title and one click away. */}
                  {p.email && (
                    <a
                      href={`mailto:${p.email}`}
                      title={p.email}
                      className="mt-0.5 block truncate text-xs text-brand underline underline-offset-2"
                    >
                      {p.email}
                    </a>
                  )}
                  {p.phone && (
                    <a
                      href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}
                      className="mt-0.5 block whitespace-nowrap text-xs text-brand underline underline-offset-2"
                    >
                      {p.phone}
                    </a>
                  )}
                  {/* NO ACCOUNT AT ALL is a real state and worth saying out
                      loud: it means nothing can be sent to them, which somebody
                      needs to know before they wonder why no email arrived. */}
                  {!p.email && (
                    <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                      No portal account, so nothing can be sent to them.
                    </p>
                  )}
                </div>
              </div>

              {/* WHAT THEY ARE CHARGED, as a figure rather than a chip.
                  It is the number the row gets read for, and one hour is owed
                  per workday per kind - so it should equal the findings beside
                  it. Aranda's August row reads 5 rest and 5 meal against 10.00,
                  and a premium with nothing beside it to account for it is the
                  same failure the batch level 148 = 148.00 exists to catch.

                  Printed at 0.00 too, so the column stays a column. A blank
                  reads as "not worked out yet" rather than "nothing owed". */}
              <div className="w-28 shrink-0">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-faint">
                  Premium hrs
                </span>
                <span
                  className={`mt-0.5 block text-lg font-bold tabular-nums ${
                    p.premium > 0 ? "text-fuchsia-600 dark:text-fuchsia-400" : "text-faint"
                  }`}
                >
                  {f2(p.premium)}
                </span>
                {p.toRaise > 0 && (
                  <span className="block text-[11px] tabular-nums text-muted">
                    {p.toRaise} to raise
                  </span>
                )}
              </div>

              {/* the middle is deliberately the flexible part, so whatever gets
                  added next has somewhere to go without the row re-laying out */}
              <div className="min-w-[16rem] flex-1">
                <div className="flex flex-wrap gap-1.5">
                  {p.clean ? (
                    <span className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300">
                      Nothing flagged
                    </span>
                  ) : (
                    // premium is not a chip here: it has its own column now, and
                    // saying it twice on one row is how two copies of a fact
                    // start disagreeing
                    p.tags.filter((t) => t.key !== "premium").map((tag) => (
                      <span
                        key={tag.key}
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${TONE[tag.tone]}`}
                      >
                        {tag.n != null && (
                          <span className="tabular-nums">{tag.figure ? f2(tag.n) : tag.n} </span>
                        )}
                        {/* a tag may carry a plural, and most do not: the older
                            labels are phrases a count sits in front of without
                            agreeing ("2 Rest period not taken"), and rewording
                            those is a copy decision, not this one. A tag that
                            DOES supply a plural gets it used, so the newer ones
                            can read properly at one and at nine. */}
                        {tag.plural && tag.n !== 1 ? tag.plural : tag.label}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* THE WAY IN, on every row and not only the ones with a finding.
                  Their page draws every day of the period with the real calendar
                  under it, clean days included, which is the thing you read
                  before picking up the phone. */}
              {/* right-aligned at every width, same as the pay period cards -
                  Mánu 2026-08-16 wants this block sitting the same way on both
                  screens. `items-stretch` made each control the width of the
                  column rather than its own, so the two screens lined up
                  differently once the row wrapped on a phone. */}
              <div className="ml-auto flex shrink-0 flex-col items-end gap-1.5">
                {/* the office's per-sheet controls, and the hold's chip when
                    one stands. The chip is admin-side words - the employee's
                    page carries its own, approved separately. */}
                <div className="flex items-center gap-1.5">
                  {p.held && (
                    <span
                      title={[p.heldByName && `Held by ${p.heldByName}`, p.heldReason]
                        .filter(Boolean).join(" - ") || undefined}
                      className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-300"
                    >
                      Signing held
                    </span>
                  )}
                  <SheetMenu
                    timesheetId={p.id}
                    held={p.held}
                    miles={p.miles}
                    milesRemoved={p.milesRemoved}
                    signed={p.signed}
                  />
                </div>
                {/* `from=people` so their page knows to send Back here rather
                    than to Data checks, which is where it always went and is
                    not where you were. */}
                <Link
                  href={`/portal/admin/timesheets/${batch.id}/person/${p.id}?from=people`}
                  className="card-lift block rounded-md border border-border bg-surface-2 px-3 py-2 text-center text-xs font-semibold text-brand shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  View their day by day
                </Link>
                {/* THE STATE IN ITS COLOUR, under the link on the right.
                    Mánu 2026-08-13: "On the right, under view their day, put the
                    color of contacted, waiting for response, verified in QSP."
                    READ ONLY on purpose. The control that CHANGES it is along
                    the bottom of the card, and two things that both look
                    pressable and set the same field is how somebody ends up
                    clicking the one that does nothing. This one is a label: the
                    same colours, so the right-hand edge of a row says where the
                    person is from across the list without reading a word.
                    Absent rather than greyed when nobody has marked them - an
                    empty slot is the honest picture of "not started", and the
                    bottom of the card already says so in words. */}
                {statusMeta && (
                  <span
                    title={
                      p.settledByEngine
                        ? `Marked ${checkStatus(p.status)?.label || p.status}, and the export no longer flags anything for them.`
                        : undefined
                    }
                    className={`rounded-md border px-2 py-1 text-center text-[11px] font-semibold ${statusMeta.chip}`}
                  >
                    {statusMeta.label}
                  </span>
                )}
              </div>
            </div>

            {/* WHERE THIS PERSON HAS GOT TO, along the bottom of their card.
                Mánu 2026-08-13: "I wanna have it on the bottom of their card."
                It was sharing the right-hand group with the link, which put the
                thing you press most often beside the thing you press once and
                made both easy to hit by mistake. On its own line it also has
                room to say WHO marked it and WHEN, which is the record he wants
                to keep - a chip alone says the state and loses the history. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3">
              {/* WHERE THEY ARE ON THE LEFT, THE ACT OF MARKING ON THE RIGHT.
                  Mánu 2026-08-13: "leave where it says contacted on the left,
                  though. and the ability to mark should stay. even if they've
                  selected something." The chip is a label now and the button is
                  always pressable, so contacting somebody a second time has
                  somewhere to happen - and every one of those is a row in the
                  log below. */}
              <CheckStatusChip flag={p.flag} reach={reach} />
              {/* THREE STATES, NOT TWO. A mark with no history is a real one:
                  the marks made before the log existed have nothing behind them,
                  and saying "nobody has picked this person up" beside a
                  Contacted chip would have the card contradicting itself. */}
              {p.log.length === 0 && !p.flag && (
                <span className="text-[11px] text-faint">
                  Nobody has picked this person up yet.
                </span>
              )}
              {p.log.length === 0 && p.flag && (
                <span className="text-[11px] text-faint">
                  {p.flag.flaggedName || "somebody"}
                  {p.markedOn && `, ${p.markedOn}`}
                  {" "}· marked before contacts were logged, so there is no history behind it
                </span>
              )}
              {/* the act of marking, then the flag to its right. They were
                  stacked; Mánu 2026-08-13: "Put the mark button on the left side
                  of the flag." Side by side also stops the strip growing a
                  second row on every card. */}
              <span className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
                <FlagButton
                  batchId={id}
                  rowKey={`person-${p.id}`}
                  personKey={p.userId}
                  findingKey="person"
                  coveredThrough={reach}
                  flag={p.flag}
                />
                <RowFlagButton
                  batchId={id}
                  rowKey={`person-${p.id}`}
                  flags={p.rowFlags}
                  mine={p.flaggedByMe}
                  me={me}
                />
              </span>
            </div>

            {/* EVERY TIME, not just the last time.
                Mánu 2026-08-13: "I want to log all the times we've contacted and
                show every time. In case we contact them more than once, we wanna
                have record of this."
                Oldest first, so it reads down the way it happened. It survives
                the mark being cleared, because clearing means the person is back
                on the pile rather than that nobody ever called them. */}
            {p.log.length > 0 && (
              <ul className="mt-2 space-y-1">
                {p.log.map((e) => {
                  const m = checkStatus(e.status);
                  return (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${m?.dot || "bg-border-strong"}`} />
                      <ContactViaIcon via={e.via} size={11} />
                      <span className="font-semibold text-foreground">{m?.label || e.status}</span>
                      <span className="text-faint">{e.byName || "somebody"}</span>
                      <span className="tabular-nums text-faint">{e.when}</span>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* THE NOTES, last thing on the card. The status says where they
                are, the log says what was done, and this is the sentence
                neither can hold. */}
            <RowComments batchId={id} rowKey={`person-${p.id}`} comments={p.notes} />
          </PresenceCard>
          );
        })}
      </div>
    </section>
  );
}
