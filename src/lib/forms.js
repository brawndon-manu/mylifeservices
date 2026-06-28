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

// turn a raw AcroForm field name into a readable label. the official forms
// already use descriptive names (e.g. "UCI Number", "Injury:"), so this just
// tidies trailing punctuation and clamps very long names.
export function fieldLabel(name) {
  let s = (name || "").trim().replace(/[:\s]+$/, "");
  if (s.length > 90) s = s.slice(0, 90) + "…";
  return s || "Field";
}
