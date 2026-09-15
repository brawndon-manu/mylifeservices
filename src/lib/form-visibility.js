// WHO MAY SEE A FORM. One rule, because the library is read in twenty-two
// places across fifteen files and a rule written twenty-two times is a rule
// that will disagree with itself.
//
// Mánu 2026-09-14, adding the field supervisor set: "only visible by supervisor
// role and up". Before this there was no such thing - every form in the library
// was visible to every signed-in person, and worse, every form's PDF was served
// straight out of public/ with no session at all. Hiding the row was never
// going to be the gate; `formFileHref` below is the other half.
//
// DEPENDENCY-FREE ON PURPOSE, same reason announcement-attachments.js is: this
// is a trust boundary, so it is testable on its own with no database and no
// framework underneath it.
import { ROLES, isValidRole, roleRank } from "./roles.js";

// A form with no minRole is visible to anyone signed in, which is what all
// fourteen forms were before the column existed. A minRole is a FLOOR: store
// "SUPERVISOR" and supervisor plus everyone above them sees it.
export function canSeeForm(form, role) {
  const min = form?.minRole;
  if (!min) return true;
  if (!isValidRole(min)) {
    // an unreadable floor fails CLOSED. A typo in this column should hide a
    // document from everybody rather than show a restricted one to the office.
    return false;
  }
  return roleRank(role) <= roleRank(min);
}

// the same rule as a prisma filter, for the list sites. `roleRank` counts DOWN
// from SUPER at 0, so everybody at or above the floor has the smaller rank -
// which cannot be expressed as one comparison in SQL against a text column, so
// this names the roles that qualify instead.
//
// Returns a fragment to spread into an existing `where`, never a whole where,
// so a caller cannot accidentally drop its own conditions by using it.
export function visibleFormsWhere(role) {
  const mine = roleRank(role);
  // ROLES runs SUPER first, so a SMALLER rank is more senior. The floors this
  // viewer cannot clear are the ones ranked above them.
  const blocked = ROLES.filter((r) => mine > roleRank(r));
  // SUPER clears every floor, so there is nothing to filter and the caller's
  // own where is returned untouched. An UNKNOWN role goes the other way: it
  // ranks below all seven, so every floor lands in `blocked` and only the open
  // forms come back - failing closed, the same way canSeeForm does.
  if (!blocked.length) return {};
  return { OR: [{ minRole: null }, { minRole: { notIn: blocked } }] };
}

// WHERE THE FILE IS FETCHED FROM. An open form keeps pointing at its own url,
// which is how all fourteen already work. A restricted one is only ever
// reachable through the route that re-checks the role, so its stored url - a
// blob address that would work for anyone holding it - never reaches a page.
export function formFileHref(form) {
  return form?.minRole ? `/portal/forms/${form.id}/file` : form?.fileUrl || "";
}

// a restricted form must never carry a public share link, because /f/<slug>
// deliberately answers with no session at all
export function mayShare(form) {
  return !form?.minRole;
}
