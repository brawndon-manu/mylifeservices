// shared list of MLS job positions for the user invite + edit forms.
// kept here so both forms stay in sync. excludes the one-off real-world
// constants (Owner/Director, Program Manager, IT roles) since those rows
// dont change and dont need a button.
export const POSITIONS = [
  "Field Supervisor",
  "HR Administrator",
  "Independent Living Instructor",
  "Day Program",
  "Supported Living",
  "Self-Determination",
  "Crisis Support",
  "Attendant",
  "Lead Staff",
  "Case Manager",
  "Resources Specialist",
  "Quality Assurance Specialist",
];

// sentinel values for the radio group. the form sends one of:
//   __none__   -> title becomes null in db
//   __custom__ -> title is taken from the accompanying text input
//   <any POSITIONS string> -> title is that string
export const POSITION_NONE = "__none__";
export const POSITION_CUSTOM = "__custom__";

export const TITLE_MAX_LEN = 60;

// helper: figure out which radio should be pre-selected for an existing
// user. returns one of: POSITION_NONE, POSITION_CUSTOM, or a preset.
export function radioForTitle(title) {
  if (!title) return POSITION_NONE;
  if (POSITIONS.includes(title)) return title;
  return POSITION_CUSTOM;
}

// helper used in server actions to turn form fields into the final
// title string (or null). pass in the radio value + custom text value.
export function resolveTitle(radioValue, customText) {
  if (radioValue === POSITION_NONE) return null;
  if (radioValue === POSITION_CUSTOM) {
    if (typeof customText !== "string") return null;
    const trimmed = customText.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, TITLE_MAX_LEN);
  }
  if (POSITIONS.includes(radioValue)) return radioValue;
  // fallthrough: unknown radio value -> null. server should also reject
  // before getting here, this is just defensive.
  return null;
}
