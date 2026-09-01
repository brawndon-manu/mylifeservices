// THE SURVEY'S OWN WORDS, HELD STILL.
//
// Mánu's rule for the rebuilt PDF: "all the exact same wordings and strings"
// as the form he provided, except "Client Name (Optional)" loses the
// "(Optional)". These tests pin the strings so a later edit cannot quietly
// reword a question a year of answers already hangs off.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SATISFACTION_KIND,
  ORG_LINE,
  TITLE,
  CLIENT_NAME_LABEL,
  COMPLETING_OPTIONS,
  PROGRAM_OPTIONS,
  RATING_HEAD,
  GRID_QUESTIONS,
  CHOICE_QUESTIONS,
  FEEDBACK_QUESTIONS,
  OVERALL_OPTIONS,
  THANKS,
  readSurveyForm,
  answeredCount,
  ANSWERABLE_COUNT,
  completedByLabel,
  COMPLETING_CAPS,
  completingTally,
  completingOptionOpen,
  fmtSurveyDate,
} from "../satisfaction.js";

test("the form's identity strings are verbatim", () => {
  assert.equal(ORG_LINE, "MY LIFE SERVICES, INC.");
  assert.equal(TITLE, "Annual Client / Parent Satisfaction Survey");
  assert.equal(THANKS.startsWith("Thank you for your feedback."), true);
  assert.equal(
    THANKS.endsWith("choices, preferences, goals, schedule, and support needs."),
    true,
  );
});

test("Client Name dropped the (Optional), as instructed", () => {
  assert.equal(CLIENT_NAME_LABEL, "Client Name:");
  assert.equal(CLIENT_NAME_LABEL.includes("Optional"), false);
});

test("thirteen grid questions, worded as the original", () => {
  assert.equal(GRID_QUESTIONS.length, 13);
  assert.equal(GRID_QUESTIONS[0], "Staff treat me with dignity and respect.");
  assert.equal(
    GRID_QUESTIONS[4],
    "If I have a concern about a staff member, I know I can ask for a change.",
  );
  assert.equal(GRID_QUESTIONS[12], "Overall, I am satisfied with services from My Life Services.");
  assert.deepEqual(RATING_HEAD, ["Very Satisfied", "Satisfied", "Needs Improvement"]);
});

test("choices, feedback, and overall carry the original wordings", () => {
  assert.equal(CHOICE_QUESTIONS.length, 4);
  assert.equal(CHOICE_QUESTIONS[0].q, "Are you satisfied with your current staff?");
  assert.deepEqual(CHOICE_QUESTIONS[0].options, ["Yes", "No", "Sometimes"]);
  assert.deepEqual(CHOICE_QUESTIONS[1].options, ["Yes", "No"]);
  assert.equal(FEEDBACK_QUESTIONS.length, 3);
  assert.equal(
    FEEDBACK_QUESTIONS[2],
    "Are there any new goals, needs, activities, or areas where you would like more support?",
  );
  assert.deepEqual(OVERALL_OPTIONS, [
    "Very Satisfied",
    "Satisfied",
    "Needs Improvement",
    "Not Satisfied",
  ]);
  assert.equal(COMPLETING_OPTIONS.length, 4);
  assert.equal(PROGRAM_OPTIONS[0], "Independent Living Services (ILS)");
});

// ---------------------------------------------------------- reading the form

const formOf = (obj) => (name) => obj[name];

test("valid answers are kept as their literal option strings", () => {
  const a = readSurveyForm(
    formOf({
      completedBy: "Parent / Family Member",
      program: "Independent Living Services (ILS)",
      date: "2026-09-01",
      q1: "Very Satisfied",
      q13: "Needs Improvement",
      c1: "Sometimes",
      f2: "  more outings  ",
      overall: "Satisfied",
      comments: "call back in March",
    }),
  );
  assert.equal(a.completedBy, "Parent / Family Member");
  assert.equal(a.date, "2026-09-01");
  assert.equal(a.grid[0], "Very Satisfied");
  assert.equal(a.grid[12], "Needs Improvement");
  assert.equal(a.grid[5], null);
  assert.equal(a.choices[0], "Sometimes");
  assert.equal(a.feedback[1], "more outings");
  assert.equal(a.overall, "Satisfied");
  assert.equal(a.comments, "call back in March");
});

test("an answer outside the printed options is dropped, not stored", () => {
  const a = readSurveyForm(
    formOf({ q1: "AMAZING", c1: "Maybe", overall: "Meh", date: "tomorrow", completedBy: "Robot" }),
  );
  assert.equal(a.grid[0], null);
  assert.equal(a.choices[0], null);
  assert.equal(a.overall, null);
  assert.equal(a.date, null);
  assert.equal(a.completedBy, null);
});

test("nothing is required - an empty form is a stored survey of blanks", () => {
  const a = readSurveyForm(formOf({}));
  assert.equal(answeredCount(a), 0);
  assert.equal(a.grid.length, 13);
  assert.equal(a.choices.length, 4);
  assert.equal(a.feedback.length, 3);
});

test("sometimes is only an option where the form prints it", () => {
  // question 2 ("request a different staff member") is Yes / No only
  const a = readSurveyForm(formOf({ c2: "Sometimes", c3: "Sometimes" }));
  assert.equal(a.choices[1], null);
  assert.equal(a.choices[2], "Sometimes");
});

test("free text is capped rather than stored unbounded", () => {
  const a = readSurveyForm(formOf({ f1: "x".repeat(9000), comments: "y".repeat(9000) }));
  assert.equal(a.feedback[0].length, 4000);
  assert.equal(a.comments.length, 4000);
});

test("answered count spans grid, choices, feedback, and overall", () => {
  assert.equal(ANSWERABLE_COUNT, 21);
  const a = readSurveyForm(
    formOf({ q1: "Satisfied", c4: "No", f3: "swim class", overall: "Very Satisfied" }),
  );
  assert.equal(answeredCount(a), 4);
});

test("the survey date prints American, the way the form is read", () => {
  assert.equal(fmtSurveyDate("2026-09-01"), "09/01/2026");
  assert.equal(fmtSurveyDate(""), null);
  assert.equal(fmtSurveyDate("09/01/2026"), null);
});

test("the kind names the report", () => {
  assert.equal(SATISFACTION_KIND, "annual-satisfaction");
});

// ---- one survey per completing person, two for Other -----------------------

test("every completing option carries a cap, and Other alone gets two", () => {
  for (const opt of COMPLETING_OPTIONS) assert.ok(COMPLETING_CAPS[opt] >= 1, opt);
  assert.equal(COMPLETING_CAPS["Other"], 2);
  assert.equal(COMPLETING_CAPS["Client / Individual Served"], 1);
});

test("a filed survey closes its option; the others stay open", () => {
  const tally = completingTally([
    { completedBy: "Client / Individual Served" },
    { completedBy: null }, // an old voiceless survey counts against nothing
  ]);
  assert.equal(completingOptionOpen("Client / Individual Served", tally), false);
  assert.equal(completingOptionOpen("Parent / Family Member", tally), true);
});

test("Other stays open after one and closes after two", () => {
  const one = completingTally([{ completedBy: "Other" }]);
  assert.equal(completingOptionOpen("Other", one), true);
  const two = completingTally([{ completedBy: "Other" }, { completedBy: "Other" }]);
  assert.equal(completingOptionOpen("Other", two), false);
});

test("an option nobody has used is open on an empty tally", () => {
  assert.equal(completingOptionOpen("Parent / Family Member", completingTally([])), true);
  // and an unknown option is never open - a cap it doesn't have can't be under
  assert.equal(completingOptionOpen("Robot", completingTally([])), false);
});

// one client is surveyed by different people; this label is what tells those
// surveys apart on the list
test("who completed it becomes each survey's label", () => {
  assert.equal(
    completedByLabel({ completedBy: "Client / Individual Served" }),
    "Client / Individual Served",
  );
  assert.equal(
    completedByLabel({ completedBy: "Other", completedByOther: "Grandmother" }),
    "Other: Grandmother",
  );
  assert.equal(completedByLabel({ completedBy: "Other" }), "Other");
  assert.equal(completedByLabel({}), null);
  assert.equal(completedByLabel(null), null);
});
