// WHERE A PERSON HAS GOT TO, on a batch two people are working through together.
//
// Mánu 2026-08-13: "I want it so me and Gabe can see who has contacted who. And,
// also, if we've messaged them, if they got back to us, so we can have record
// for ourselves to keep on contacting people."
//
// The mark used to be a single red flag - pressed or not - which could say "I
// have looked at this" and nothing else. Three states say the thing the job
// actually turns on:
//
//   contacted    the message went out
//   no-response  it went out and nothing came back. THE ONE THAT MEANS CHASE.
//   verified     they fixed it in QSP and somebody checked
//
// "Contacted" and "No response" are deliberately separate rather than one field
// with a date on it. They are different facts about the same message, and only
// the second is a to-do.
//
// NOT STARTED IS THE ABSENCE OF A ROW, not a fourth status. A row that exists
// with nothing on it would be a second way of saying the same thing, and the two
// would drift.
//
// Tailwind v4 compiles only what it can SEE, so every class here is a full
// literal string. The violations group once shipped with a plain white border
// for exactly this reason.
export const CHECK_STATUSES = [
  {
    key: "contacted",
    label: "Contacted",
    short: "Contacted",
    // sky, and deliberately not green: a message sent is not a job done, and a
    // green tick here would read as one.
    chip: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-300",
    ring: "ring-sky-400",
    dot: "bg-sky-500",
  },
  {
    key: "no-response",
    // Mánu's own words on 2026-08-13, and better than "No response": it says
    // the message went and we are still waiting, which is a state somebody is
    // in rather than a thing they failed to do.
    label: "Waiting response",
    short: "Waiting",
    // amber, because this is the only one of the three that is asking somebody
    // to do something
    chip: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-300",
    ring: "ring-amber-400",
    dot: "bg-amber-500",
  },
  {
    key: "verified",
    label: "Verified on QSP",
    short: "Verified",
    chip: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300",
    ring: "ring-emerald-400",
    dot: "bg-emerald-500",
  },
];

// HOW the message went out, asked only on "contacted".
//
// Mánu 2026-08-13: "under contacted. We can choose phone or email. So it can
// show the little phone or email icon with whoever chose contacted."
//
// Two, because those are the two ways anybody here actually reaches somebody,
// and a free-text note would be a field nobody fills in consistently. It hangs
// off `contacted` alone: "waiting" already implies whatever the contact was, and
// "verified" is about QSP rather than about a message.
export const CONTACT_VIAS = [
  { key: "phone", label: "Phone", short: "by phone" },
  { key: "email", label: "Email", short: "by email" },
];

export const CONTACT_VIA_KEYS = CONTACT_VIAS.map((v) => v.key);

export function contactVia(key) {
  return CONTACT_VIAS.find((v) => v.key === key) || null;
}

export function isContactVia(key) {
  return CONTACT_VIA_KEYS.includes(key);
}

// only "contacted" asks how. Kept as a predicate rather than checked inline at
// each of the three call sites, so the day a fourth state wants it too there is
// one line to change.
export function asksHow(statusKey) {
  return statusKey === "contacted";
}

// WHAT YOU CAN ACTUALLY PRESS, which is not the same list as the states.
//
// Mánu 2026-08-13: "When someone puts contacted, it should automatically say
// waiting response. You shouldn't have to manually put waiting response."
//
// He is right, and the reason is that CONTACTING IS A THING YOU DO and WAITING
// IS A STATE YOU ARE THEN IN. They were both offered as states, so marking
// somebody meant two clicks to describe one event, and the second click was one
// nobody should have to think about: of course you are waiting, you just
// messaged them.
//
// So the picker offers the two ACTIONS, and `statusAfter` says what each leaves
// the person in. The log still records "contacted", because that is the event
// that happened and the record of it is the point.
export const MARK_OPTIONS = ["contacted", "verified"];

// IS THIS SOMETHING SOMEBODY DID? The log records EVENTS, and "waiting
// response" is not one - it is the state contacting them leaves them in. Mánu
// 2026-08-13: "We don't need the log of waiting for response. This is the same
// thing as contacted."
//
// So it gates both ends: nothing derived is written to the log, and anything
// already there from when "waiting" was a button is skipped on the way out.
export function isMarkAction(key) {
  return MARK_OPTIONS.includes(key);
}

// what a mark LEAVES somebody in. Contacting puts them in waiting; everything
// else is its own state.
export function statusAfter(key) {
  return key === "contacted" ? "no-response" : key;
}

// the states somebody can actually BE in, which is what the summary groups by.
// "contacted" is absent on purpose - nobody is ever left in it, so a heading for
// it would count zero for ever and read as a screen that is broken.
export const STANDING_STATUSES = CHECK_STATUSES.filter((s) => s.key !== "contacted");

export const CHECK_STATUS_KEYS = CHECK_STATUSES.map((s) => s.key);

export function checkStatus(key) {
  return CHECK_STATUSES.find((s) => s.key === key) || null;
}

export function isCheckStatus(key) {
  return CHECK_STATUS_KEYS.includes(key);
}
