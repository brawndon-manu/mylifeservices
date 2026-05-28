// single source of truth for the privilege-role system. every page that
// checks "can this user do X?" should call a helper from here instead of
// hardcoding `role === "IT_ADMIN"` checks - that way when we tighten or
// loosen permissions later, we change one file.
//
// kept ESM-pure (no prisma, no db, no upstash). this means proxy.js
// (which runs on the edge runtime) can import from here safely.

// every valid Role value the User.role column accepts. mirrors the enum
// in prisma/schema.prisma. keeping this here so we have a JS-side list
// for validation, dropdowns, etc.
export const ROLES = [
  "IT_ADMIN",
  "ADMIN",
  "MANAGER",
  "HR",
  "SUPERVISOR",
  "STAFF",
];

// human-readable labels for the UI. we keep the underlying enum names
// stable for the db but display friendlier strings.
export const ROLE_LABELS = {
  IT_ADMIN: "IT",
  ADMIN: "Admin",
  MANAGER: "Manager",
  HR: "HR",
  SUPERVISOR: "Supervisor",
  STAFF: "Staff",
};

// short descriptions shown next to each radio button on the invite +
// edit user forms. helps the admin pick the right role.
export const ROLE_DESCRIPTIONS = {
  IT_ADMIN: "Technical admin with full access to the portal and user management.",
  ADMIN: "Top-level oversight. Owner/Director-style role with full management access.",
  MANAGER: "Program management — can manage users + post announcements.",
  HR: "Human resources. Standard access for now (will gain HR-specific tools later).",
  SUPERVISOR: "Field supervisor. Standard access — oversees on-the-ground staff.",
  STAFF: "Standard staff member. Read announcements + access resources.",
};

// the privilege tiers. ELEVATED roles can manage users (invite, edit,
// deactivate) and (later) post announcements. STANDARD roles are
// read-only - they can sign in, see announcements, edit their own
// settings, but cant manage other users.
//
// per current owner spec, IT_ADMIN + ADMIN + MANAGER all have the same
// permissions. if we ever need to split them (e.g. MANAGER posts
// announcements but cant manage users) we just adjust this set.
const ELEVATED_ROLES = new Set(["IT_ADMIN", "ADMIN", "MANAGER"]);

// returns true if the role has elevated (admin-level) permissions in
// the portal. use this anywhere you'd previously check role === "IT_ADMIN".
export function isElevated(role) {
  return ELEVATED_ROLES.has(role);
}

// MODERATOR tier - can delete other peoples Hub posts/comments. broader
// than ELEVATED because HR is included (they need to moderate the staff
// feed even if they cant manage user accounts).
const MODERATOR_ROLES = new Set(["IT_ADMIN", "ADMIN", "MANAGER", "HR"]);

export function isModerator(role) {
  return MODERATOR_ROLES.has(role);
}

// strict IT-only check. use for things only the IT team should touch
// (e.g. triaging the Suggestions & Bugs board) vs. general management.
export function isIT(role) {
  return role === "IT_ADMIN";
}

// supervisor-and-up tier - the roles allowed to view + manage client
// caseloads. broader than ELEVATED because field SUPERVISORs oversee
// direct-support staff and need caseload visibility, even though they
// cant manage user accounts.
const SUPERVISOR_PLUS_ROLES = new Set([
  "IT_ADMIN",
  "ADMIN",
  "MANAGER",
  "SUPERVISOR",
]);

export function isSupervisorPlus(role) {
  return SUPERVISOR_PLUS_ROLES.has(role);
}

// returns true if `role` is a valid Role enum value. use for form
// validation when accepting role from a form submission.
export function isValidRole(role) {
  return typeof role === "string" && ROLES.includes(role);
}
