// shared drawing engine for the admin PDF reports (forms, acknowledgments):
// page state, masthead, stat tiles, paginating tables. one visual language for
// every report the portal prints.
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { marked } from "marked";

const LOGO_PATH = path.join(process.cwd(), "public", "logo", "MLSlogo.png");

export const PAGE_W = 612;
export const PAGE_H = 792;
export const L = 40;
export const R = PAGE_W - 40;

export const INK = rgb(0.05, 0.05, 0.05);
export const MUTED = rgb(0.42, 0.47, 0.53);
export const BRAND = rgb(0.086, 0.325, 0.529);
export const HEADBG = rgb(0.106, 0.298, 0.404);
export const ROWALT = rgb(0.965, 0.976, 0.984);
export const GRID = rgb(0.75, 0.79, 0.83);
export const WHITE = rgb(1, 1, 1);
export const AMBER = rgb(0.42, 0.32, 0.06);
export const AMBERBG = rgb(0.992, 0.969, 0.894);
export const STATBG = rgb(0.878, 0.949, 0.961);

// Helvetica is WinAnsi-only; an emoji in an announcement body would crash the
// whole report, so anything outside the encodable set is dropped up front.
const WINANSI_OK =
  /[^\t\n\r\x20-\xFF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]/g;
export function sanitize(str) {
  return String(str ?? "").replace(WINANSI_OK, "");
}
// marked's lexer hands inline text back HTML-escaped; a report is not HTML
function decodeEntities(str) {
  return String(str ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&");
}

// clip with an ellipsis instead of running through the next column
export function clip(str, maxW, font, size) {
  let s = sanitize(str);
  if (font.widthOfTextAtSize(s, size) <= maxW) return s;
  while (s.length > 1 && font.widthOfTextAtSize(s + "…", size) > maxW) {
    s = s.slice(0, -1);
  }
  return s + "…";
}

// greedy word wrap for body text
export function wrap(str, maxW, font, size) {
  const out = [];
  let line = "";
  for (const w of sanitize(str).split(/\s+/)) {
    const cand = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(cand, size) > maxW && line) {
      out.push(line);
      line = w;
    } else {
      line = cand;
    }
  }
  if (line) out.push(line);
  return out;
}

// shared page state: st.page / st.y move together through every draw helper
export async function makeSt() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try {
    logo = await doc.embedPng(fs.readFileSync(LOGO_PATH));
  } catch {
    // decorative
  }
  // the extra faces only body text uses (italic, bold-italic, code)
  const oblique = await doc.embedFont(StandardFonts.HelveticaOblique);
  const boldOblique = await doc.embedFont(StandardFonts.HelveticaBoldOblique);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const st = { doc, font, bold, oblique, boldOblique, mono, logo, page: null, y: 0 };
  st.text = (s, x, yy, { size = 9, f = font, color = INK } = {}) =>
    st.page.drawText(sanitize(s), { x, y: yy, size, font: f, color });
  st.addPage = () => {
    st.page = doc.addPage([PAGE_W, PAGE_H]);
    st.y = PAGE_H - 48;
  };
  return st;
}

// logo + company line + big brand title, page 1 only
export function drawMasthead(st, title) {
  const logoH = 42;
  let tx = L;
  if (st.logo) {
    const lw = (st.logo.width / st.logo.height) * logoH;
    st.page.drawImage(st.logo, { x: L, y: st.y - logoH, width: lw, height: logoH });
    tx = L + lw + 14;
  }
  st.text("My Life Services, Inc.", tx, st.y - 12, { size: 8.5, f: st.bold, color: MUTED });
  st.text(clip(title, R - tx, st.bold, 17), tx, st.y - 35, { size: 17, f: st.bold, color: BRAND });
  st.y -= logoH + 15;
}

// the counts as tiles, so the state reads before the list does
export function drawTiles(st, tiles) {
  const gap = 8;
  const tileW = (R - L - gap * (tiles.length - 1)) / tiles.length;
  const tileH = 40;
  let tx = L;
  for (const t of tiles) {
    const amber = t.amber && String(t.n) !== "0";
    st.page.drawRectangle({
      x: tx, y: st.y - tileH + 6, width: tileW, height: tileH,
      color: amber ? AMBERBG : STATBG,
    });
    const ink = amber ? AMBER : INK;
    st.text(t.n, tx + 8, st.y - 14, { size: t.small ? 10 : 16, f: st.bold, color: ink });
    st.text(t.label, tx + 8, st.y - 28, { size: 7.5, color: amber ? AMBER : MUTED });
    tx += tileW + gap;
  }
  st.y -= tileH + 10;
  st.page.drawLine({ start: { x: L, y: st.y }, end: { x: R, y: st.y }, thickness: 0.8, color: GRID });
  st.y -= 18;
}

function drawHead(st, cols) {
  const hH = 18;
  st.page.drawRectangle({ x: L, y: st.y - hH + 4, width: R - L, height: hH, color: HEADBG });
  let x = L;
  for (const [label, w, numeric] of cols) {
    const lx = numeric ? x + w - 5 - st.bold.widthOfTextAtSize(label, 7.5) : x + 5;
    st.text(label, lx, st.y - 8, { size: 7.5, f: st.bold, color: WHITE });
    x += w;
  }
  st.y -= hH + 4;
}

// a paginating table. cells() maps a row to strings; muted() marks the rows
// drawn quiet; contTitle heads the run-over pages. drawCell, when given, gets
// first shot at each cell (st, row, colIndex, x, baselineY) - returning true
// means it drew something (an icon) and the text for that cell is skipped.
export function drawTable(st, cols, rows, { cells, muted = () => false, contTitle, drawCell }) {
  drawHead(st, cols);
  const rowH = 15;
  let alt = false;
  rows.forEach((r, i) => {
    if (st.y < 60) {
      st.addPage();
      st.text(contTitle, L, st.y, { size: 9, f: st.bold, color: MUTED });
      st.y -= 20;
      drawHead(st, cols);
      alt = false;
    }
    if (alt) {
      st.page.drawRectangle({ x: L, y: st.y - 4, width: R - L, height: rowH - 2, color: ROWALT });
    }
    alt = !alt;
    const quiet = muted(r);
    let x = L;
    cells(r, i).forEach((c, ci) => {
      const [, w, numeric] = cols[ci];
      if (drawCell?.(st, r, ci, x, st.y)) {
        x += w;
        return;
      }
      const s = clip(c, w - 10, st.font, 8.5);
      const cx = numeric ? x + w - 5 - st.font.widthOfTextAtSize(s, 8.5) : x + 5;
      st.text(s, cx, st.y, { size: 8.5, color: quiet ? MUTED : INK });
      x += w;
    });
    st.y -= rowH;
  });
}

// ---------- body text: the announcement itself, laid out ----------
// posts are written in markdown and the portal renders them (lib/markdown.js);
// printing raw ## and ** on a report reads as a glitch, so the same markdown
// is parsed here (marked's lexer, breaks:true like the portal) and typeset:
// headings, bold/italic, bullets, code, quotes. images become an [image] mark.

// inline tokens -> flat styled runs
function inlineRuns(tokens, style = {}) {
  const runs = [];
  for (const t of tokens || []) {
    switch (t.type) {
      case "strong":
        runs.push(...inlineRuns(t.tokens, { ...style, bold: true }));
        break;
      case "em":
        runs.push(...inlineRuns(t.tokens, { ...style, italic: true }));
        break;
      case "del":
      case "link":
        runs.push(...inlineRuns(t.tokens, style));
        break;
      case "codespan":
        runs.push({ text: decodeEntities(t.text), ...style, code: true });
        break;
      case "br":
        runs.push({ br: true });
        break;
      case "image":
        runs.push({ text: t.text ? `[image: ${decodeEntities(t.text)}]` : "[image]", ...style });
        break;
      case "escape":
        runs.push({ text: decodeEntities(t.text), ...style });
        break;
      case "text":
        if (t.tokens?.length) {
          runs.push(...inlineRuns(t.tokens, style));
        } else {
          // the portal renders single newlines as hard breaks (breaks:true);
          // a text token can still carry them raw, so they break here too
          decodeEntities(t.text).split("\n").forEach((part, i) => {
            if (i) runs.push({ br: true });
            if (part) runs.push({ text: part, ...style });
          });
        }
        break;
      default:
        if (t.raw) runs.push({ text: decodeEntities(t.raw), ...style });
    }
  }
  return runs;
}

function runFont(st, w) {
  if (w.code) return st.mono;
  if (w.bold && w.italic) return st.boldOblique;
  if (w.bold) return st.bold;
  if (w.italic) return st.oblique;
  return st.font;
}

export function drawBody(st, content, { maxLines = 40, contTitle = "" } = {}) {
  let blocks;
  try {
    blocks = marked.lexer(String(content ?? ""), { breaks: true });
  } catch {
    blocks = [{ type: "paragraph", tokens: [{ type: "text", text: String(content ?? "") }] }];
  }

  let left = maxLines;
  let truncated = false;
  const ensure = () => {
    if (st.y < 60) {
      st.addPage();
      if (contTitle) {
        st.text(contTitle, L, st.y, { size: 9, f: st.bold, color: MUTED });
        st.y -= 20;
      }
    }
  };

  // wrap styled runs into lines and draw them; prefix ("•", "3.") hangs in the
  // indent of the first line
  const emit = (runs, { size = 8.5, lineH = 10.5, color = MUTED, indent = 6, prefix = "" } = {}) => {
    // `glue` marks a word that follows its neighbour with no whitespace in the
    // source ("**answers**." -> "answers" + glued ".") so punctuation hugs the
    // word it belongs to across style boundaries
    const words = [];
    let prevTrailing = true;
    for (const r of runs) {
      if (r.br) {
        words.push({ br: true });
        prevTrailing = true;
        continue;
      }
      const text = String(r.text ?? "");
      const parts = sanitize(text).split(/\s+/).filter(Boolean);
      parts.forEach((t, idx) => {
        const glue =
          idx === 0 && !prevTrailing && !/^\s/.test(text) &&
          words.length > 0 && !words[words.length - 1].br;
        words.push({ t, glue, bold: r.bold, italic: r.italic, code: r.code });
      });
      if (parts.length) prevTrailing = /\s$/.test(text);
      else if (text) prevTrailing = true;
    }
    const maxW = R - L - indent;
    const spaceW = st.font.widthOfTextAtSize(" ", size);
    let line = [];
    let lineW = 0;
    const flush = () => {
      if (truncated) return;
      if (left <= 0) {
        truncated = true;
        return;
      }
      ensure();
      let x = L + indent;
      if (prefix && !prefix.done) {
        st.text(prefix, L + indent - st.font.widthOfTextAtSize(`${prefix} `, size), st.y, {
          size, color,
        });
        prefix = { done: true };
      }
      // consecutive same-style words draw as ONE string with real spaces -
      // word-by-word ops leave only positional gaps, and text extraction /
      // copy-paste then reads "You are" as "Youare". a segment boundary gets a
      // trailing space glyph for the same reason, unless the next word glues.
      let i = 0;
      while (i < line.length) {
        const f = runFont(st, line[i]);
        let j = i;
        let segment = "";
        while (j < line.length && runFont(st, line[j]) === f) {
          segment += (j === i || line[j].glue ? "" : " ") + line[j].t;
          j++;
        }
        if (j < line.length && !line[j].glue) segment += " ";
        st.text(segment, x, st.y, { size, f, color });
        x += f.widthOfTextAtSize(segment, size);
        i = j;
      }
      st.y -= lineH;
      left--;
      line = [];
      lineW = 0;
    };
    for (const w of words) {
      if (truncated) return;
      if (w.br) {
        flush();
        continue;
      }
      const wW = runFont(st, w).widthOfTextAtSize(w.t, size);
      const gap = w.glue ? 0 : spaceW;
      if (line.length && lineW + gap + wW > maxW) flush();
      line.push(w);
      lineW += (line.length > 1 ? gap : 0) + wW;
    }
    if (line.length) flush();
  };

  const list = (t, indent) => {
    let n = typeof t.start === "number" && t.start > 0 ? t.start : 1;
    for (const item of t.items) {
      if (truncated) return;
      const prefix = t.ordered ? `${n++}.` : "•";
      let first = true;
      for (const b of item.tokens || []) {
        if (truncated) return;
        if (b.type === "list") {
          list(b, indent + 12);
        } else if (b.tokens?.length || b.text) {
          emit(inlineRuns(b.tokens?.length ? b.tokens : [{ type: "text", text: b.text }]), {
            indent,
            prefix: first ? prefix : "",
          });
          first = false;
        }
      }
    }
  };

  for (const t of blocks) {
    if (truncated) break;
    switch (t.type) {
      case "heading": {
        // a heading stranded at the page foot reads as its own orphan
        if (st.y < 100) {
          st.addPage();
          if (contTitle) {
            st.text(contTitle, L, st.y, { size: 9, f: st.bold, color: MUTED });
            st.y -= 20;
          }
        }
        st.y -= 3;
        const size = t.depth <= 1 ? 11.5 : t.depth === 2 ? 10.5 : 9.5;
        emit(inlineRuns(t.tokens, { bold: true }), { size, lineH: size + 3, color: INK });
        st.y -= 1;
        break;
      }
      case "paragraph":
        emit(inlineRuns(t.tokens));
        st.y -= 3;
        break;
      case "list":
        list(t, 20);
        st.y -= 3;
        break;
      case "blockquote":
        for (const b of t.tokens || []) {
          if (b.tokens?.length || b.text) {
            emit(inlineRuns(b.tokens?.length ? b.tokens : [{ type: "text", text: b.text }]), {
              indent: 20,
            });
          }
        }
        st.y -= 3;
        break;
      case "code":
        for (const ln of String(t.text || "").split("\n")) {
          if (truncated) break;
          emit([{ text: ln || " ", code: true }], { size: 7.5, lineH: 9.5 });
        }
        st.y -= 3;
        break;
      case "hr":
        ensure();
        st.page.drawLine({
          start: { x: L + 6, y: st.y + 3 },
          end: { x: R - 6, y: st.y + 3 },
          thickness: 0.6,
          color: GRID,
        });
        st.y -= 8;
        break;
      case "table": {
        const rows = [t.header, ...(t.rows || [])];
        for (const row of rows) {
          if (truncated) break;
          emit(inlineRuns(row.flatMap((c, i) => [
            ...(i ? [{ type: "text", text: " · " }] : []),
            ...(c.tokens?.length ? c.tokens : [{ type: "text", text: c.text }]),
          ])));
        }
        st.y -= 3;
        break;
      }
      case "space":
        break;
      default:
        if (t.raw?.trim()) emit([{ text: t.raw }]);
    }
  }

  if (truncated) {
    ensure();
    st.text("… (shortened - the full post is in the portal)", L + 6, st.y, {
      size: 7.5, color: MUTED,
    });
    st.y -= 12;
  }
  st.y -= 6;
}

export async function finish(st, opts = {}) {
  const all = st.doc.getPages();
  all.forEach((pg, i) => {
    pg.drawText(`Page ${i + 1} of ${all.length}`, {
      x: R - 60, y: 28, size: 7.5, font: st.font, color: MUTED,
    });
    if (opts.generatedOn) {
      pg.drawText(`Prepared ${opts.generatedOn}`, {
        x: L, y: 28, size: 7.5, font: st.font, color: MUTED,
      });
    }
  });
  return { bytes: await st.doc.save() };
}
