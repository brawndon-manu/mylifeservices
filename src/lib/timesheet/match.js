// match a QSP name ("Miranda, Gabriel") to a portal account. QSP prints
// "Last, First" while the portal stores legal + preferred names separately, so
// we normalise both sides to a token set and compare.
//
// this only ever SUGGESTS - nothing sends until a human confirms the match on
// the review screen. a wrong match would email someone else's hours, so the
// bar for "auto" is deliberately high (every token has to line up).

function tokens(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents so "Ureña" ~ "Urena"
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

// every name a portal user might be known by
function candidateTokens(u) {
  return new Set([
    ...tokens(u.name),
    ...tokens(u.preferredFirstName),
    ...tokens(u.preferredLastName),
  ]);
}

// score 0..1 - how much of the QSP name is covered by the account's names
function score(qspTokens, userTokens) {
  if (!qspTokens.length) return 0;
  const hits = qspTokens.filter((t) => userTokens.has(t)).length;
  return hits / qspTokens.length;
}

// returns { userId, method, confidence, suggestions[] }
//   method "exact" = every token in the QSP name matched one account, uniquely.
//   method "fuzzy" = best partial match, still needs eyeballing.
//   method "unmatched" = nothing convincing; operator picks by hand.
export function matchEmployee(sourceName, users) {
  const qspTokens = tokens(sourceName);
  const scored = users
    .map((u) => ({ user: u, s: score(qspTokens, candidateTokens(u)) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s);

  const suggestions = scored.slice(0, 4).map((r) => ({
    id: r.user.id,
    confidence: Math.round(r.s * 100),
  }));

  if (!scored.length) return { userId: null, method: "unmatched", confidence: 0, suggestions };

  const best = scored[0];
  const runnerUp = scored[1];
  // a full-coverage match is only "exact" when nobody else scores as well -
  // two staff sharing a surname must not auto-resolve to one of them.
  const unique = !runnerUp || runnerUp.s < best.s;
  if (best.s === 1 && unique) {
    return { userId: best.user.id, method: "exact", confidence: 100, suggestions };
  }
  if (best.s >= 0.5 && unique) {
    return {
      userId: best.user.id,
      method: "fuzzy",
      confidence: Math.round(best.s * 100),
      suggestions,
    };
  }
  return { userId: null, method: "unmatched", confidence: Math.round(best.s * 100), suggestions };
}
