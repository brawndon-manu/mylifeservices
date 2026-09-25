// WHO OPENS A STORED FORM SENT ABOUT A PERSON SERVED (the incident report):
// the form-records roles, the person who sent it, and the people the email
// went to - after signing in. the page with its note and the pdf behind it
// both ask this, so neither can hand out more than the other.
//
// pure, so the node tests can pin it.
import { canViewFormRecords } from "./roles.js";

export function submissionOpenTo(user, sub) {
  if (!user || !sub) return false;
  if (canViewFormRecords(user.role)) return true;
  if (sub.userId && sub.userId === user.id) return true;
  const mine = String(user.email || "").trim().toLowerCase();
  return !!mine && (sub.sentTo || []).some((e) => String(e).trim().toLowerCase() === mine);
}
