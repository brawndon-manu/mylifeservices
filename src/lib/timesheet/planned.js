// THE REST OF THE MONTH, AS SCHEDULED.
//
// every audit copy is uploaded with qsp's employee schedules for the whole
// month, and the audit only reads the days up to the copy's last one. the days
// after it are the plan: shifts on the calendar that haven't happened yet. the
// client hours page counts them against each client's authorization, so what's
// left to fill is the authorization less what's billed less what's already on
// the calendar.
//
// THE SCHEDULE WRITES CLIENTS SHORT ("Acuna, J"), and two clients can share
// that. a planned shift joins a client in this order:
//   1. the staff member's own client: whoever works the shift has already
//      billed this surname and initial for exactly one client on this copy
//   2. the only authorized client with this surname and initial
// anything else is left unjoined and named, never split or guessed: a shift
// counted against the wrong client makes one look booked and the other free.
//
// pure apart from reading the schedule's block text. the build hands in the
// parsed schedule, its rows, the month's counted authorization lines and the
// two key functions it already uses (whoKey for a person, initialKey for
// "surname|initial"), so this can be tested without a pdf or a database.
import { serviceOf, clientOf, blockTimes } from "./schedule.js";
import { isCappedService } from "./compliance.js";

const dayKey = (d) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(d || "");
  return m ? Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]) : 0;
};

// plannedFromSchedule(people, { through, rows, authLines, whoKey, initialKey }) ->
//   shifts    [{ key, date, from, to, min, who }] - key is the authorization key
//             the rows carry (r.authKey)
//   unclear   [{ client, who, date, from, to, min, could }] - named, not counted
//   noClient  { shifts, min } - schedule blocks that name no client
//   from, to  the days read ("09/23/26", "09/30/26"), or null when none are left
export function plannedFromSchedule(people, { through, rows = [], authLines = [], whoKey, initialKey }) {
  const last = dayKey(through);
  const month = Math.floor(last / 100);
  const out = { shifts: [], unclear: [], noClient: { shifts: 0, min: 0 }, from: null, to: null };
  if (!last || !Array.isArray(people)) return out;

  // who already serves which client, by surname and initial
  const served = new Map();
  for (const r of rows) {
    if (!r.client || !r.authKey || !r.employeeKey) continue;
    const k = `${r.employeeKey}|${initialKey(r.client)}`;
    if (!served.has(k)) served.set(k, new Set());
    served.get(k).add(r.authKey);
  }
  // which authorized clients carry each surname and initial
  const named = new Map();
  for (const a of authLines) {
    const k = initialKey(a.clientName);
    if (!k) continue;
    if (!named.has(k)) named.set(k, new Map());
    named.get(k).set(a.clientKey, a.clientName);
  }

  let first = null;
  let end = null;
  for (const p of people) {
    const who = whoKey(p.employee || "");
    for (const d of p.days || []) {
      const day = dayKey(d.date);
      // after the copy's last day, inside its month
      if (!day || day <= last || Math.floor(day / 100) !== month) continue;
      for (const e of d.entries || []) {
        if (e.meal || !isCappedService(serviceOf(e.text))) continue;
        const t = blockTimes(e.text);
        if (!t) continue;
        const min = t.end > t.start ? t.end - t.start : t.end - t.start + 1440;
        if (!first || day < dayKey(first)) first = d.date;
        if (!end || day > dayKey(end)) end = d.date;
        const client = clientOf(e.text);
        if (!client) {
          out.noClient.shifts++;
          out.noClient.min += min;
          continue;
        }
        const k = initialKey(client);
        const mine = served.get(`${who}|${k}`);
        const only = named.get(k);
        const key = mine && mine.size === 1 ? [...mine][0] : only && only.size === 1 ? [...only.keys()][0] : null;
        const shift = { date: d.date, from: t.start, to: t.end, min, who: p.employee || "" };
        if (key) out.shifts.push({ key, ...shift });
        else out.unclear.push({ client, ...shift, could: only ? [...only.values()] : [] });
      }
    }
  }
  out.from = first;
  out.to = end;
  return out;
}
