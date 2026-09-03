import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFArray, decodePDFRawStream } from "pdf-lib";
import { renderAttendanceReport } from "../meeting-attendance-pdf.js";

// the attendance PDF - Mánu 2026-09-03. Pins that the print carries the
// board's own labels (Present / Absent / Unmarked, Can't make it, No
// response), that roll call only claims to exist once marks do, and that an
// empty section says so instead of vanishing.

function pageText(doc) {
  let out = "";
  for (const page of doc.getPages()) {
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
  single: null,
  groups: [
    {
      heading: null,
      sessions: [
        {
          label: "Session 1",
          dateLabel: "Wed, Sep 3, 9:00 AM",
          people: [
            { name: "Ana Alvarez", title: "ILS Coach", attended: "present" },
            // legal name leads; the preferred name rides beside it
            { name: "Ruth Brown", preferred: "Angel Brown", title: "DSP", attended: "absent" },
          ],
        },
        { label: "Session 2", dateLabel: "Wed, Sep 3, 8:00 PM", people: [] },
      ],
      cant: [],
    },
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
  assert.equal(doc.getPages().length, 4, "four sections, four pages");

  assert.ok(t.includes(hex("Meeting Attendance")), "document title");
  assert.ok(t.includes(hex("All-staff meeting")), "meeting title");
  assert.ok(t.includes(hex("Mandatory")), "mandatory rides the subtitle");
  assert.ok(t.includes(hex("Responded 4 of 5 invited (80%)")), "headline");
  assert.ok(t.includes(hex("Session 1 · Wed, Sep 3, 9:00 AM")), "session heading");
  assert.ok(t.includes(hex("Ana Alvarez")) && t.includes(hex("Present")), "roll call prints");
  assert.ok(t.includes(hex("Absent")), "absent prints");
  assert.ok(
    t.includes(hex("Ruth Brown")) && t.includes(hex("Angel Brown")),
    "the legal name and the preferred name both print",
  );
  assert.ok(t.includes(hex("No one picked this session.")), "empty session says so");
  assert.ok(t.includes(hex("Can't make it")) && t.includes(hex("Working a shift")), "reasons print");
  assert.ok(t.includes(hex("No response")) && t.includes(hex("Dan Diaz")), "non-responders print");
  assert.ok(t.includes(hex("Prepared 9/3/2026")), "prepared date in the footer");
});

test("before any marks the report does not claim a roll call", async () => {
  const d = base();
  d.stats.showRollCall = false;
  d.stats.present = 0;
  d.stats.absent = 0;
  d.groups[0].sessions[0].people = d.groups[0].sessions[0].people.map((p) => ({
    ...p,
    attended: null,
  }));
  const { bytes } = await renderAttendanceReport(d, {});
  const t = pageText(await PDFDocument.load(bytes));
  assert.ok(!t.includes(hex("Present 2")), "no present stat");
  assert.ok(t.includes(hex("Unmarked")), "people read Unmarked, not Present");
  assert.ok(
    t.includes(hex("Roll call has not been recorded for this meeting yet.")),
    "the note says the roll call is still to come",
  );
});

test("a series label rides each session's heading", async () => {
  const d = base();
  d.groups[0].heading = "Week 1";
  const { bytes } = await renderAttendanceReport(d, {});
  const t = pageText(await PDFDocument.load(bytes));
  assert.ok(t.includes(hex("Week 1 · Session 1 · Wed, Sep 3, 9:00 AM")), "prefixed heading");
});

test("a single-session meeting prints one Attending list", async () => {
  const d = base();
  d.groups = [];
  d.single = [{ name: "Ana Alvarez", title: "ILS Coach", attended: "present" }];
  d.noResponse = [];
  const { bytes } = await renderAttendanceReport(d, {});
  const t = pageText(await PDFDocument.load(bytes));
  assert.ok(t.includes(hex("Attending")), "attending section");
  assert.ok(t.includes(hex("Everyone invited has responded.")), "empty no-response says so");
});
