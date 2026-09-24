// WHO MAY OPEN A PRIVATE FILE, by where it is stored.
//
// the gate at /portal/files asks this. each rule mirrors the screen that lists
// those files, so the gate never hands out more than the page it is linked
// from already shows: the timesheet screens are canManageTimesheets, so are
// timesheet files, and so on. `record` marks what the access log keeps - every
// open of a record is written down, a profile picture on every page is not.
//
// pure on purpose (roles.js is pure too) so the node tests can pin it.
import {
  canManageClientAttestations,
  canManageTimesheets,
  canViewFormRecords,
  isAdminUp,
  isElevated,
} from "./roles.js";

const anyoneSignedIn = () => true;

export const FILE_RULES = [
  { prefix: "timesheets/", can: canManageTimesheets, record: true },
  { prefix: "day-program/", can: canManageTimesheets, record: true },
  { prefix: "clock-amendments/", can: canManageTimesheets, record: true },
  { prefix: "client-attestations/", can: canManageClientAttestations, record: true },
  { prefix: "form-submissions/", can: canViewFormRecords, record: true },
  { prefix: "form-email-imports/", can: canViewFormRecords, record: true },
  { prefix: "certificates/", can: canViewFormRecords, record: true },
  { prefix: "applications/", can: isElevated, record: true },
  // three files from before the client roster moved out; nothing writes here now
  { prefix: "clients/", can: isAdminUp, record: true },
  // blank templates. some carry a role floor (the field supervisor set), so
  // the gate looks the form up and asks canSeeForm - `form: true` - and this
  // rule is only what is left for a file no form row owns
  { prefix: "forms/", can: isAdminUp, record: false, form: true },
  { prefix: "announcements/docs/", can: anyoneSignedIn, record: false },
  { prefix: "hub/", can: anyoneSignedIn, record: false },
  { prefix: "avatars/", can: anyoneSignedIn, record: false },
  { prefix: "feedback/", can: anyoneSignedIn, record: false },
];

// the rule for a pathname, or null. a pathname under no rule is refused - a
// new kind of file has to be given a rule here before anybody can open it.
export function fileRuleFor(pathname) {
  const p = String(pathname || "");
  return FILE_RULES.find((r) => p.startsWith(r.prefix)) || null;
}

// `user` is getCurrentUser()'s answer: null for nobody, and for a deactivated
// account, whose session outlives the deactivation.
export function canOpenFile(user, pathname) {
  if (!user) return false;
  const rule = fileRuleFor(pathname);
  return !!rule && !!rule.can(user.role);
}
