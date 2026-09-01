// THE RENDERED SURVEY HOLDS TOGETHER for the two shapes that matter: a fully
// answered survey and a completely blank one. The renderer draws unticked
// boxes and ruled blanks for missing answers, so a blank survey is a valid
// document rather than a crash.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { renderSatisfactionPdf } from "../satisfaction-pdf.js";
import { readSurveyForm, GRID_QUESTIONS } from "../satisfaction.js";

const FULL = {
  completedBy: "Other",
  completedByOther: "Grandmother",
  program: "Independent Living Services (ILS)",
  programOther: "",
  date: "2026-09-01",
  grid: GRID_QUESTIONS.map((_, i) => ["Very Satisfied", "Satisfied", "Needs Improvement"][i % 3]),
  choices: ["Yes", "No", "Sometimes", "No"],
  feedback: [
    "Staff are always on time and my son looks forward to his outings every week.",
    "More weekend availability would help our family a lot. ".repeat(20),
    "",
  ],
  overall: "Very Satisfied",
  comments: "Please call in the spring to talk about summer scheduling.",
};

test("a fully answered survey renders as a multi-page document", async () => {
  const { bytes } = await renderSatisfactionPdf({
    clientName: "Acuna, Jacob",
    answers: FULL,
    conductedByName: "Mánu Uribe",
    conductedOn: "09/01/2026",
  });
  assert.equal(String.fromCharCode(...bytes.slice(0, 5)), "%PDF-");
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 2, `expected 2+ pages, got ${doc.getPageCount()}`);
});

test("a blank survey still renders - unticked boxes and ruled lines", async () => {
  const { bytes } = await renderSatisfactionPdf({
    clientName: "Acuna, Jacob",
    answers: readSurveyForm(() => undefined),
    conductedByName: "Mánu Uribe",
    conductedOn: "09/01/2026",
  });
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 2);
});

test("missing answers object entirely does not crash the renderer", async () => {
  const { bytes } = await renderSatisfactionPdf({
    clientName: "Acuna, Jacob",
    answers: null,
    conductedByName: "Mánu Uribe",
    conductedOn: "09/01/2026",
  });
  assert.equal(String.fromCharCode(...bytes.slice(0, 5)), "%PDF-");
});
