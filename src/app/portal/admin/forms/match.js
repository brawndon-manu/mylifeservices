// crude fuzzy name matching for the "needs assignment" reconciliation - not
// identity-proof, just a nudge so the admin doesn't have to scan the whole
// active-staff list by eye. scores by shared word tokens; ties broken
// alphabetically for a stable order.
function tokens(s) {
  return (s || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// top name-guess matches for a typed submitter name, out of the active-staff
// candidate list. each candidate needs { id, displayName }.
export function fuzzyGuesses(typedName, candidates, limit = 3) {
  const typed = new Set(tokens(typedName));
  if (typed.size === 0) return [];
  const scored = candidates
    .map((c) => {
      const cTokens = tokens(c.displayName);
      const shared = cTokens.filter((t) => typed.has(t)).length;
      return { ...c, score: shared };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));
  return scored.slice(0, limit);
}
