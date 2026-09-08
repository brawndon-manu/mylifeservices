// DOUBLE BOOKINGS - Mánu 2026-09-05: "we need a flag for double booking when
// it comes to client and staff." NARROWED 2026-09-08 to the client side
// alone, off Gabe's answer to the Ford card: a staff member's own bookings
// overlap for ordinary reasons - travel shifts, and the office creating a
// fresh shift when somebody clocks in late - so "booked in two places at
// once" cried wolf. Mánu: "we only need to know overlapping staff have over
// the same client." What bills a client twice is two DIFFERENT staff booked
// with the SAME client at overlapping times, and that is the one finding
// left here.
//
// Touching edges (2:00 out, 2:00 in) are back-to-back, not overlap - the
// comparison is strictly greater. Findings ride the rows' own reasons list,
// so the cards, the chips, the score sort, the deck and the flagged reports
// all carry them with no extra plumbing; the auto flagger reads the kind.
//
// Pure: stamps the build's rows in place, returns the count.

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

  let client = 0;
  // only CLIENT bookings count - Mánu 2026-09-05: "only if its with a
  // client." A client session overlapping a clientless block is not a
  // double billing.
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
      // the structured windows behind the sentence, so the card can DRAW the
      // client's day - Mánu 2026-09-08, picking the calendar-column visual
      r.overlapPartners = others.map((x) => ({
        who: x.who,
        schedFrom: x.schedFrom,
        schedTo: x.schedTo,
      }));
    }
  }

  return { client };
}
