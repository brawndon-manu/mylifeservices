// client caseload helpers. pure (no db). clients are stored as first
// name + last initial only for privacy/data-minimization.

export const CLIENT_FIRST_MAX = 40;
export const CLIENT_NOTES_MAX = 500;
export const WORKING_HOURS_MAX = 120;

// "Robert" + "O" -> "Robert O."
export function clientDisplayName(client) {
  if (!client) return "";
  const li = client.lastInitial ? `${client.lastInitial}.` : "";
  return `${client.firstName} ${li}`.trim();
}

// trim + strip control chars + cap. returns null if empty.
export function cleanFirstName(raw) {
  if (typeof raw !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const stripped = raw.replace(/[\x00-\x1F\x7F]/g, "").trim();
  if (!stripped) return null;
  return stripped.slice(0, CLIENT_FIRST_MAX);
}

// take the first letter, uppercase. returns null if none.
export function cleanLastInitial(raw) {
  if (typeof raw !== "string") return null;
  const letter = raw.trim().replace(/[^A-Za-z]/g, "").charAt(0);
  if (!letter) return null;
  return letter.toUpperCase();
}
