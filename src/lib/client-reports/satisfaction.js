// THE ANNUAL CLIENT / PARENT SATISFACTION SURVEY, 2026-08-31.
//
// Mánu's word document, as data. Every string below is the wording of the PDF
// he provided, verbatim - his instruction was "all the exact same wordings and
// strings", with ONE exception he named: "Client Name (Optional)" drops the
// "(Optional)", because in the portal a survey is always filled from the
// client list and is never anonymous.
//
// The questions are asked on screen and the answers fill the printed form; the
// PDF itself is never a thing anybody types into. This module is the single
// source both sides read - the form renders these questions, the renderer
// prints them - so the screen and the document cannot drift apart.
//
// Pure - no prisma, no pdf - so node tests can hold every string still.

export const SATISFACTION_KIND = "annual-satisfaction";

export const ORG_LINE = "MY LIFE SERVICES, INC.";
export const TITLE = "Annual Client / Parent Satisfaction Survey";

export const CLIENT_NAME_LABEL = "Client Name:";
export const DATE_LABEL = "Date:";

export const COMPLETING_LABEL = "Person Completing Survey:";
export const COMPLETING_OPTIONS = [
  "Client / Individual Served",
  "Parent / Family Member",
  "Conservator / Authorized Representative",
  "Other",
];

export const PROGRAM_LABEL = "Program:";
export const PROGRAM_OPTIONS = ["Independent Living Services (ILS)", "Other"];

export const INTRO = "Please tell us how we are doing.";

// the rating grid: one row per question, one tick in one of three columns
export const RATING_HEAD = ["Very Satisfied", "Satisfied", "Needs Improvement"];
export const QUESTION_HEAD = "Question";
export const GRID_QUESTIONS = [
  "Staff treat me with dignity and respect.",
  "Staff listen to my needs, choices, and preferences.",
  "I have a choice about which staff work with me.",
  "I am comfortable with the staff who provide my services.",
  "If I have a concern about a staff member, I know I can ask for a change.",
  "Services are provided on the days and times that I want or need them.",
  "I have input into my service schedule and can request changes when needed.",
  "Services are helping me work toward my goals.",
  "Staff provide reliable and consistent support.",
  "Staff communicate well with me and/or my family.",
  "I am involved in decisions about my services and goals.",
  "I feel safe and comfortable with the services I receive.",
  "Overall, I am satisfied with services from My Life Services.",
];

export const CHOICES_HEADING = "Your Choices";
export const CHOICE_QUESTIONS = [
  { q: "Are you satisfied with your current staff?", options: ["Yes", "No", "Sometimes"] },
  {
    q: "Would you like to request a different staff member or discuss your staff choices?",
    options: ["Yes", "No"],
  },
  {
    q: "Are you satisfied with the days and times you receive services?",
    options: ["Yes", "No", "Sometimes"],
  },
  { q: "Would you like to change your service schedule?", options: ["Yes", "No"] },
];

export const FEEDBACK_HEADING = "Your Feedback";
export const FEEDBACK_QUESTIONS = [
  "What do you like most about your services or staff?",
  "Is there anything you would like us to improve or do differently?",
  "Are there any new goals, needs, activities, or areas where you would like more support?",
];

export const OVERALL_HEADING = "Overall Satisfaction";
export const OVERALL_OPTIONS = ["Very Satisfied", "Satisfied", "Needs Improvement", "Not Satisfied"];

export const COMMENTS_LABEL = "Additional Comments:";

export const THANKS =
  "Thank you for your feedback. Your input helps My Life Services, Inc. improve services and make sure services reflect each individual's choices, preferences, goals, schedule, and support needs.";

// ---------------------------------------------------------------- the answers
//
// What one filled survey stores. Option answers are kept as the literal option
// strings ("Very Satisfied"), not as codes: the row has to still make sense
// read raw in the database, and the cross-report reporting Mánu wants later
// should not need a decoder ring per report kind.

const pick = (value, options) => (options.includes(value) ? value : null);
const clean = (value, max) =>
  String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, max);

// `get` is formData.get (or any (name) => value). Returns the answers object
// that goes in ClientReport.answers. NOTHING IS REQUIRED: a person on the
// phone may decline any question, exactly as they may skip lines on paper, and
// an unanswered question prints as unticked boxes rather than blocking the
// whole survey.
export function readSurveyForm(get) {
  const g = (name) => get(name);
  return {
    completedBy: pick(g("completedBy"), COMPLETING_OPTIONS),
    completedByOther: clean(g("completedByOther"), 200),
    program: pick(g("program"), PROGRAM_OPTIONS),
    programOther: clean(g("programOther"), 200),
    // the DatePicker's hidden input, YYYY-MM-DD
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(g("date") || "")) ? String(g("date")) : null,
    grid: GRID_QUESTIONS.map((_, i) => pick(g(`q${i + 1}`), RATING_HEAD)),
    choices: CHOICE_QUESTIONS.map((c, i) => pick(g(`c${i + 1}`), c.options)),
    feedback: FEEDBACK_QUESTIONS.map((_, i) => clean(g(`f${i + 1}`), 4000)),
    overall: pick(g("overall"), OVERALL_OPTIONS),
    comments: clean(g("comments"), 4000),
  };
}

// how many of the survey's answerable questions carry an answer - the list
// page's "18 of 22 answered". Free-text counts when anything was written.
export function answeredCount(answers) {
  const a = answers || {};
  let n = 0;
  for (const v of a.grid || []) if (v) n++;
  for (const v of a.choices || []) if (v) n++;
  for (const v of a.feedback || []) if (v) n++;
  if (a.overall) n++;
  return n;
}

export const ANSWERABLE_COUNT =
  GRID_QUESTIONS.length + CHOICE_QUESTIONS.length + FEEDBACK_QUESTIONS.length + 1;

// HOW MANY SURVEYS EACH COMPLETING PERSON MAY FILE, per client. Mánu
// 2026-08-31: "just one allowed each per option ... maybe 2 only for other.
// so it caps it at once each." The cap sits on the completing person, so the
// client and a parent can each answer - but never two surveys claiming the
// same voice.
export const COMPLETING_CAPS = {
  "Client / Individual Served": 1,
  "Parent / Family Member": 1,
  "Conservator / Authorized Representative": 1,
  Other: 2,
};

// surveys already on file per completing person, from stored answers
export function completingTally(answersList) {
  const tally = {};
  for (const a of answersList || []) {
    const k = a?.completedBy;
    if (k) tally[k] = (tally[k] || 0) + 1;
  }
  return tally;
}

// whether this option may still file a survey for the client
export function completingOptionOpen(option, tally) {
  return (tally?.[option] || 0) < (COMPLETING_CAPS[option] || 0);
}

// WHICH VOICE ANSWERED. One client is surveyed more than once by different
// people - the client themself, a parent, a conservator - and this is the
// fact that tells those surveys apart on the list. "Other" carries its
// write-in so the label still says who.
export function completedByLabel(answers) {
  const a = answers || {};
  if (!a.completedBy) return null;
  if (a.completedBy === "Other")
    return a.completedByOther ? `Other: ${a.completedByOther}` : "Other";
  return a.completedBy;
}

// "2026-09-01" -> "09/01/2026", the spelling the printed form carries. A
// survey with no date on it prints the day it was conducted instead, which the
// caller passes.
export function fmtSurveyDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${m[2]}/${m[3]}/${m[1]}` : null;
}
