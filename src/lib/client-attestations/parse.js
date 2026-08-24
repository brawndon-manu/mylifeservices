// READING THE QSP "CLIENT SCHEDULES" EXPORT.
//
// One PDF, one page per client, printed for a whole month. August 2026 came out
// as 252 pages and 252 clients, one each, none of them spanning two pages - so
// the page IS the unit of work here, and the attestation each client signs is
// built from what this file reads off their page.
//
// POSITIONAL, NOT JUST TEXTUAL. The attestation form redraws the calendar (the
// approved layout puts the staff's full name under each visit, which QSP's own
// page cannot do), and redrawing needs to know WHICH DAY each service sits on.
// The text alone never says - only its position in the grid does. So this reads
// every text run with its coordinates and works the grid out:
//
//   - the seven weekday headers give the column centres, measured off the page
//     rather than assumed, so a re-scaled export still lands in the right week
//     column;
//   - the day numbers (1..31) come in one row per week of the month, so their
//     y positions are the week bands;
//   - a service line belongs to the band directly above it and the column that
//     CONTAINS its starting x.
//
// The column rule is containment and NOT nearest-edge, which is the mistake
// worth naming: an entry is several text runs ("8a-10a", "Solorzano,", "I-ILS",
// "Service"), and the later ones sit well into the cell - "I-ILS" starts at 582
// in a Thursday column running 511 to 634, closer to Friday's edge than to its
// own. Measured by nearest edge, one visit tears in half across two days. QSP
// also bleeds entries a point or two LEFT of the cell edge, which is what the
// small tolerance below is for.
//
// server-only (pdfjs legacy build + node Buffer).
import { getPdfjs } from "../pdf-globals.js";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// "Client: Jacob Acuna" above "August 2026". The month is what terminates the
// name - client names carry commas, brackets and stray spaces ("Acuna, Jose
// ( Angel)", "Elder. Morton, Susan"), so nothing about the name itself does.
const HEADER = new RegExp(
  `Client:\\s*(.+?)\\s+(${MONTHS.join("|")})\\s+(\\d{4})`,
);

// ONE SCHEDULED SERVICE, as QSP prints it inside a day cell:
//
//   8a-10a Solorzano, I-ILS Service (2)
//   2:30p-4:45p Gutierrez, J-ILS Service(2:15)
//
// The staff name is abbreviated to a first initial, the hours are printed as a
// plain number or h:mm, and the space before the bracket is there on some lines
// and not others.
const ENTRY =
  /(\d{1,2}(?::\d{2})?[ap])-(\d{1,2}(?::\d{2})?[ap])\s+([^()]+?)-([A-Za-z][A-Za-z /&'.-]*?)\s*\((\d{1,2}(?::\d{2})?)\)/g;

// "(2:15)" is two and a quarter hours; "(2)" is two. The printed text is kept
// too - the redrawn cell shows the hours exactly as QSP wrote them.
function hoursOf(text) {
  const [h, m] = String(text).split(":");
  return Number(h) + (m ? Number(m) / 60 : 0);
}

const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

// every text run on a page with its position, in reading order
async function pageRuns(doc, n) {
  const content = await (await doc.getPage(n)).getTextContent();
  const runs = [];
  for (const item of content.items) {
    if (typeof item.str !== "string" || !item.str.trim()) continue;
    runs.push({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      w: item.width || 0,
    });
  }
  return runs;
}

// WHAT ONE PAGE SAYS, from its text runs. Exported pure - it takes runs, not a
// PDF - so the grid arithmetic can be tested without a two-hundred-page binary
// in the repo. Returns null when the page carries no client header, which is
// how a cover sheet in the middle of an export gets dropped rather than
// becoming a client called something unprintable.
export function readSchedulePage(runs, page) {
  const all = runs.map((r) => r.str).join(" ").replace(/\s+/g, " ");
  const header = all.match(HEADER);
  if (!header) return null;

  const printed = all.match(/Date Printed:\s*([\d/]+)/);

  // the seven column centres, measured off the weekday header row
  const headerRuns = WEEKDAYS.map((d) => runs.find((r) => r.str.trim() === d));
  if (headerRuns.some((r) => !r)) return null;
  const centers = headerRuns.map((r) => r.x + r.w / 2);
  const colWidth = (centers[6] - centers[0]) / 6;
  const headerY = headerRuns[0].y;

  // the week bands: day numbers are bare 1..31 below the weekday row, one text
  // run each, and every number in a band shares its y (within a point)
  const dayRuns = runs.filter(
    (r) => r.y < headerY - 2 && /^\d{1,2}$/.test(r.str.trim()) && Number(r.str) >= 1 && Number(r.str) <= 31,
  );
  const bands = [];
  for (const r of dayRuns) {
    let band = bands.find((b) => Math.abs(b.y - r.y) < 3);
    if (!band) {
      band = { y: r.y, days: Array(7).fill(null) };
      bands.push(band);
    }
    const col = nearestIndex(centers, r.x + r.w / 2);
    band.days[col] = Number(r.str);
  }
  bands.sort((a, b) => b.y - a.y);

  // each service run joins the band directly above it, in the column whose left
  // edge it starts nearest to (QSP bleeds 2pt left of the edge - see header)
  const cells = new Map(); // "band:col" -> runs
  for (const r of runs) {
    if (r.y >= headerY - 2) continue;
    if (dayRuns.includes(r)) continue;
    const bi = bands.findIndex((b) => b.y > r.y + 2);
    const band = bi === -1 ? null : bands.filter((b) => b.y > r.y + 2).sort((a, b) => a.y - b.y)[0];
    if (!band) continue;
    const col = columnAt(centers, colWidth, r.x);
    const key = `${band.y.toFixed(0)}:${col}`;
    if (!cells.has(key)) cells.set(key, { band, col, runs: [] });
    cells.get(key).runs.push(r);
  }

  // read each cell's runs in order and cut them into entries
  const days = [];
  for (const { band, col, runs: cellRuns } of cells.values()) {
    const day = band.days[col];
    if (!day) continue;
    cellRuns.sort((a, b) => b.y - a.y || a.x - b.x);
    const text = cellRuns.map((r) => r.str).join(" ").replace(/\s+/g, " ");
    const entries = [];
    for (const m of text.matchAll(ENTRY)) {
      entries.push({
        start: m[1],
        end: m[2],
        staff: m[3].trim(),
        service: m[4].trim(),
        hoursText: m[5],
        hours: hoursOf(m[5]),
      });
    }
    if (entries.length) days.push({ day, entries });
  }
  days.sort((a, b) => a.day - b.day);

  const entries = days.flatMap((d) => d.entries);

  // WHO IS ON THIS SCHEDULE, in the order they first appear. This is the list
  // the attestation asks about - "they want to continue with their current
  // staff" - and it is also how a client's form finds its supervisor.
  const staff = [...new Set(entries.map((e) => e.staff))];

  return {
    page,
    clientName: header[1].trim(),
    monthName: header[2],
    year: Number(header[3]),
    monthLabel: `${header[2]} ${header[3]}`,
    datePrinted: printed ? printed[1] : null,
    days,
    staff,
    entryCount: entries.length,
    scheduledHours: Math.round(entries.reduce((t, e) => t + e.hours, 0) * 100) / 100,
  };
}

function nearestIndex(values, x) {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (Math.abs(values[i] - x) < Math.abs(values[best] - x)) best = i;
  }
  return best;
}

// which of the seven columns contains `x`: the last one whose left edge it has
// reached. BLEED is how far left of an edge QSP still prints a cell's own text -
// measured at about 2pt on the August export, doubled here for headroom. It stays
// far below the ~123pt column width, so it can never reach the column before.
const BLEED = 4;
function columnAt(centers, colWidth, x) {
  let col = 0;
  for (let i = 0; i < centers.length; i++) {
    if (x >= centers[i] - colWidth / 2 - BLEED) col = i;
  }
  return col;
}

// THE WHOLE EXPORT. One record per client page, plus the month the pages agree
// on - so an upload can be refused before anything is created if the file is
// not what it claims to be.
export async function parseClientSchedules(buffer) {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  }).promise;

  const clients = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const read = readSchedulePage(await pageRuns(doc, n), n);
    if (read) clients.push(read);
  }

  // THE MONTH IS WHATEVER THE PAGES SAY, not whatever the operator picked. Every
  // page prints its own, so a mixed export is visible here rather than becoming
  // a batch labelled one month holding another.
  const months = [...new Set(clients.map((c) => c.monthLabel))];

  return {
    pageCount: doc.numPages,
    clients,
    months,
    monthLabel: months.length === 1 ? months[0] : null,
  };
}
