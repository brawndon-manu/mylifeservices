// EACH CLIENT'S MONTH: AUTHORIZED, BILLED, LEFT.
//
// qsp bills whatever is on the schedule, and a past shift's schedule is never
// put back once an addendum shows the visit ran longer, so qsp's own totals
// stop saying how many hours a client really has left to fill. billed here is
// the one billable rule every audit surface reads (billable-of: the roster's
// figure, with an approved addendum's signed window or a reviewer's
// correction in its place, the later of the two winning), set against the
// month's authorization.
//
// ONLY ILS AND SELF DETERMINATION COUNT. the budget capture report also
// carries day program lines, 130h a month each, and day program is billed
// outside the audit, so no shift here can ever use those hours. added onto a
// client's ils line they made four clients look 130 hours short. the build
// asks countsAgainstAuthorization before it sums anything, so the client
// roll-up, the client hours pdf and this page all read the same lines.
//
// import-free apart from billable-of: the page sums with it in the browser
// and node --test reads it directly.
import { billableOf } from "./billable-of.js";

const ILS_RX = /\bILS\b/i;
const SDP_RX = /self\s*determination/i;

export const countsAgainstAuthorization = (serviceType) => {
  const s = String(serviceType || "");
  return ILS_RX.test(s) || SDP_RX.test(s);
};

// "ILS POS (520 Monthly)" reads ILS, "Self Determination Program" reads Self
// Determination
export const serviceLabelOf = (serviceType) => {
  const s = String(serviceType || "");
  if (SDP_RX.test(s)) return "Self Determination";
  if (ILS_RX.test(s)) return "ILS";
  return s.trim();
};

const blank = (name, clientKey) => ({
  name,
  clientKey,
  services: [],
  caseManager: null,
  authorizedMin: null,
  billedMin: 0,
  billableMin: 0,
  addendumMin: 0,
  reviewMin: 0,
  addenda: 0,
  reviews: 0,
  rows: [],
});

// clientMonthModel({ rows, authLines }) ->
//   lines     one per authorized client (their counted lines summed), then one
//             per client billed with nothing on file; each with its rows
//   noClient  shifts with no client on the booking, which no authorization
//             could ever hold, totalled apart
//   totals    for the summary, over the lines
// rows are the audit build's rows, authKey already joined to the report's key
// (nicknames and all); authLines are the month's ClientAuthorization rows.
export function clientMonthModel({ rows = [], authLines = [] }) {
  const byKey = new Map();
  for (const a of authLines || []) {
    if (!countsAgainstAuthorization(a.serviceType)) continue;
    let l = byKey.get(a.clientKey);
    if (!l) {
      l = blank(a.clientName, a.clientKey);
      byKey.set(a.clientKey, l);
    }
    l.authorizedMin = (l.authorizedMin || 0) + Math.round((a.authorizedHours || 0) * 60);
    const label = serviceLabelOf(a.serviceType);
    if (label && !l.services.includes(label)) l.services.push(label);
    if (!l.caseManager && a.caseManagerName) l.caseManager = a.caseManagerName;
  }

  const unlisted = new Map();
  const noClient = { shifts: 0, billableMin: 0 };
  for (const r of rows || []) {
    const b = billableOf(r);
    const min = b.min ?? 0;
    if (!r.client) {
      noClient.shifts++;
      noClient.billableMin += min;
      continue;
    }
    let l = r.authKey ? byKey.get(r.authKey) : null;
    if (!l) {
      l = unlisted.get(r.client);
      if (!l) {
        l = blank(r.client, null);
        unlisted.set(r.client, l);
      }
      const label = serviceLabelOf(r.service);
      if (label && !l.services.includes(label)) l.services.push(label);
    }
    l.rows.push(r);
    l.billedMin += r.billedMin ?? 0;
    l.billableMin += min;
    if (b.source === "amendment") {
      l.addenda++;
      l.addendumMin += min - (r.billedMin ?? 0);
    } else if (b.source === "review") {
      l.reviews++;
      l.reviewMin += min - (r.billedMin ?? 0);
    }
  }

  const lines = [...byKey.values(), ...unlisted.values()]
    .map((l) => ({
      ...l,
      remainingMin: l.authorizedMin == null ? null : l.authorizedMin - l.billableMin,
      usedPct: l.authorizedMin ? Math.round((l.billableMin / l.authorizedMin) * 100) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const sum = (f) => lines.reduce((n, l) => n + f(l), 0);
  const withAuth = lines.filter((l) => l.authorizedMin != null);
  const totals = {
    clients: lines.length,
    authorizedMin: sum((l) => l.authorizedMin || 0),
    billedMin: sum((l) => l.billedMin),
    billableMin: sum((l) => l.billableMin),
    addendumMin: sum((l) => l.addendumMin),
    reviewMin: sum((l) => l.reviewMin),
    // each client's own balance: one client over takes nothing from anyone else
    leftMin: sum((l) => Math.max(0, l.remainingMin ?? 0)),
    overMin: sum((l) => Math.max(0, -(l.remainingMin ?? 0))),
    over: withAuth.filter((l) => l.remainingMin < 0).length,
    none: withAuth.filter((l) => !l.rows.length).length,
    addendumClients: lines.filter((l) => l.addenda).length,
    noAuth: lines.length - withAuth.length,
    noAuthMin: sum((l) => (l.authorizedMin == null ? l.billableMin : 0)),
    usedPct: 0,
  };
  const billedOnAuth = sum((l) => (l.authorizedMin != null ? l.billableMin : 0));
  totals.usedPct = totals.authorizedMin ? Math.round((billedOnAuth / totals.authorizedMin) * 100) : 0;
  return { lines, noClient, totals };
}
