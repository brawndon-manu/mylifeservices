// device management helpers. pure (no db).

export const DEVICE_TYPES = [
  { value: "LAPTOP", label: "Laptop" },
  { value: "DESKTOP", label: "Desktop / iMac" },
  { value: "TABLET", label: "Tablet / iPad" },
  { value: "PHONE", label: "Phone / iPhone" },
  { value: "OTHER", label: "Other" },
];

export function deviceTypeLabel(v) {
  return DEVICE_TYPES.find((t) => t.value === v)?.label ?? v;
}
export function isValidDeviceType(v) {
  return DEVICE_TYPES.some((t) => t.value === v);
}

export const DEVICE_STATUSES = [
  { value: "IN_USE", label: "In use", chip: "bg-emerald-100 text-emerald-800" },
  { value: "STORAGE", label: "Storage", chip: "bg-slate-100 text-slate-700" },
  { value: "REPAIR", label: "In repair", chip: "bg-amber-100 text-amber-800" },
  { value: "RETIRED", label: "Retired", chip: "bg-rose-100 text-rose-800" },
];

export function deviceStatusLabel(v) {
  return DEVICE_STATUSES.find((s) => s.value === v)?.label ?? v;
}
export function deviceStatusChip(v) {
  return (
    DEVICE_STATUSES.find((s) => s.value === v)?.chip ??
    "bg-slate-100 text-slate-700"
  );
}
export function isValidDeviceStatus(v) {
  return DEVICE_STATUSES.some((s) => s.value === v);
}

export const DEVICE_NAME_MAX = 80;
export const DEVICE_SERIAL_MAX = 60;
export const DEVICE_ASSIGNED_MAX = 80;
export const DEVICE_NOTES_MAX = 1000;

// "1299.99" (dollars, as typed) -> 129999 (cents). returns null if blank
// or unparseable. caps at a sane max so a typo doesnt overflow.
export function dollarsToCents(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/[$,\s]/g, "");
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

// 129999 -> "$1,299.99"
export function formatCents(cents) {
  if (cents == null) return null;
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// cents -> "1299.99" for prefilling the dollar input on the edit form.
export function centsToInput(cents) {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}
