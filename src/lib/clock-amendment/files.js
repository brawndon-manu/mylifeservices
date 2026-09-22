// THE TWO FILES THE OFFICE UPLOADS, read into the shifts worth raising a form for.
//
// The clock export says which shifts have a missing punch. The service notes
// say what the person who worked it wrote about the visit, with the times they
// put on it and when they filed it. Paired here the way the audit build pairs
// them: same person, same day, same client, nearest start. The result is a list
// the office ticks from - nothing is raised by this module, it only reads.
//
// SERVER ONLY. The note reader loads pdfjs and the page cutter loads pdf-lib.
//
// relative, not "@/lib/...": the pure parts of this file are exercised by the
// test runner and by one-off scripts outside Next, where the alias does not
// resolve
import { PDFDocument } from "pdf-lib";
import { clockShifts } from "../timesheet/clock.js";
import { parseServiceNotesPdf } from "../timesheet/service-notes.js";
import { sameClient } from "../timesheet/note-audit.js";
import { scheduleKey } from "../timesheet/schedule.js";
import { buildWhoKey } from "../timesheet/people.js";
import { ampmLabel } from "../timesheet/hours-label.js";
import { punchIssue, hasIssue, LATE_MIN } from "./rules.js";

// the clock export prints "Last, First", the notes print "First Last", and the
// accounts print the legal name. `buildWhoKey` carries the preferred names and
// the known misspellings, so all three land on the same key.
export function accountsByKey(users, who) {
  const map = new Map();
  for (const u of users) {
    const k = who(u.name);
    if (k && !map.has(k)) map.set(k, u);
  }
  return map;
}

// one shift as the card and the form print it: the clock's minutes turned into
// the times everyone else in this app writes
export function shiftFacts(s) {
  return {
    staffName: s.name,
    client: s.client,
    service: s.service,
    date: s.date,
    scheduledIn: ampmLabel(s.schedFrom),
    scheduledOut: ampmLabel(s.schedTo),
    clockedIn: s.noIn ? null : ampmLabel(s.actualFrom),
    clockedOut: s.noOut ? null : ampmLabel(s.actualTo),
    gpsIn: s.gpsIn,
    gpsOut: s.gpsOut,
    qspReason: s.reason || null,
    // minutes the clock-in came after the scheduled start, when it did
    lateBy: s.startDelta != null && s.startDelta >= LATE_MIN ? s.startDelta : null,
  };
}

// the notes a person wrote that day, keyed the way the shifts are
function notesByPersonDay(notes, who) {
  const by = new Map();
  for (const n of notes) {
    const k = `${who(n.employee)}|${n.date}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(n);
  }
  return by;
}

// which pages of the upload belong to one note: from its own first page to the
// page before the next note starts, or the end of the file
export function notePageSpan(notes, note, pageCount) {
  const starts = notes.map((n) => n.page).filter((p) => p != null).sort((a, b) => a - b);
  const next = starts.find((p) => p > note.page);
  return { from: note.page, to: (next ? next - 1 : pageCount) };
}

// -> { shifts, notes, pageCount, candidates, underFloor }
//
// candidates: every shift with a missing punch or a late clock-in, each with
// the note the day holds for it (or null), the account the clock name resolves
// to (or null), and the pages of the upload the note sits on. `underFloor`
// counts the clock-ins that were late by less than the floor and so are not
// listed, so the screen can say they were seen.
export async function readDayFiles({ xlsBytes, pdfBytes, users = [] }) {
  const shifts = clockShifts(xlsBytes);
  const notes = pdfBytes ? await parseServiceNotesPdf(pdfBytes) : [];
  const pageCount = pdfBytes ? (await PDFDocument.load(pdfBytes, { ignoreEncryption: true })).getPageCount() : 0;

  const who = buildWhoKey(users);
  const accounts = accountsByKey(users, who);
  const byDay = notesByPersonDay(notes, who);
  const taken = new Set();

  const candidates = [];
  let underFloor = 0;
  for (const s of shifts) {
    if (!hasIssue(s)) {
      if (!s.noIn && s.startDelta != null && s.startDelta > 0) underFloor++;
      continue;
    }
    const issue = punchIssue(s);
    const sameDay = (byDay.get(`${who(s.name)}|${s.date}`) || []).filter((n) => !taken.has(n));
    // a note names its client and is only ever offered to that client's
    // booking. a booking with no client on it (admin, travel) has no note of
    // its own and takes none, rather than somebody else's visit
    const pool = s.client ? sameDay.filter((n) => sameClient(n.client, s.client)) : [];
    const anchor = s.actualFrom ?? s.schedFrom ?? 0;
    const note = pool
      .map((n) => ({ n, d: Math.abs((n.startMin ?? 0) - anchor) }))
      .sort((a, b) => a.d - b.d)[0]?.n || null;
    if (note) taken.add(note);
    const account = accounts.get(who(s.name)) || null;
    candidates.push({
      key: `${scheduleKey(s.name)}|${s.date}|${s.schedFrom ?? ""}|${s.client || ""}`,
      issue,
      shift: s,
      facts: shiftFacts(s),
      note,
      pages: note ? notePageSpan(notes, note, pageCount) : null,
      account: account
        ? { id: account.id, name: account.name, email: account.email, preferredFirstName: account.preferredFirstName, preferredLastName: account.preferredLastName }
        : null,
    });
  }
  return { shifts, notes, pageCount, candidates, underFloor };
}

// the note's own pages, cut out of the upload as a pdf of their own, so the
// document can carry them as an appendix without carrying everybody else's
export async function cutPages(pdfBytes, from, to) {
  const src = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const idx = [];
  for (let p = from; p <= to && p <= src.getPageCount(); p++) idx.push(p - 1);
  const pages = await out.copyPages(src, idx);
  for (const pg of pages) out.addPage(pg);
  return out.save();
}
