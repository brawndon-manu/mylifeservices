// "view as role" preview - lets IT / SUPER see the portal UI as a lower
// role for testing, without actually changing their account. the previewed
// role is kept in a cookie and resolved into an "effective role" that the
// rest of the app reads through getCurrentUser().
//
// SECURITY: preview can only ever step DOWN. it applies only when the real
// role is IT/SUPER, and only to a target role at or below their own
// privilege (roleRank). so it can never be used to escalate access - the
// worst it can do is show the previewer LESS than they actually have.
//
// kept pure (no cookie/db api) so proxy.js (edge runtime) can import it too.

import { ROLES, isIT, isValidRole, roleRank } from "./roles";

export const PREVIEW_COOKIE = "mls_preview_role";

// can a user with `realRole` preview `targetRole`? IT/SUPER only, and only
// roles at or below their own privilege tier.
export function canPreviewRole(realRole, targetRole) {
  return (
    isIT(realRole) &&
    isValidRole(targetRole) &&
    roleRank(targetRole) >= roleRank(realRole)
  );
}

// resolve the effective role from the real role + the raw cookie value.
// returns the previewed role if it's an allowed step-down, else the real role.
export function resolveEffectiveRole(realRole, cookieValue) {
  return canPreviewRole(realRole, cookieValue) ? cookieValue : realRole;
}

// the roles an IT/SUPER user is allowed to preview (their tier and below).
export function previewableRoles(realRole) {
  if (!isIT(realRole)) return [];
  return ROLES.filter((r) => roleRank(r) >= roleRank(realRole));
}
