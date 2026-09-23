// ONE EXPORT, TWO PAY PERIODS, for an audit copy.
//
// asking QSP's Simple Timesheet for a month hands back both pay periods in one
// PDF, every person twice, each sheet headed with its own "Pay Period" line. a
// payroll batch refuses that, rightly: it would mail everyone two sheets. an
// audit copy of a month WANTS both halves, and until now got them by pulling
// twice into two slots. this reads the one file the same way: grouped by the
// header each sheet already carries, each half checked clean, earlier half
// first, so the batch comes out exactly as the two-file merge builds it.
//
// works whichever way the report was grouped (by employee: each person's two
// sheets back to back; by pay period: one half then the other), because it
// reads the header on the sheet, never the order.
//
// dependency-free so node --test can reach it.

// "07/16/26" -> 260716, so periods sort and compare as numbers
const dayKey = (d) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(d || "");
  return m ? Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]) : 0;
};

const nameKey = (s) => (s.employee || "").trim().toLowerCase();

// sheets: the parsed sheets with hours. answers { ok: true, sheets, periods }
// with the sheets reordered earlier period first, or { ok: false, why } saying
// what stops it being read as a clean month.
export function splitByPeriod(sheets) {
  const groups = new Map();
  for (const s of sheets) {
    const from = s.payPeriod?.from || "";
    const to = s.payPeriod?.to || "";
    if (!dayKey(from) || !dayKey(to)) {
      return { ok: false, why: `a sheet (${s.employee || "no name"}) has no pay period printed on it` };
    }
    const k = `${from}-${to}`;
    if (!groups.has(k)) groups.set(k, { from, to, sheets: [] });
    groups.get(k).sheets.push(s);
  }
  const periods = [...groups.values()].sort((a, b) => dayKey(a.from) - dayKey(b.from));

  // one period with a name twice is not two halves of a month, it is a
  // person printed twice, and the split has nothing to say about it
  if (periods.length < 2) return { ok: false, why: "every sheet is from the same pay period" };
  // a month is two halves. three means the range ran past a month
  if (periods.length > 2) {
    return { ok: false, why: `the export covers ${periods.length} pay periods (${periods.map((p) => `${p.from}-${p.to}`).join(", ")}); an audit copy takes a month, two at most` };
  }
  const [a, b] = periods;
  if (dayKey(b.from) <= dayKey(a.to)) {
    return { ok: false, why: `the pay periods ${a.from}-${a.to} and ${b.from}-${b.to} overlap` };
  }
  for (const p of periods) {
    const seen = new Set();
    for (const s of p.sheets) {
      const k = nameKey(s);
      if (seen.has(k)) return { ok: false, why: `${s.employee} appears twice inside ${p.from}-${p.to}` };
      seen.add(k);
    }
  }
  return {
    ok: true,
    sheets: [...a.sheets, ...b.sheets],
    periods: periods.map((p) => ({ from: p.from, to: p.to, count: p.sheets.length })),
  };
}
