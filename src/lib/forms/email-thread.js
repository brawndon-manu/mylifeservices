// READING A GMAIL THREAD OF ACKNOWLEDGMENTS - Mánu 2026-09-12: "i need to find
// a way to make a section in forms admin side to create a pdf of attestation/
// signed documents for older stuff that wasnt in the portal. they would do it
// via email like this before."
//
// Before the portal, HR emailed a notice and staff replied "received, read,
// understood". Those replies ARE the signature record, and there was no way to
// get them in. This reads a pasted thread into one acknowledgment per person.
//
// WHAT THE REAL SB-294 THREAD TAUGHT, measured rather than assumed:
//
//   THE DISPLAY NAME IS THE IDENTITY, not the email address. Of 81 entries, 2
//   carried an address on the sender line and 7 carried one in the BODY - and
//   all 7 of those belonged to somebody else, quoted from "On May 23, Britny
//   Arevalo <britny@...> wrote:". Reading the address out of the body would
//   have credited Gabriel Miranda's acknowledgment to Britny, Monica Singh's to
//   Jose Martinez and Martha Plancarte's to Haili Plancarte. So a body address
//   is never an identity here.
//
//   THE BODY STILL MATTERS, for the name rather than the address: 14 of 81 only
//   resolve through it. Gmail shows "Kristy", "Marci", "Devin", "Mary B", and
//   the reply says Kristy Hatt, Marcelle Robidoux, Devin Bass, Mary Bucio.
//
//   PEOPLE REPLY MORE THAN ONCE. Martha Plancarte four times, Ayana Fitzgerald
//   three. One acknowledgment per person, the earliest, because that is when
//   they acknowledged it.

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// "Sat, May 23, 2:48 PM" - Gmail drops the year inside the current one, so the
// caller passes the year the notice went out.
const DATE_LINE =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

// lines Gmail puts between the sender and the body that are not the body
const NOISE = /^(attachments?|to me|to\s+.+)$/i;

export function isThreadDateLine(line) {
  return DATE_LINE.test(String(line || "").trim());
}

// minutes since midnight, California, for a thread date line. Returned as the
// parts rather than a Date so the caller can build one in the company zone -
// a Date built here would carry whatever zone the server happens to be in.
export function parseThreadDate(line, year) {
  const m = DATE_LINE.exec(String(line || "").trim());
  if (!m || !Number.isFinite(Number(year))) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (month == null) return null;
  let hour = Number(m[3]) % 12;
  if (/pm/i.test(m[5])) hour += 12;
  return { year: Number(year), month, day: Number(m[2]), hour, minute: Number(m[4]) };
}

// A DATE IS CALIFORNIA'S. Built by asking what the company zone's offset is at
// that instant rather than trusting the server's own zone.
export function companyInstant({ year, month, day, hour, minute }, tz = "America/Los_Angeles") {
  const guess = Date.UTC(year, month, day, hour, minute);
  // what the zone calls that UTC instant, read back as numbers
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
  const seen = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute),
  );
  return new Date(guess + (guess - seen));
}

// the thread, as entries. Gmail's list view is: sender, sometimes
// "Attachments", the date, then a preview of the body.
export function parseEmailThread(text) {
  const lines = String(text || "").split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!isThreadDateLine(lines[i])) continue;

    // walk back past the noise to the sender line
    let n = i - 1;
    while (n >= 0 && NOISE.test(lines[n].trim())) n -= 1;
    const senderLine = (lines[n] || "").trim();
    if (!senderLine) continue;

    // walk forward past the noise to the body
    let b = i + 1;
    while (b < lines.length && NOISE.test(lines[b].trim())) b += 1;
    // a body runs until the next sender/date pair, so take what is there
    const body = (lines[b] || "").trim();
    if (isThreadDateLine(body)) continue;

    const email = /<([^>]+@[^>]+)>/.exec(senderLine)?.[1] || null;
    out.push({
      displayName: senderLine.replace(/<[^>]*>/g, "").trim(),
      senderEmail: email ? email.toLowerCase() : null,
      when: lines[i].trim(),
      body,
    });
  }
  return out;
}

// ONE ACKNOWLEDGMENT PER PERSON, THE EARLIEST. Rows with nobody attached are
// never collapsed into each other - two unassigned replies may be two people,
// and guessing they are one loses a record.
export function earliestPerPerson(rows) {
  const best = new Map();
  const loose = [];
  for (const r of rows) {
    if (!r.userId) { loose.push(r); continue; }
    const held = best.get(r.userId);
    if (!held || (r.at && held.at && r.at < held.at)) best.set(r.userId, r);
  }
  return [...best.values(), ...loose];
}
