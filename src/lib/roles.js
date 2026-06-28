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
  "SUPER",
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
  SUPER: "Super",
  IT_ADMIN: "IT",
  ADMIN: "Admin",
  MANAGER: "Manager",
  HR: "HR",
  SUPERVISOR: "Supervisor",
  STAFF: "Staff",
};

// tailwind classes for a role badge/chip. SUPER stands out in red; every
// other role uses the standard sky-blue chip. use roleBadgeClass(role)
// anywhere a role chip is rendered so SUPER is visually distinct.
export function roleBadgeClass(role) {
  return role === "SUPER"
    ? "bg-rose-100 text-rose-700"
    : "bg-sky-100 text-brand";
}

// short descriptions shown next to each radio button on the invite +
// edit user forms. helps the admin pick the right role.
export const ROLE_DESCRIPTIONS = {
  SUPER: "Superuser with full access to everything, including device management. IT-only, top-level.",
  IT_ADMIN: "Technical admin with full access to the portal and user management.",
  ADMIN: "Top-level oversight. Owner/Director-style role with full management access.",
  MANAGER: "Program management. Can manage users + post announcements.",
  HR: "Human resources. Standard access for now (will gain HR-specific tools later).",
  SUPERVISOR: "Field supervisor. Standard access; oversees on-the-ground staff.",
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
// the top superuser role. has every privilege below - included in all
// the permission sets so a single check covers it.
export function isSuper(role) {
  return role === "SUPER";
}

// the oversight tier - HR, Manager, Admin, IT, Super. these can manage
// users, edit positions, moderate + approve content, and view the device
// log. (HR + Manager can't assign the powerful roles or invite new
// users - see canAssignRole + isSuper.)
const ELEVATED_ROLES = new Set(["SUPER", "IT_ADMIN", "ADMIN", "MANAGER", "HR"]);

// returns true if the role has elevated (admin-level) permissions in
// the portal. use this anywhere you'd previously check role === "IT_ADMIN".
export function isElevated(role) {
  return ELEVATED_ROLES.has(role);
}

// MODERATOR tier - can delete other peoples Hub posts/comments. broader
// than ELEVATED because HR is included (they need to moderate the staff
// feed even if they cant manage user accounts).
const MODERATOR_ROLES = new Set(["SUPER", "IT_ADMIN", "ADMIN", "MANAGER", "HR"]);

export function isModerator(role) {
  return MODERATOR_ROLES.has(role);
}

// IT-tier check. true for the IT team AND superusers (who have all
// access). use for things only IT should touch (Suggestions & Bugs
// discard, device management, assigning the SUPER role).
export function isIT(role) {
  return role === "IT_ADMIN" || role === "SUPER";
}

// "Admin and up" - ADMIN, IT_ADMIN, SUPER. these can assign the powerful
// roles (Admin/IT) and add/edit/delete devices. HR + Manager cannot.
export function isAdminUp(role) {
  return role === "ADMIN" || isIT(role);
}

// "Manager and up" - MANAGER, ADMIN, IT_ADMIN, SUPER. the oversight tier minus
// HR. used for things HR shouldn't touch (e.g. editing a user's hire date).
const MANAGER_UP_ROLES = new Set(["MANAGER", "ADMIN", "IT_ADMIN", "SUPER"]);
export function isManagerUp(role) {
  return MANAGER_UP_ROLES.has(role);
}

// "Supervisor and up" - everyone EXCEPT plain Staff (SUPERVISOR, HR, MANAGER,
// ADMIN, IT_ADMIN, SUPER). used for posting Announcements: leads broadcast,
// staff read + comment + react.
const SUPERVISOR_UP_ROLES = new Set([
  "SUPER",
  "IT_ADMIN",
  "ADMIN",
  "MANAGER",
  "HR",
  "SUPERVISOR",
]);
export function isSupervisorUp(role) {
  return SUPERVISOR_UP_ROLES.has(role);
}

// who is EXPECTED to acknowledge an ack-required announcement: everyone
// except upper management (Manager / Admin / Super). IT is deliberately
// included - they're operational too. so the expected set ends up being
// Staff, Supervisor, HR, IT. used both for the email blast recipient list
// and as the "who hasnt" roster denominator.
const NO_ACK_ROLES = new Set(["MANAGER", "ADMIN", "SUPER"]);
export function mustAcknowledge(role) {
  return !NO_ACK_ROLES.has(role);
}

// the concrete list of roles on the expected-to-ack list, for prisma `in`
// queries (recipients + roster). derived from ROLES so there's one source.
export const EXPECTED_ACK_ROLES = ROLES.filter(mustAcknowledge);

// can `actorRole` MANAGE a user who currently holds `targetRole`? this is
// the authority guard for the admin user actions (edit profile, deactivate,
// reactivate) - it stops someone acting on a user above their own tier.
// SUPER -> Super only; ADMIN/IT -> Admin and up; anything else -> any
// oversight role. NOTE: this is about touching the user at all, not about
// changing their privilege role - that's gated separately by canAssignRole.
export function canManageUser(actorRole, targetRole) {
  if (targetRole === "SUPER") return isSuper(actorRole);
  if (targetRole === "ADMIN" || targetRole === "IT_ADMIN") {
    return isAdminUp(actorRole);
  }
  return isElevated(actorRole);
}

// who can ASSIGN / change a user's privilege role? roles are an IT concern
// now - only IT + Super set them. Super is the only one who can grant Super.
// HR / Manager / Admin still manage users (canManageUser) but the role field
// is read-only / hidden for them. used to filter the role picker AND guard
// the role write in the invite + edit actions.
export function canAssignRole(actorRole, targetRole) {
  if (targetRole === "SUPER") return isSuper(actorRole);
  return isIT(actorRole);
}

// who can SEE a privilege role (badge / role field) anywhere in the portal -
// other people's AND their own. limited to Admin / IT / Super (isAdminUp);
// HR / Manager / Staff / Supervisor only see names + job titles, never the
// privilege tier. keeps roles off everyone-facing surfaces.
export function canSeeRoles(role) {
  return isAdminUp(role);
}

// returns true if `role` is a valid Role enum value. use for form
// validation when accepting role from a form submission.
export function isValidRole(role) {
  return typeof role === "string" && ROLES.includes(role);
}

// privilege rank by position in ROLES: lower number = higher privilege
// (SUPER = 0 ... STAFF = 6). unknown roles rank lowest. used by the
// "view as role" preview to guarantee it can only ever step DOWN to a
// lower-or-equal role, never escalate.
export function roleRank(role) {
  const i = ROLES.indexOf(role);
  return i === -1 ? ROLES.length : i;
}
