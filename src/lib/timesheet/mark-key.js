// WHAT A MARK IS ABOUT, RATHER THAN WHICH UPLOAD IT WAS MADE ON.
//
// Every upload creates a new batch row and new timesheet rows, so a mark keyed
// on either dies the next morning. 70 of them did, when the 08/01-08/12 export
// landed on top of the 08/01-08/09 one: all 60 people carried over and not one
// mark did, and two people ended up ringing Jones and Urena twice over.
//
// A mark is identified by three things instead:
//
//   the PERIOD    QSP's own "Pay Period:" line, so two uploads of one fortnight
//                 are one period. Semi-monthly - 1st to 15th, then 16th to the
//                 end of the month - but nothing here has to know that, because
//                 the line is printed on the timesheet and parsed already.
//   the PERSON    the account behind the sheet. All 239 sheets across all four
//                 stored batches have one, so this never falls back to matching
//                 names - which is what files Delgado Pineda, Ruth under "Angel".
//   the FINDING   what the finding is, with no id in it. `person`,
//                 `overlap-08/07/26`, `rest-late-08/03/26`. Built in
//                 `findings.js` beside the row key, at the one place that knows.

// The pair, as one string, for a Map. Person first because that is how the
// worklist groups.
export function markKey(personKey, findingKey) {
  return `${personKey ?? "-"}|${findingKey ?? "-"}`;
}

export const markKeyOf = (e) => markKey(e?.personKey, e?.findingKey);

const asDate = (s) => {
  const [m, d, y] = String(s || "").split("/").map(Number);
  return m && d && y ? new Date(2000 + y, m - 1, d) : null;
};

// HOW FAR THE DATA ACTUALLY REACHES, which is not how far the period runs.
//
// The live batch's period ends 08/15 and its data stops at 08/12, because the
// period is not over yet. A mark has to record the first, not the second, or
// "I went through everything they had" silently starts claiming days nobody has
// seen. Read off the days themselves, with the rest report as a second opinion,
// because people file their rest periods the day of and it is the freshest
// thing in the export.
export function batchReach(batch) {
  const seen = [];
  for (const t of batch?.timesheets || []) {
    for (const d of t?.data?.days || []) if (d?.date) seen.push(d.date);
  }
  for (const r of batch?.restsByDate || []) if (r?.date) seen.push(r.date);
  if (!seen.length) return null;
  return seen.sort((a, b) => asDate(a) - asDate(b)).at(-1);
}

// Is this mark older than the data in front of us? A mark covering through
// 08/09 sitting on a batch that reaches 08/12 has three days it never saw, and
// the screen must not present it as though it did.
export function isStale(coveredThrough, reach) {
  const a = asDate(coveredThrough), b = asDate(reach);
  if (!a || !b) return false;
  return a < b;
}

// the marks for one period, as a Map the screens can look a finding up in.
// Newest wins: two rows can share a key until a unique constraint exists, and a
// silent pick would otherwise depend on row order.
export function marksByKey(rows = []) {
  const m = new Map();
  for (const r of rows) {
    const k = markKey(r.personKey, r.findingKey);
    const prev = m.get(k);
    if (!prev || new Date(r.updatedAt || r.createdAt || 0) >= new Date(prev.updatedAt || prev.createdAt || 0)) {
      m.set(k, r);
    }
  }
  return m;
}
