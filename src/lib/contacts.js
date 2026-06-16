// Team contacts directory - shared constants + helpers. pure (no db).

// max length for a staff member's working-hours blurb (employee profile
// field, edited in settings + admin).
export const WORKING_HOURS_MAX = 120;

// category buckets for the side filter. each maps a set of privilege
// roles to a friendly grouping so "just management" is one click. value
// goes in the URL as ?cat=...
export const CONTACT_CATEGORIES = [
  { value: "management", label: "Management", roles: ["ADMIN", "MANAGER"] },
  { value: "supervisors", label: "Supervisors", roles: ["SUPERVISOR"] },
  { value: "support", label: "Direct Support", roles: ["STAFF"] },
  { value: "hr", label: "HR", roles: ["HR"] },
  { value: "it", label: "IT / Web Developer", roles: ["IT_ADMIN"] },
];

export function isValidCategory(value) {
  return CONTACT_CATEGORIES.some((c) => c.value === value);
}

// which roles belong to a given category value. null = no filter.
export function rolesForCategory(value) {
  return CONTACT_CATEGORIES.find((c) => c.value === value)?.roles ?? null;
}

// the category a given role falls into (for showing a person's bucket).
export function categoryForRole(role) {
  return CONTACT_CATEGORIES.find((c) => c.roles.includes(role))?.label ?? null;
}

// initials for the avatar fallback when someone hasnt set a photo.
export function initialsFor(name, email) {
  const src = (name || email || "").trim();
  if (!src) return "?";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// predefined resource categories for the contacts page. tuned for IDD /
// disability-services work. "Other" is the catch-all. used both for the
// submit dropdown and for grouping resources into collapsible sections.
export const RESOURCE_CATEGORIES = [
  "Housing",
  "Food banks",
  "Crisis support",
  "Health & medical",
  "Mental & behavioral health",
  "Employment & day programs",
  "Transportation",
  "Benefits & advocacy",
  "Education & training",
  "Recreation & community",
  "Other",
];

export function isValidResourceCategory(value) {
  return typeof value === "string" && RESOURCE_CATEGORIES.includes(value);
}

// per-category form config. each category can declare:
//   description - one-liner shown on the category picker tile
//   subtypes    - finer "Resource type" options (drives that dropdown)
//   blocks      - extra tailored field blocks to show, e.g. "food"
// only the keys that differ from the lean default need to be set. to tailor
// a new category, add its fields here - the form reads this, no new plumbing.
export const CATEGORY_FORMS = {
  Housing: { description: "Shelters, transitional and supportive housing, rent help." },
  "Food banks": {
    description: "Pantries, meal sites, grocery and mobile food distribution.",
    subtypes: [
      "Food pantry",
      "Grocery distribution",
      "Prepared meals",
      "Senior groceries",
      "Children's meals",
      "Mobile food distribution",
    ],
    blocks: ["food"],
  },
  "Crisis support": { description: "Hotlines, emergency response, domestic violence help." },
  "Health & medical": { description: "Clinics, dental, vision, prescriptions." },
  "Mental & behavioral health": { description: "Counseling, therapy, substance use support." },
  "Employment & day programs": { description: "Job help, training, day programs." },
  Transportation: { description: "Rides, bus passes, paratransit." },
  "Benefits & advocacy": { description: "Benefits enrollment, legal aid, advocacy." },
  "Education & training": { description: "Classes, tutoring, life skills, ESL." },
  "Recreation & community": { description: "Social, recreation, community events." },
  Other: { description: "Anything that doesn't fit the categories above." },
};

export function categoryConfig(category) {
  return CATEGORY_FORMS[category] || {};
}

export function categoryDescription(category) {
  return categoryConfig(category).description || "";
}

export function subtypesFor(category) {
  return categoryConfig(category).subtypes || [];
}

// does this category show the given tailored field block (e.g. "food")?
export function categoryHasBlock(category, block) {
  return (categoryConfig(category).blocks || []).includes(block);
}

// the categories that get the richer food-specific form. kept as a named
// helper since several places check it; now backed by the block config.
export function isDetailedCategory(category) {
  return categoryHasBlock(category, "food");
}

// populations a resource serves. multi-select, filterable.
export const WHO_IT_SERVES_OPTIONS = [
  "Open to the public",
  "Adults",
  "Families",
  "Children under 18",
  "Seniors",
  "Youth",
  "Property residents only",
];

// recurring-schedule building blocks.
export const DAY_OPTIONS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// short labels for the day chips.
export const DAY_ABBR = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

// one-tap day sets for the schedule editor.
export const DAY_PRESETS = [
  { label: "Weekdays", days: DAY_OPTIONS.slice(0, 5) },
  { label: "Weekend", days: DAY_OPTIONS.slice(5) },
  { label: "Every day", days: [...DAY_OPTIONS] },
];

export const FREQUENCY_OPTIONS = [
  "Weekly",
  "First week",
  "Second week",
  "Third week",
  "Fourth week",
  "First and third",
  "Second and fourth",
  "Monthly",
];

// food-specific visit details (only shown for detailed categories).
export const DISTRIBUTION_METHODS = [
  "Walk-up",
  "Drive-through",
  "Indoor pickup",
  "Home delivery",
  "Sit-down meal",
];

export const FOOD_SELECTION_OPTIONS = [
  "Prepacked",
  "Full choice",
  "Limited choice",
  "Unknown",
];

export const SPECIAL_INSTRUCTIONS_OPTIONS = [
  "Bring bags or boxes",
  "Enter through a particular entrance",
  "Arrive early",
  "Available while supplies last",
];

// operational status (is the place running). enum values + friendly labels.
export const OP_STATUSES = [
  "ACTIVE",
  "TEMPORARILY_UNAVAILABLE",
  "NEEDS_VERIFICATION",
  "CLOSED",
];

export const OP_STATUS_LABELS = {
  ACTIVE: "Active",
  TEMPORARILY_UNAVAILABLE: "Temporarily unavailable",
  NEEDS_VERIFICATION: "Needs verification",
  CLOSED: "Closed",
};

export function isValidOpStatus(value) {
  return typeof value === "string" && OP_STATUSES.includes(value);
}

// keep only the values that are in the allowed list (for multi-selects we
// build from checkboxes / fixed option sets). dedupes + caps the count.
export function cleanFromList(values, allowed, max = 20) {
  const set = new Set(allowed);
  const arr = Array.isArray(values) ? values : values != null ? [values] : [];
  const out = [];
  for (const v of arr) {
    if (set.has(v) && !out.includes(v)) out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

// schedule times are stored 24h ("09:00", "13:30") - the native <input
// type="time"> pickers in the form produce that. to24h coerces loose input
// (e.g. an import passing "9am" or "1:00 PM") into 24h, returning "" if it
// can't parse. blank in -> blank out.
export function to24h(raw) {
  if (typeof raw !== "string") return "";
  const s = raw.trim();
  if (!s) return "";
  const mer = /([ap])\.?\s*m\.?/i.exec(s);
  const ampm = mer ? mer[1].toLowerCase() : null;
  const m = /(\d{1,2}):?(\d{2})?/.exec(s);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (isNaN(h) || h > 23 || min > 59) return "";
  if (ampm === "p" && h < 12) h += 12;
  if (ampm === "a" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// "09:00" (24h) -> "9:00 AM" for display.
export function to12h(hhmm) {
  if (typeof hhmm !== "string") return "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm.trim();
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = h < 12 ? "AM" : "PM";
  h %= 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${ampm}`;
}

// normalize the schedule rows coming off the form into a clean array of
// { days, frequency, start, end }. each row can cover several days that
// share the same hours. drops blank rows; days are stored in week order and
// times are stored 24h. tolerates a legacy single `day` field.
export function cleanSchedule(rows) {
  if (!Array.isArray(rows)) return [];
  const freqs = new Set(FREQUENCY_OPTIONS);
  const out = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const raw = Array.isArray(r.days) ? r.days : r.day ? [r.day] : [];
    // keep valid days in canonical week order, no dupes.
    const days = DAY_OPTIONS.filter((d) => raw.includes(d));
    const frequency = freqs.has(r.frequency) ? r.frequency : null;
    if (!days.length) continue;
    out.push({ days, frequency, start: to24h(r.start), end: to24h(r.end) });
    if (out.length >= 14) break;
  }
  return out;
}

// collapse a list of full day names into a compact label, e.g.
// ["Monday".."Friday"] -> "Mon–Fri", ["Monday","Wednesday"] -> "Mon, Wed".
export function formatDays(days) {
  const idx = (days || [])
    .map((d) => DAY_OPTIONS.indexOf(d))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  if (!idx.length) return "";
  const runs = [];
  let start = idx[0];
  let prev = idx[0];
  for (let k = 1; k < idx.length; k++) {
    if (idx[k] === prev + 1) prev = idx[k];
    else {
      runs.push([start, prev]);
      start = idx[k];
      prev = idx[k];
    }
  }
  runs.push([start, prev]);
  const abbr = (i) => DAY_ABBR[DAY_OPTIONS[i]];
  return runs
    .map(([a, b]) => (a === b ? abbr(a) : `${abbr(a)}–${abbr(b)}`))
    .join(", ");
}

// turn one schedule row into a short human string, e.g.
// "Mon–Fri, 9:00 AM–5:00 PM" or "Second and fourth Sat, 10:00 AM–1:00 PM".
export function formatScheduleRow(row) {
  if (!row) return "";
  const days = Array.isArray(row.days) ? row.days : row.day ? [row.day] : [];
  const dayLabel = formatDays(days);
  if (!dayLabel) return "";
  const when =
    row.frequency && row.frequency !== "Weekly"
      ? `${row.frequency} ${dayLabel}`
      : dayLabel;
  const time =
    row.start && row.end
      ? `${to12h(row.start)}–${to12h(row.end)}`
      : row.start
        ? to12h(row.start)
        : "";
  return time ? `${when}, ${time}` : when;
}

// length caps for resource fields + phone.
export const PHONE_MAX = 30;
export const RESOURCE_NAME_MAX = 80;
export const RESOURCE_CATEGORY_MAX = 40;
export const RESOURCE_NOTES_MAX = 1000;
export const RESOURCE_URL_MAX = 200;
export const RESOURCE_ADDRESS_MAX = 200;
export const RESOURCE_CITY_MAX = 60;
export const RESOURCE_HOURS_MAX = 800;

// light phone cleaner: keep digits, spaces, and common punctuation,
// trim + cap length. we store what the user typed, no strict format.
// used for resource (org) phone numbers which may have extensions etc.
export function cleanPhone(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // allow digits, spaces, + ( ) - . and x (extensions)
  const cleaned = trimmed.replace(/[^\d\s+().\-x]/gi, "");
  if (!cleaned) return null;
  return cleaned.slice(0, PHONE_MAX);
}

// normalize a person's phone into a consistent display format:
//   10 digits        -> (xxx) xxx-xxxx
//   11 digits w/ 1    -> +1 (xxx) xxx-xxxx
//   leading +/country -> +CC (xxx) xxx-xxxx
// anything we cant confidently parse is returned trimmed as-is so we
// never lose what they typed.
export function formatUSPhone(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hadPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.length === 10) {
    return hadPlus
      ? `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
      : `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    const d = digits.slice(1);
    return `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  if (digits.length > 10) {
    // international: country code is whatever's before the last 10 digits
    const cc = digits.slice(0, digits.length - 10);
    const d = digits.slice(-10);
    return `+${cc} (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  // partial / unusual - keep it as typed
  return trimmed.slice(0, PHONE_MAX);
}

// live "as you type" formatter for phone inputs. progressively builds
// (xxx) xxx-xxxx as digits come in, so the user sees the parens + dash
// appear while typing. caps at a US 10-digit number (drops a leading 1
// if they type the country code). returns "" for no digits so the field
// can start empty. formatUSPhone above is still the source of truth on
// save - this is purely a typing nicety.
export function formatPhoneLive(raw) {
  if (typeof raw !== "string") return "";
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") d = d.slice(1); // drop country code
  d = d.slice(0, 10);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
