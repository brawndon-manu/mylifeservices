// the meeting attendance board as a document - who was invited, who committed
// to which session, roll call, who couldn't make it and why, and who never
// answered. One PDF per meeting, so the record of a mandatory meeting can be
// filed or forwarded the way the payout report is.
//
// Same labels as the board (Present / Absent / Unmarked, Can't make it,
// No response) so the print and the screen never argue about words.
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const LOGO_PATH = path.join(process.cwd(), "public", "logo", "MLSlogo.png");

const PAGE_W = 612;
const PAGE_H = 792;
const L = 40;
const R = PAGE_W - 40;

const INK = rgb(0.05, 0.05, 0.05);
const MUTED = rgb(0.42, 0.47, 0.53);
const BRAND = rgb(0.086, 0.325, 0.529);
const HEADBG = rgb(0.106, 0.298, 0.404);
const ROWALT = rgb(0.965, 0.976, 0.984);
const GRID = rgb(0.75, 0.79, 0.83);
const WHITE = rgb(1, 1, 1);
const GREEN = rgb(0.05, 0.35, 0.19);
const RED = rgb(0.7, 0.11, 0.11);

// widths sum to R - L (532) - the header and every row walk the same list
const GOING_COLS = [
  ["Name", 190, false],
  ["Title", 220, false],
  ["Roll call", 122, true],
];
const CANT_COLS = [
  ["Name", 170, false],
  ["Title", 170, false],
  ["Reason", 192, false],
];
const NONE_COLS = [
  ["Name", 190, false],
  ["Title", 342, false],
];

function wrapAt(str, maxW, font, size) {
  const out = [];
  let line = "";
  for (const w of String(str).split(/\s+/)) {
    const cand = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(cand, size) > maxW && line) { out.push(line); line = w; }
    else line = cand;
  }
  if (line) out.push(line);
  return out;
}

// pdf-lib's standard fonts hold WinAnsi only - strip what Helvetica cannot
// encode (a name or reason typed with an emoji must not kill the download)
function safe(s, font) {
  let out = "";
  for (const ch of String(s ?? "")) {
    try { font.widthOfTextAtSize(ch, 8); out += ch; } catch { /* dropped */ }
  }
  return out;
}

function fit(s, maxW, font, size) {
  let t = String(s ?? "");
  if (font.widthOfTextAtSize(t, size) <= maxW) return t;
  while (t.length && font.widthOfTextAtSize(`${t}…`, size) > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

export async function renderAttendanceReport(
  { meetingTitle, mandatory, metaLine, office, stats, groups, single, cantAll, noResponse },
  opts = {},
) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo = null;
  try {
    logo = await doc.embedPng(fs.readFileSync(LOGO_PATH));
  } catch {
    // decorative
  }

  let page = null;
  let y = 0;
  let pageNo = 0;

  const text = (s, x, yy, { size = 9, f = font, color = INK } = {}) =>
    page.drawText(safe(s, f), { x, y: yy, size, font: f, color });

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    pageNo++;
    y = PAGE_H - 48;
    if (pageNo === 1) {
      const logoH = 42;
      let tx = L;
      if (logo) {
        const lw = (logo.width / logo.height) * logoH;
        page.drawImage(logo, { x: L, y: y - logoH, width: lw, height: logoH });
        tx = L + lw + 14;
      }
      text("My Life Services, Inc.", tx, y - 12, { size: 8.5, f: bold, color: MUTED });
      text("Meeting Attendance", tx, y - 35, { size: 17, f: bold, color: BRAND });
      y -= logoH + 15;
      text(meetingTitle || "(untitled meeting)", L, y, { size: 12, f: bold });
      y -= 13;
      const sub = [metaLine, mandatory ? "Mandatory" : null, office ? `${office} office` : null]
        .filter(Boolean)
        .join(" · ");
      if (sub) { text(sub, L, y, { size: 8.5, color: MUTED }); y -= 12; }
      // the headline the board shows, as one strip
      text(`Responded ${stats.responded} of ${stats.invited} invited (${stats.pct}%)`, L, y, {
        size: 9, f: bold,
      });
      y -= 12;
      const bits = [
        [`Attending ${stats.going}`, INK],
        [`${stats.cantLabel} ${stats.cantCount}`, INK],
        [`No response ${stats.noResponseCount}`, INK],
      ];
      if (stats.showRollCall) {
        bits.push(
          [`Present ${stats.present}`, GREEN],
          [`Absent ${stats.absent}`, RED],
          [`Unmarked ${stats.unmarked}`, MUTED],
        );
      }
      let bx = L;
      for (const [s, color] of bits) {
        text(s, bx, y, { size: 8.5, f: bold, color });
        bx += bold.widthOfTextAtSize(safe(s, bold), 8.5) + 14;
      }
      y -= 10;
      page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.8, color: GRID });
      y -= 16;
    } else {
      text(`Meeting Attendance · ${meetingTitle || "(untitled meeting)"} (continued)`, L, y, {
        size: 9, f: bold, color: MUTED,
      });
      y -= 22;
    }
  };

  newPage();

  const need = (h) => { if (y - h < 60) newPage(); };

  const tableHead = (cols) => {
    const hH = 16;
    page.drawRectangle({ x: L, y: y - hH + 4, width: R - L, height: hH, color: HEADBG });
    let x = L;
    for (const [label, w, right] of cols) {
      const lx = right ? x + w - 5 - bold.widthOfTextAtSize(label, 7.5) : x + 5;
      text(label, lx, y - 7, { size: 7.5, f: bold, color: WHITE });
      x += w;
    }
    y -= hH + 3;
  };

  const heading = (s, count) => {
    need(64);
    text(s, L, y, { size: 10.5, f: bold, color: BRAND });
    const label = `${count} ${count === 1 ? "person" : "people"}`;
    text(label, R - font.widthOfTextAtSize(label, 8), y, { size: 8, color: MUTED });
    y -= 15;
  };

  const rollCall = { present: ["Present", GREEN], absent: ["Absent", RED] };

  const peopleTable = (cols, rows) => {
    tableHead(cols);
    const rowH = 13.5;
    let alt = false;
    for (const cells of rows) {
      // a long list split across pages keeps its column header
      if (y - rowH < 60) {
        newPage();
        tableHead(cols);
        alt = false;
      }
      if (alt) {
        page.drawRectangle({ x: L, y: y - 4, width: R - L, height: rowH - 1.5, color: ROWALT });
      }
      alt = !alt;
      let x = L;
      cells.forEach((cell, i) => {
        const [, w, right] = cols[i];
        const { s, f = font, color = INK, extra = null } =
          typeof cell === "string" ? { s: cell } : cell;
        const t = fit(safe(s, f), w - 10, f, 8.5);
        const cx = right ? x + w - 5 - f.widthOfTextAtSize(t, 8.5) : x + 5;
        text(t, cx, y, { size: 8.5, f, color });
        // a second run in lighter type - the preferred name beside the legal
        // one. Skipped when the room left in the cell could only fit noise.
        if (extra) {
          const ex = cx + f.widthOfTextAtSize(t, 8.5) + 6;
          const room = x + w - 5 - ex;
          if (room > 24) {
            text(fit(safe(extra, font), room, font, 8), ex, y, {
              size: 8, color: MUTED,
            });
          }
        }
        x += w;
      });
      y -= rowH;
    }
    y -= 8;
  };

  const goingRows = (people) =>
    people.map((p) => {
      const [label, color] = rollCall[p.attended] || ["Unmarked", MUTED];
      return [
        { s: p.name, f: bold, extra: p.preferred },
        { s: p.title || "", color: MUTED },
        { s: label, f: p.attended ? bold : font, color },
      ];
    });

  // every section starts on its own page - Mánu 2026-09-03 - except the first,
  // which rides under the summary header on page 1
  let sections = 0;
  const sectionBreak = () => {
    if (sections++) newPage();
  };

  const session = (s, prefix) => {
    sectionBreak();
    heading(
      [prefix, s.label, s.dateLabel].filter(Boolean).join(" · ") || "Session",
      s.people.length,
    );
    if (!s.people.length) {
      text("No one picked this session.", L, y, { size: 8.5, color: MUTED });
      y -= 18;
      return;
    }
    peopleTable(GOING_COLS, goingRows(s.people));
  };

  if (single) {
    sectionBreak();
    heading("Attending", single.length);
    if (single.length) peopleTable(GOING_COLS, goingRows(single));
    else { text("No one has said they are attending.", L, y, { size: 8.5, color: MUTED }); y -= 18; }
  }
  for (const g of groups || []) {
    // one session per page, so the series label rides each session's heading
    // instead of standing alone above the first one
    for (const s of g.sessions) session(s, g.heading);
    if (g.cant?.length) {
      sectionBreak();
      heading([g.heading, "Can't attend this series"].filter(Boolean).join(" · "), g.cant.length);
      peopleTable(
        CANT_COLS,
        g.cant.map((p) => [
          { s: p.name, f: bold, extra: p.preferred },
          { s: p.title || "", color: MUTED },
          { s: p.reason || "", color: MUTED },
        ]),
      );
    }
  }

  if (cantAll?.length) {
    sectionBreak();
    heading("Can't make it", cantAll.length);
    peopleTable(
      CANT_COLS,
      cantAll.map((p) => [
        { s: p.name, f: bold, extra: p.preferred },
        { s: p.title || "", color: MUTED },
        { s: p.reason || "", color: MUTED },
      ]),
    );
  }

  sectionBreak();
  heading("No response", noResponse.length);
  if (noResponse.length) {
    peopleTable(
      NONE_COLS,
      noResponse.map((p) => [
        { s: p.name, f: bold, extra: p.preferred },
        { s: p.title || "", color: MUTED },
      ]),
    );
  } else {
    text("Everyone invited has responded.", L, y, { size: 8.5, color: MUTED });
    y -= 18;
  }

  need(24);
  const note = stats.showRollCall
    ? "Roll call is recorded per session on the meeting attendance board. Unmarked means attendance was not recorded for that person."
    : "Roll call has not been recorded for this meeting yet.";
  for (const ln of wrapAt(note, R - L, font, 7.5)) {
    text(ln, L, y, { size: 7.5, color: MUTED });
    y -= 9.5;
  }

  const all = doc.getPages();
  all.forEach((pg, i) => {
    pg.drawText(`Page ${i + 1} of ${all.length}`, {
      x: R - 60, y: 28, size: 7.5, font, color: MUTED,
    });
    if (opts.generatedOn) {
      pg.drawText(`Prepared ${opts.generatedOn}`, {
        x: L, y: 28, size: 7.5, font, color: MUTED,
      });
    }
  });

  return { bytes: await doc.save() };
}
