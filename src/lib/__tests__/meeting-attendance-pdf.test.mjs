import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFArray, decodePDFRawStream } from "pdf-lib";
import { renderAttendanceReport } from "../meeting-attendance-pdf.js";

// the attendance PDF - Mánu 2026-09-03. Pins that the print carries the
// board's own labels (Present / Absent / Unmarked, Can't make it, No
// response), that roll call only claims to exist once marks do, and that an
// empty section says so instead of vanishing.

// the same extraction, but one page at a time - the point of the one-date test
// is WHERE the content lands, which a whole-document string cannot tell you
function onePageText(doc, i) {
  return pagesText([doc.getPages()[i]]);
}

function pageText(doc) {
  return pagesText(doc.getPages());
}

function pagesText(pages) {
  let out = "";
  for (const page of pages) {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray
      ? [...Array(contents.size()).keys()].map((i) => page.node.context.lookup(contents.get(i)))
      : [page.node.context.lookup(contents)];
    for (const s of streams) {
      try { out += Buffer.from(decodePDFRawStream(s).decode()).toString("latin1"); } catch {}
    }
  }
  return out;
}
const hex = (s) => Buffer.from(s, "latin1").toString("hex").toUpperCase();

const base = () => ({
  meetingTitle: "All-staff meeting",
  mandatory: true,
  metaLine: "2 sessions · starts Sep 3, 9:00 AM · Zoom",
  office: null,
  stats: {
    invited: 5,
    responded: 4,
    pct: 80,
    going: 3,
    cantLabel: "Can't make it",
    cantCount: 1,
    noResponseCount: 1,
    present: 2,
    absent: 1,
    unmarked: 0,
    showRollCall: true,
  },
  // ONE SECTION PER DATE. The old shape was single/groups and the renderer had
  // two paths through it; a single-date meeting is now a list of one.
  sections: [
    {
      label: "Session 1",
      dateLabel: "Wed, Sep 3, 9:00 AM",
      topics: ["Rest breaks", "Filing a note the same day"],
      people: [
        { name: "Ana Alvarez", title: "ILS Coach", attended: "present" },
        // legal name leads; the preferred name rides beside it
        { name: "Ruth Brown", preferred: "Angel Brown", title: "DSP", attended: "absent" },
      ],
    },
    { label: "Session 2", dateLabel: "Wed, Sep 3, 8:00 PM", topics: [], people: [] },
  ],
  cantAll: [{ name: "Cara Cruz", title: "DSP", reason: "Working a shift" }],
  noResponse: [{ name: "Dan Diaz", title: "DSP" }],
});

test("the report prints the board's sections and labels, one section per page", async () => {
  const { bytes } = await renderAttendanceReport(base(), { generatedOn: "9/3/2026" });
  const doc = await PDFDocument.load(bytes);
  const t = pageText(doc);

  // Session 1 rides page 1 under the summary; Session 2, Can't make it and
  // No response each start their own page
  // A COVER, THEN A PAGE PER SECTION. The cover used to carry the first session
  // under the summary; Mánu 2026-09-14 asked for title pages for each section,
  // so page one is the cover alone and every date opens its own.
  assert.equal(doc.getPages().length, 5, "cover, two sessions, can't-make-it, no-response");

  assert.ok(t.includes(hex("Meeting Attendance")), "document title");
  assert.ok(t.includes(hex("All-staff meeting")), "meeting title");
  assert.ok(t.includes(hex("Mandatory")), "mandatory rides the subtitle");
  assert.ok(t.includes(hex("Responded 4 of 5 invited (80%)")), "headline");
  assert.ok(t.includes(hex("Session 1")) && t.includes(hex("Wed, Sep 3, 9:00 AM")), "section title block");
  assert.ok(t.includes(hex("What was covered")) && t.includes(hex("Rest breaks")), "its own topics print in the section");
  assert.ok(t.includes(hex("Ana Alvarez")) && t.includes(hex("Present")), "roll call prints");
  assert.ok(t.includes(hex("Absent")), "absent prints");
  assert.ok(
    t.includes(hex("Ruth Brown")) && t.includes(hex("Angel Brown")),
    "the legal name and the preferred name both print",
  );
  assert.ok(t.includes(hex("Nobody is recorded for this date.")), "empty session says so");
  assert.ok(t.includes(hex("Can't make it")) && t.includes(hex("Working a shift")), "reasons print");
  assert.ok(t.includes(hex("No response")) && t.includes(hex("Dan Diaz")), "non-responders print");
  assert.ok(t.includes(hex("Prepared 9/3/2026")), "prepared date in the footer");
});

test("before any marks the report does not claim a roll call", async () => {
  const d = base();
  d.stats.showRollCall = false;
  d.stats.present = 0;
  d.stats.absent = 0;
  d.sections[0].people = d.sections[0].people.map((p) => ({ ...p, attended: null }));
  const { bytes } = await renderAttendanceReport(d, {});
  const t = pageText(await PDFDocument.load(bytes));
  assert.ok(!t.includes(hex("Present 2")), "no present stat");
  assert.ok(t.includes(hex("Unmarked")), "people read Unmarked, not Present");
  assert.ok(
    t.includes(hex("Roll call has not been recorded for this meeting yet.")),
    "the note says the roll call is still to come",
  );
});

test("a series name rides its session's title, it does not stand alone", async () => {
  const d = base();
  d.sections[0].label = "Week 1 · Session 1";
  const { bytes } = await renderAttendanceReport(d, {});
  const t = pageText(await PDFDocument.load(bytes));
  assert.ok(t.includes(hex("Week 1 · Session 1")), "the series is part of the section title");
});

test("each date prints its OWN topics, not the meeting's", async () => {
  // the reason topics moved onto the session at all: July 9 was Special
  // Incident Reports while the rest of that series was not, and one list on the
  // meeting could not say so.
  const d = base();
  d.sections[0].topics = ["Special incident reports"];
  d.sections[1].topics = ["Medication tracking"];
  d.sections[1].people = [{ name: "Ana Alvarez", title: "ILS Coach", attended: "present" }];
  const { bytes } = await renderAttendanceReport(d, {});
  const t = pageText(await PDFDocument.load(bytes));
  assert.ok(t.includes(hex("Special incident reports")), "first date's topic");
  assert.ok(t.includes(hex("Medication tracking")), "second date's topic");
});

test("a single-date meeting is a list of one section", async () => {
  const d = base();
  d.sections = [{ label: "All-staff meeting", dateLabel: "Wed, Sep 3, 9:00 AM", topics: [],
                  people: [{ name: "Ana Alvarez", title: "ILS Coach", attended: "present" }] }];
  d.noResponse = [];
  const { bytes } = await renderAttendanceReport(d, {});
  const t = pageText(await PDFDocument.load(bytes));
  assert.ok(t.includes(hex("Attendance")), "the attendance heading");
  assert.ok(t.includes(hex("Everyone invited has responded.")), "empty no-response says so");
});

test("a one-date report says everything on page one", async () => {
  // A COVER IS ONLY WORTH A PAGE WHEN THERE IS SOMETHING TO INDEX. With one
  // date there is not, and breaking anyway produced a cover carrying the title
  // and the time, then a second page repeating both before saying anything -
  // a wasted sheet on a document people print. Mánu 2026-09-14: "that info
  // should be on the first page".
  const d = base();
  d.sections = [{
    label: "Field Supervisor Training",
    dateLabel: "Mon, Aug 3, 2026 · 9:00 AM PDT",
    topics: ["Case support billing", "Staff call-outs"],
    people: [{ name: "Ana Alvarez", title: "ILS Coach", attended: "present" }],
  }];
  d.cantAll = [];
  d.noResponse = [];
  const { bytes } = await renderAttendanceReport(d, {});
  const doc = await PDFDocument.load(bytes);
  const first = onePageText(doc, 0);
  assert.ok(first.includes(hex("What was covered")), "the topics are on page one");
  assert.ok(first.includes(hex("Case support billing")), "and so is the first of them");
  assert.ok(first.includes(hex("Attendance")), "so is the roster heading");
  assert.ok(first.includes(hex("Ana Alvarez")), "and the first name on it");

  // and the title is not printed twice on the same sheet
  const title = hex("All-staff meeting");
  const once = first.split(title).length - 1;
  assert.ok(once <= 1, `the meeting title appears ${once} times on page one`);
});
