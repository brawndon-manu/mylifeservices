// Linking the same person across QSP's own reports.
//
// QSP does not print one name per person. The Simple Timesheet says
// "Delgado Pineda, Ruth"; the clock and rest reports say
// "Delgado Pineda, Angel". Nothing in those files connects the two, so her
// clock evidence was being thrown away and her premiums came out as
// "needs somebody to look" purely over spelling. That was 37 premium hours
// across three people on 07/16-07/31.
//
// The portal already holds the answer: her account is Ruth Delgado Pineda,
// preferred name Angel. So both spellings are resolved through the staff list
// rather than compared to each other, and the account is what says they are the
// same person.
//
// Two tiers, deliberately:
//   confirmed - both spellings resolve to the SAME account with every name
//               token accounted for. Evidence is applied.
//   likely    - a partial match ("Velasquez, Francisco" against an account
//               named Frank Velasquez scores 50%). NOT applied. Surfaced for a
//               human to confirm, because guessing at somebody's identity on a
//               payroll document is not ours to do.

// extension included so this resolves outside Next too, matching the rest of
// this folder
import { matchEmployee } from "./match.js";

// Index a report's people by the portal account they resolve to.
// Only full, unique matches are indexed - a partial is never enough to say two
// spellings are one person.
export function indexByAccount(names, staff) {
  const byUser = new Map();
  for (const name of names) {
    const m = matchEmployee(name, staff);
    if (m.method === "exact" && m.userId) {
      // first spelling wins; a second exact match on the same account would
      // mean the report lists someone twice, which is its own problem
      if (!byUser.has(m.userId)) byUser.set(m.userId, name);
    }
  }
  return byUser;
}

// Find this timesheet's row in another report.
//   1. the name as printed, which is the common case
//   2. failing that, whatever spelling that report used for the same account
//
// `match` is the result of matchEmployee on the timesheet name.
//
// A partial match IS followed - "Velasquez, Francisco" scores 50% against an
// account named Frank Velasquez, and with no other candidate in the building
// that is who it is. What a partial does NOT get is silence: the confidence
// comes back with the result and rides along to the screen, so a 50% link is
// always readable as a 50% link.
//
// The protection against a wrong link is uniqueness, not strictness.
// matchEmployee already refuses to resolve a name when two accounts score
// equally, so Ruth can never be handed Jennifer Delgado Pineda's record however
// low the bar goes.
//
// Returns { value, via, confidence, exact } - `via` is the spelling actually
// used, so the screen can say "read as Delgado Pineda, Angel" rather than
// silently substituting.
export function lookupAcross(sourceName, match, { get, keyOf, byUser }) {
  const direct = get(keyOf(sourceName));
  if (direct) return { value: direct, via: null, confidence: 100, exact: true };

  const userId = match?.userId || null;
  const miss = { value: null, via: null, confidence: 0, exact: false };
  if (!userId || !byUser) return miss;
  const alias = byUser.get(userId);
  if (!alias || keyOf(alias) === keyOf(sourceName)) return miss;
  const found = get(keyOf(alias));
  if (!found) return miss;
  return {
    value: found,
    via: alias,
    confidence: match.confidence ?? 0,
    exact: match.method === "exact",
  };
}

// When nothing resolves, what is the best guess and how sure is it?
// Used to put a question on screen, never to act.
export function suggestAlias(sourceName, names, staff) {
  const target = matchEmployee(sourceName, staff);
  if (!target.userId) return null;
  let best = null;
  for (const name of names) {
    const m = matchEmployee(name, staff);
    if (m.userId !== target.userId || !m.confidence) continue;
    // The number to report is the WEAKER of the two links, and in practice
    // that's always the timesheet side - it's the spelling that failed to
    // resolve. Reporting the candidate's own confidence instead reads as
    // "Velasquez, Frank matches Frank Velasquez: 100%", which is true and
    // completely beside the point: the open question is whether Francisco is
    // Frank, and that is a 50% match.
    const confidence = Math.min(target.confidence, m.confidence);
    if (!best || confidence > best.confidence) best = { name, confidence };
  }
  return best;
}
