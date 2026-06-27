// shared list of MLS job positions for the user invite + edit forms.
// kept here so both forms stay in sync.
//
// a person can hold MORE THAN ONE position (e.g. "Independent Living
// Instructor / Day Program"). positions are stored in the single
// User.title string, joined with " / " - display code shows the string
// as-is, no schema change needed.
//
// note: these are job TITLES, separate from privilege roles (Staff,
// Supervisor, Manager, Admin, etc.). "Super" is a role, not a position,
// so it doesn't belong here.
export const POSITIONS = [
  "Owner / Director",
  "Program Manager",
  "HR Administrator",
  "Field Supervisor",
  "Quality Assurance Specialist",
  "Independent Living Instructor",
  "Day Program",
  "Resources Specialist",
  "IT / Web Developer",
];

// separator used to join multiple positions into the title string. none
// of our position names contain this, so we can split on it cleanly.
export const POSITION_SEP = " / ";

// per-position max + overall title cap.
export const TITLE_MAX_LEN = 120;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// split an existing title back into { selected, custom }:
//   selected = the preset positions that are checked (in canonical order)
//   custom   = any leftover parts that arent presets (free text)
// note: two presets ("IT / Web Developer", "Owner / Director") themselves
// contain the " / " separator, so we cant just split on it. instead we match
// each preset as a whole delimited segment (longest first) and strip it out,
// leaving whatever's left as custom.
export function parseTitle(title) {
  if (!title || typeof title !== "string") {
    return { selected: [], custom: "" };
  }
  let rest = title.trim();
  const found = [];
  const sep = escapeRe(POSITION_SEP);
  for (const p of [...POSITIONS].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(^|${sep})${escapeRe(p)}(${sep}|$)`);
    const m = rest.match(re);
    if (!m) continue;
    found.push(p);
    const join = m[1] && m[2] ? POSITION_SEP : "";
    rest = (rest.slice(0, m.index) + join + rest.slice(m.index + m[0].length)).trim();
  }
  const custom = rest.replace(/^\s*\/\s*|\s*\/\s*$/g, "").trim();
  return { selected: POSITIONS.filter((p) => found.includes(p)), custom };
}

// turn the form fields into the final title string (or null). takes the
// array of checked preset positions + the optional custom text, dedupes,
// joins with " / ", caps length.
export function resolveTitle(selectedValues, customText) {
  const parts = [];
  const seen = new Set();

  const list = Array.isArray(selectedValues)
    ? selectedValues
    : selectedValues
      ? [selectedValues]
      : [];
  for (const v of list) {
    if (POSITIONS.includes(v) && !seen.has(v)) {
      seen.add(v);
      parts.push(v);
    }
  }

  if (typeof customText === "string") {
    const trimmed = customText.trim();
    if (trimmed && !seen.has(trimmed)) {
      parts.push(trimmed);
    }
  }

  if (parts.length === 0) return null;
  return parts.join(POSITION_SEP).slice(0, TITLE_MAX_LEN);
}
