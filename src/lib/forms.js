// Forms library - categories + helpers. pure (no db / no prisma) so it can be
// imported from client + server.

export const FORM_CATEGORIES = [
  "Incident reporting",
  "Consent & releases",
  "HR & onboarding",
  "Client care",
  "Training",
  "Other",
];

export function isValidFormCategory(value) {
  return typeof value === "string" && FORM_CATEGORIES.includes(value);
}

export const FORM_TITLE_MAX = 120;
export const FORM_DESC_MAX = 300;

// which forms can be submitted by email + who reviews them. keyed by a title
// match so a new form drops in without a schema change.
//   - `recipientTitle`: the job title whose holders the submitter picks from for
//     the TO line. looked up live (whole-segment match, so extra titles are fine)
//     so it follows whoever holds that title - no hardcoded names to keep in sync.
//   - `cc`: fixed extra recipients (always copied). the submitter is also cc'd,
//     added server-side.
//   - `from`: overrides the sender for this form.
export const FORM_EMAIL_ROUTES = [
  {
    key: "sir",
    match: (title) => /special incident|\bsir\b/i.test(title || ""),
    // sir reports send from their own address so they're easy to spot + filter
    from: "SIR Reports - My Life Services <SIR@mylifeservicesinc.com>",
    // goes to a Field Supervisor the submitter picks; Jessica is always cc'd.
    recipientTitle: "Field Supervisor",
    cc: [{ name: "Jessica Zermeno", email: "mls.jessicazermeno@gmail.com" }],
  },
];

// the review route for a form title, or null if it can't be submitted by email.
export function formEmailRoute(title) {
  return FORM_EMAIL_ROUTES.find((r) => r.match(title)) || null;
}

// turn a raw AcroForm field name into a readable label. the official forms
// already use descriptive names (e.g. "UCI Number", "Injury:"), so this just
// tidies trailing punctuation and clamps very long names.
export function fieldLabel(name) {
  let s = (name || "").trim().replace(/[:\s]+$/, "");
  if (s.length > 90) s = s.slice(0, 90) + "…";
  return s || "Field";
}
