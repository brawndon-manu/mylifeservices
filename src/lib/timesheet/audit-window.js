// THE DAYS AN AUDIT COPY ACTUALLY COVERS.
//
// Mánu 2026-09-14: "all my reports i generated from qsp were from september 1st
// - 13 ... with the exception of some of them still getting the entire month
// like the month schedule ... is there a way we can make it so i pick which
// days it goes to as far as what is showed".
//
// The schedule is the widest export of the set. Ask QSP for a month and it
// returns the month, so a copy uploaded on the 14th with everything else pulled
// through the 13th carried 79 rows for the 14th: no clock row, no note and no
// punch on any of them, and every one became a "no DSN" auto flag. The window
// is typed at upload, stored as partialFrom / partialThrough, and applied here.
//
// CLAMPED, NEVER TRUSTED. A window wider than the period is the period. Batches
// made before the box existed carry a partialThrough written by the old
// month-to-date trim, which only ever narrows to today, so honouring it is
// right for them too.

const key = (d) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(String(d || "").trim());
  return m ? Number(`20${m[3]}${m[1]}${m[2]}`) : null;
};

export function auditWindow(batch) {
  const from = key(batch?.periodFrom);
  const to = key(batch?.periodTo);
  const pFrom = key(batch?.partialFrom);
  const pThrough = key(batch?.partialThrough);
  return {
    from: pFrom != null && from != null && pFrom > from ? batch.partialFrom : batch?.periodFrom ?? null,
    to: pThrough != null && to != null && pThrough < to ? batch.partialThrough : batch?.periodTo ?? null,
  };
}

// is this day inside the window? An unreadable date is kept, because dropping a
// row nobody can place is worse than showing it.
export function inAuditWindow(date, window) {
  const d = key(date);
  if (d == null) return true;
  const from = key(window?.from);
  const to = key(window?.to);
  if (from != null && d < from) return false;
  if (to != null && d > to) return false;
  return true;
}
