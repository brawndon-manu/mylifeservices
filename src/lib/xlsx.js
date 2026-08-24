// A small reader for .xlsx files (Office Open XML inside a zip).
//
// The sibling of xls.js, for the OTHER format QSP and HR hand us: xls.js reads
// BIFF8 inside a Compound File, this reads the sheet XML inside a zip. Written
// by hand for the same reason - the npm build of SheetJS is deprecated and
// carries known advisories, and a narrow, readable implementation of exactly
// the bit we need beats a large dependency we can't vouch for.
//
// Deliberately partial. It reads one worksheet's cells of the kinds these
// rosters actually contain (shared strings, inline strings, plain values) and
// ignores styles, formulas, charts and everything else. Anything it can't read
// comes back as null rather than throwing, because a cell we don't understand
// must never take down an upload.
import { inflateRawSync } from "node:zlib";

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;

// ------------------------------------------------------------------- zip

// the central directory: every file in the archive, with where its bytes live.
// Found from the End Of Central Directory record, which sits at the very end of
// the file behind an optional comment - hence the backwards scan.
function zipEntries(buf) {
  let at = buf.length - 22;
  const floor = Math.max(0, buf.length - 22 - 65535);
  while (at >= floor && buf.readUInt32LE(at) !== EOCD_SIG) at--;
  if (at < floor || at < 0) throw new Error("not an .xlsx file (no zip directory)");

  const count = buf.readUInt16LE(at + 10);
  let off = buf.readUInt32LE(at + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== CENTRAL_SIG) break;
    const method = buf.readUInt16LE(off + 10);
    const compressedSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    entries.set(name, { method, compressedSize, localOff });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// one file's bytes. The local header repeats the name and extra field with its
// own lengths, which are allowed to differ from the central directory's - so
// the data offset is computed from the local copy, never assumed.
function zipRead(buf, entry) {
  const nameLen = buf.readUInt16LE(entry.localOff + 26);
  const extraLen = buf.readUInt16LE(entry.localOff + 28);
  const start = entry.localOff + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) return inflateRawSync(data);
  return null; // a compression method we don't know; treat the part as absent
}

// ------------------------------------------------------------------- xml

// just enough entity decoding for spreadsheet text
function decode(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// every <t> inside a fragment, joined - a shared string with formatting runs is
// several <t>s that read as one value
function textOf(fragment) {
  let out = "";
  for (const m of String(fragment).matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) out += decode(m[1]);
  return out;
}

function sharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  for (const m of xml.matchAll(/<si[\s>]([\s\S]*?)<\/si>/g)) out.push(textOf(m[1]));
  return out;
}

// "B7" -> 1. Only the letters matter here; the row is taken from <row> order.
function colIndex(ref) {
  let n = 0;
  for (const ch of ref) {
    if (ch < "A" || ch > "Z") break;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

// ------------------------------------------------------------------ entry

// every row of the first worksheet, as dense string arrays. nulls for cells we
// can't read, empty strings for cells that are genuinely empty.
export function readXlsx(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const entries = zipEntries(buf);

  const sheetName =
    [...entries.keys()]
      .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort()[0] || null;
  if (!sheetName) throw new Error("not an .xlsx file (no worksheet inside)");

  const sst = entries.has("xl/sharedStrings.xml")
    ? sharedStrings(zipRead(buf, entries.get("xl/sharedStrings.xml"))?.toString("utf8"))
    : [];
  const sheet = zipRead(buf, entries.get(sheetName))?.toString("utf8");
  if (!sheet) throw new Error("worksheet could not be read");

  const rows = [];
  for (const rowMatch of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cell of rowMatch[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1];
      const body = cell[2] || "";
      const ref = attrs.match(/\br="([A-Z]+)\d+"/);
      const type = attrs.match(/\bt="(\w+)"/)?.[1] || "";
      const col = ref ? colIndex(ref[1]) : row.length;

      let value = null;
      if (type === "inlineStr") value = textOf(body);
      else {
        const v = body.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        if (!v) value = "";
        else if (type === "s") value = sst[Number(v[1])] ?? null;
        else value = decode(v[1]);
      }
      row[col] = value;
    }
    // dense: an untouched index is an empty cell, not a hole
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = "";
    rows.push(row);
  }
  return rows;
}

// same shape as readXlsTable in xls.js, so a caller can take either export
// without caring which decade the file format is from: find the header row,
// then one object per data row keyed by header text.
export function readXlsxTable(bytes, { minCols = 4 } = {}) {
  const rows = readXlsx(bytes);
  let headerAt = -1;
  for (let i = 0; i < rows.length; i++) {
    const filled = rows[i].filter((v) => v != null && String(v).trim()).length;
    if (filled >= minCols) { headerAt = i; break; }
  }
  if (headerAt < 0) return { headers: [], rows: [] };

  const headers = rows[headerAt].map((h) => (h == null ? "" : String(h).trim()));
  const out = [];
  for (let i = headerAt + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r.some((v) => v != null && String(v).trim())) continue;
    const o = {};
    headers.forEach((h, c) => { if (h) o[h] = r[c]; });
    out.push(o);
  }
  return { headers: headers.filter(Boolean), rows: out };
}
