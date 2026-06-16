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

// length caps for resource fields + phone.
export const PHONE_MAX = 30;
export const RESOURCE_NAME_MAX = 80;
export const RESOURCE_CATEGORY_MAX = 40;
export const RESOURCE_NOTES_MAX = 1000;
export const RESOURCE_URL_MAX = 200;
export const RESOURCE_ADDRESS_MAX = 200;

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
