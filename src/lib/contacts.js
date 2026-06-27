// Team contacts directory - shared constants + helpers. pure (no db).
import { POSITIONS } from "@/lib/positions";

// max length for a staff member's working-hours blurb (employee profile
// field, edited in settings + admin).
export const WORKING_HOURS_MAX = 120;

// side-filter buckets for the directory. built straight from the job-title
// list so filtering follows a person's TITLE (e.g. "IT / Web Developer"),
// not their privilege role. value goes in the URL as ?cat=...; title is the
// position string we match against User.title.
function slugifyTitle(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export const CONTACT_CATEGORIES = POSITIONS.map((p) => ({
  value: slugifyTitle(p),
  label: p,
  title: p,
}));

export function isValidCategory(value) {
  return CONTACT_CATEGORIES.some((c) => c.value === value);
}

// split a full/legal name into first + last(rest).
function splitLegal(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
}

// the name shown everywhere: preferred first/last, falling back to the legal
// first/last for whichever piece isn't set. e.g. preferred first "Manu" + no
// preferred last + legal "Brandon Uribe" -> "Manu Uribe". falls back to email.
export function preferredName(user) {
  if (!user) return "";
  const { first: lf, last: ll } = splitLegal(user.name);
  const f = user.preferredFirstName || lf;
  const l = user.preferredLastName || ll;
  return [f, l].filter(Boolean).join(" ") || user.email || "";
}

// just the first name, for greetings ("Hi, Manu").
export function firstNameOf(user) {
  if (!user) return "";
  return (
    user.preferredFirstName ||
    splitLegal(user.name).first ||
    (user.email ? user.email.split("@")[0] : "")
  );
}

// the full/legal name for records. only shown on the contact detail card +
// admin panel (and gated to admin/management when hidden). returns null when
// there's nothing extra to show beyond the displayed name.
export function legalName(user) {
  const legal = (user?.name || "").trim();
  if (!legal || legal === preferredName(user)) return null;
  return legal;
}

// the job title a category filters on. null = no filter (Everyone).
export function titleForCategory(value) {
  return CONTACT_CATEGORIES.find((c) => c.value === value)?.title ?? null;
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
  "Homeless shelters",
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

// recreational resources - a separate, place-based section with its own portal
// page + overview map (/portal/recreation). kept apart from the community
// services list above so each group gets its own landing + map. add or remove
// a card here; everything else (form, map, approval) follows.
export const RECREATION_CATEGORIES = [
  "Hikes & trails",
  "Parks",
  "Beaches",
  "Lakes & fishing",
  "Gardens & nature centers",
  "Accessible playgrounds",
  "Sports & rec centers",
  "Indoor fun",
];

// every category across both groups - used for validation.
export const ALL_RESOURCE_CATEGORIES = [
  ...RESOURCE_CATEGORIES,
  ...RECREATION_CATEGORIES,
];

// the two top-level resource groups, each with its own page + map.
export const RESOURCE_GROUPS = {
  community: { path: "/portal/resources", categories: RESOURCE_CATEGORIES },
  recreation: { path: "/portal/recreation", categories: RECREATION_CATEGORIES },
};

export function categoriesForGroup(group) {
  return RESOURCE_GROUPS[group]?.categories || RESOURCE_CATEGORIES;
}

// which group a category belongs to. community is the default / catch-all so
// null + any legacy category stays on the community page.
export function groupForCategory(category) {
  return RECREATION_CATEGORIES.includes(category) ? "recreation" : "community";
}

// the portal page a category lives on (for "back to" links + redirects).
export function basePathForCategory(category) {
  return RESOURCE_GROUPS[groupForCategory(category)].path;
}

export function isValidResourceCategory(value) {
  return typeof value === "string" && ALL_RESOURCE_CATEGORIES.includes(value);
}

// per-category form config. each category can declare:
//   description - one-liner shown on the category picker tile
//   subtypes    - finer "Resource type" options (drives that dropdown)
//   blocks      - extra tailored field blocks to show, e.g. "food"
// only the keys that differ from the lean default need to be set. to tailor
// a new category, add its fields here - the form reads this, no new plumbing.
export const CATEGORY_FORMS = {
  Housing: { description: "Transitional and supportive housing, rent help." },
  "Homeless shelters": {
    description: "Emergency, overnight, and temporary shelters and beds.",
    // show this card on the Resources landing even before it has resources.
    pinned: true,
  },
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

  // recreational resources (the "outdoor" block adds fees, terrain,
  // accessibility, and hazards to the form + detail view).
  "Hikes & trails": {
    description: "Trails and nature walks, rated by difficulty and terrain.",
    blocks: ["outdoor", "trails"],
    form: {
      detailsTitle: "Trail details",
      namePlaceholder: "e.g. Holy Jim Falls Trail",
      orgLabel: "Managed by",
      orgPlaceholder: "Park or agency that runs it, e.g. Cleveland National Forest, OC Parks",
      notesPlaceholder: "Shaded creek trail to a small seasonal waterfall; out-and-back",

      locationTitle: "Location & getting there",
      showAddressVaries: false,
      addressLabel: "Trailhead address or cross-streets",
      addressPlaceholder: "Nearest cross-streets, if there's no street address",
      addressRequired: false,
      cityRequired: false,
      showServiceArea: false,
      phoneLabel: "Ranger station / park office phone",
      phonePlaceholder: "For trail conditions or closures",
      phoneRequired: false,
      showEmail: false,
      showWebsite: false,
      showAppointmentLink: false,
      showContactInstructions: false,
      showParking: true,

      schedule: "simple",
      hoursLabel: "Hours / best time to go",
      hoursPlaceholder:
        "Open sunrise to sunset daily; go early to beat the heat and parking",

      showEligibility: false,

      recreation: {
        title: "The hike",
        hint: "What to expect on the trail. Helps staff judge fit, accessibility, and safety.",
        entryFee: false,
        entranceFee: true,
        payment: true,
        time: true,
        elevation: true,
        amenities: true,
      },
    },
  },
  Parks: {
    description: "Community and regional parks, picnic and BBQ areas, open space.",
    blocks: ["outdoor"],
  },
  Beaches: {
    description: "Beaches and shoreline spots, with access and accessibility notes.",
    blocks: ["outdoor"],
  },
  "Lakes & fishing": {
    description: "Lakes, ponds, and piers for fishing, boating, and waterside time.",
    blocks: ["outdoor"],
  },
  "Gardens & nature centers": {
    description: "Botanical gardens, arboretums, and nature/interpretive centers.",
    blocks: ["outdoor"],
  },
  "Accessible playgrounds": {
    description: "Inclusive, all-abilities play areas.",
    blocks: ["outdoor"],
  },
  "Sports & rec centers": {
    description: "Pools, courts, gyms, and adaptive sports programs.",
    blocks: ["outdoor"],
  },
  "Indoor fun": {
    description: "Bowling, arcades, and movies, good for hot or rainy days.",
    blocks: ["outdoor"],
  },
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

// categories that always show as a card on the Resources landing, even with
// zero resources yet (so a new section is visible before it's populated).
export function pinnedCategories() {
  return RESOURCE_CATEGORIES.filter((c) => CATEGORY_FORMS[c]?.pinned);
}

// per-category add/edit form shape. the defaults match the original
// community-services (food-bank-era) form; a category tailors its own form by
// setting a `form` object in CATEGORY_FORMS that overrides only what differs.
// the recreation sub-block (`rec`) is merged separately for the same reason.
const DEFAULT_FORM = {
  detailsTitle: "Resource details",
  namePlaceholder: "e.g. Anaheim Community Food Pantry",
  orgLabel: "Organization name",
  orgPlaceholder: "If different from the name above",
  notesLabel: "Short description",
  notesPlaceholder: "What they do, who to ask for, anything helpful.",

  locationTitle: "Location and contact",
  showAddressVaries: true,
  addressLabel: "Street address",
  addressPlaceholder: "123 Main St (paste a full address and it'll split below)",
  addressRequired: true,
  cityRequired: true,
  showServiceArea: true,
  showPhone: true,
  phoneLabel: "Phone",
  phonePlaceholder: "",
  phoneRequired: true,
  showEmail: true,
  showWebsite: true,
  showAppointmentLink: true,
  showContactInstructions: true,
  showParking: false,

  schedule: "full", // "full" (day/time editor) | "simple" (hours text only) | "none"
  scheduleTitle: "Schedule",
  hoursLabel: "Other schedule notes",
  hoursPlaceholder:
    "Holidays, seasonal changes, or anything the rows above don't capture.",

  showEligibility: true,
};

const DEFAULT_REC = {
  title: "Recreation details",
  hint: "What to expect on a visit. Helps staff plan for accessibility and safety.",
  difficulty: true,
  length: true,
  time: false,
  elevation: false,
  entryFee: true, // legacy free-text "Entrance / parking fee"
  entranceFee: false, // structured dollar amount + payment options
  payment: false,
  terrain: true,
  accessibility: true,
  amenities: false,
  hazards: true,
};

// resolved form config for a category (defaults + the category's overrides).
export function formConfig(category) {
  const f = (CATEGORY_FORMS[category] || {}).form || {};
  return {
    ...DEFAULT_FORM,
    ...f,
    rec: { ...DEFAULT_REC, ...(f.recreation || {}) },
  };
}

// one color per label, so the overview map pins are color-coded by category.
export const CATEGORY_COLORS = {
  Housing: "#2563eb",
  "Homeless shelters": "#7c3aed",
  "Food banks": "#16a34a",
  "Crisis support": "#dc2626",
  "Health & medical": "#0891b2",
  "Mental & behavioral health": "#db2777",
  "Employment & day programs": "#ea580c",
  Transportation: "#ca8a04",
  "Benefits & advocacy": "#4f46e5",
  "Education & training": "#0d9488",
  "Recreation & community": "#65a30d",
  Other: "#64748b",
  // recreational group (own map, so colors just need to differ within it).
  "Hikes & trails": "#15803d",
  Parks: "#84cc16",
  Beaches: "#0ea5e9",
  "Lakes & fishing": "#2563eb",
  "Gardens & nature centers": "#d97706",
  "Accessible playgrounds": "#db2777",
  "Sports & rec centers": "#ea580c",
  "Indoor fun": "#7c3aed",
};

export function categoryColor(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
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

// outdoor / recreation visit details (only shown for the "outdoor" block:
// hikes, parks, beaches, etc.).
export const DIFFICULTY_OPTIONS = ["Easy", "Moderate", "Hard"];

export const TERRAIN_OPTIONS = [
  "Paved path",
  "Dirt trail",
  "Gravel",
  "Sand",
  "Rocky",
  "Steep / hilly",
];

export const ACCESSIBILITY_OPTIONS = [
  "Wheelchair accessible",
  "Stroller friendly",
  "Accessible restrooms",
  "Accessible parking",
  "Benches / rest spots",
  "Shaded areas",
];

export const HAZARD_OPTIONS = [
  "Little shade / heat exposure",
  "Steep drop-offs",
  "Uneven footing",
  "Water / drowning risk",
  "Wildlife",
  "Rattlesnakes",
  "Poison oak",
  "Limited cell service",
  "Good cell reception",
];

// on-site amenities (recreation). multi-select.
export const AMENITY_OPTIONS = [
  "Restrooms",
  "Porta-potties",
  "Drinking water",
  "Picnic tables",
  "Shade",
  "Visitor center",
  "Dogs allowed",
];

// how a fee can be paid (recreation). multi-select.
export const PAYMENT_OPTIONS = [
  "Cash only",
  "Card accepted",
  "Tap to pay",
  "All accepted",
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

// capitalize the first letter of each word, leaving the rest as typed (so
// acronyms / "N." stay intact). used to tidy the street address on save.
export function titleCaseWords(s) {
  if (typeof s !== "string") return s;
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// best-effort split of a pasted/typed full US address into its parts. handles
// the common "street, city, ST zip" and "street, city zip" shapes. pulls out
// whatever it can confidently identify (zip, 2-letter state, city after the
// last comma) and leaves the rest as the street. used by the add/edit form so
// a full address dropped in the street box lands in the right fields.
export function parseUsAddress(raw) {
  if (typeof raw !== "string") return { street: "", city: "", state: "", zip: "" };
  let s = raw.trim().replace(/\s+/g, " ");
  // drop a trailing country (Google place strings end in ", USA").
  s = s.replace(/,?\s*(usa|united states)\.?\s*$/i, "").trim();
  let zip = "";
  let state = "";
  let city = "";
  let street = "";

  const zipM = s.match(/(\d{5}(?:-\d{4})?)\s*$/);
  if (zipM) {
    zip = zipM[1];
    s = s.slice(0, zipM.index).trim().replace(/,\s*$/, "");
  }
  const stM = s.match(/[,\s]([A-Za-z]{2})\s*$/);
  if (stM) {
    state = stM[1].toUpperCase();
    s = s.slice(0, stM.index).trim().replace(/,\s*$/, "");
  }
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    city = parts[parts.length - 1];
    street = parts.slice(0, -1).join(", ");
  } else {
    street = parts[0] || "";
  }
  return { street, city, state, zip };
}

// parse a pasted "lat, lng" coordinate string into { lat, lng }, or null if it
// doesn't look like one. tolerates the formats AllTrails / Google Maps hand you:
// "33.6765, -117.5121", degree symbols, parens, extra spaces. auto-fixes a
// reversed pair (lng, lat) by swapping when the first value can only be a
// longitude. used to set an exact map pin without relying on address geocoding.
export function parseCoords(raw) {
  if (typeof raw !== "string") return null;
  const nums = raw.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  let lat = parseFloat(nums[0]);
  let lng = parseFloat(nums[1]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  // reversed pair: a value past ±90 can't be a latitude, so swap.
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
    [lat, lng] = [lng, lat];
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
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
