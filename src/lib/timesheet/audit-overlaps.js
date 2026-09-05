// DOUBLE BOOKINGS - Mánu 2026-09-05: "we need a flag for double booking when
// it comes to client and staff." Two different impossibilities, checked over
// the CALENDAR windows (schedFrom/schedTo - what bills):
//
//   staff  - one person booked in two places at overlapping times. 1:1
//            service cannot be delivered to two clients at once.
//   client - one client booked with two DIFFERENT staff at overlapping
//            times. A client cannot receive two 1:1 services at once.
//
// Touching edges (2:00 out, 2:00 in) are back-to-back, not overlap - the
// comparison is strictly greater. Findings ride the rows' own reasons list,
// so the cards, the chips, the score sort, the deck and the flagged reports
// all carry them with no extra plumbing; the auto flagger reads the kinds.
//
// Pure: stamps the build's rows in place, returns the counts.

const clientKeyOf = (c) =>
  String(c || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const overlaps = (a, b) => a.schedFrom < b.schedTo && b.schedFrom < a.schedTo;

export function stampOverlaps(rows, ampm) {
  const windowed = rows.filter(
    (r) => r.schedFrom != null && r.schedTo != null && r.schedTo > r.schedFrom,
  );

  const spanOf = (r) => `${ampm(r.schedFrom)} - ${ampm(r.schedTo)}`;
  const add = (r, kind, label, text) => {
    // one finding per kind per row, however many partners - the text names
    // them all
    r.reasons = r.reasons || [];
    if (r.reasons.some((x) => x.kind === kind)) return false;
    r.reasons.push({ kind, label, weight: 85, text });
    r.score = (r.score || 0) + 85;
    return true;
  };

  let staff = 0;
  const byStaffDay = new Map();
  // only CLIENT bookings count both ways - Mánu 2026-09-05: "only if its
  // with a client." A client session overlapping a clientless block is not
  // two clients at once.
  for (const r of windowed) {
    if (!clientKeyOf(r.client)) continue;
    const k = `${r.employeeKey}|${r.date}`;
    if (!byStaffDay.has(k)) byStaffDay.set(k, []);
    byStaffDay.get(k).push(r);
  }
  for (const list of byStaffDay.values()) {
    for (const r of list) {
      const others = list.filter((x) => x !== r && overlaps(r, x));
      if (!others.length) continue;
      const named = others
        .map((x) => `${x.client} ${spanOf(x)}`)
        .join("; ");
      if (add(r, "double-booked-staff", "Booked in two places at once",
        `Also booked with ${named} at overlapping times.`)) staff++;
    }
  }

  let client = 0;
  const byClientDay = new Map();
  for (const r of windowed) {
    const ck = clientKeyOf(r.client);
    if (!ck) continue;
    const k = `${ck}|${r.date}`;
    if (!byClientDay.has(k)) byClientDay.set(k, []);
    byClientDay.get(k).push(r);
  }
  for (const list of byClientDay.values()) {
    for (const r of list) {
      const others = list.filter(
        (x) => x !== r && x.employeeKey !== r.employeeKey && overlaps(r, x),
      );
      if (!others.length) continue;
      const named = others.map((x) => `${x.who} ${spanOf(x)}`).join("; ");
      if (add(r, "double-booked-client", "The client is double booked",
        `${r.client} is also booked with ${named} at overlapping times.`)) client++;
    }
  }

  return { staff, client };
}
