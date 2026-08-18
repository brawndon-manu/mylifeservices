// A small reader for .xlsx workbooks.
//
// Same reasoning as `xls.js` and `zip.js`: a narrow readable implementation of
// exactly the bit we need, rather than a large dependency we can't vouch for.
// The two formats have nothing in common, though. An .xls is BIFF8 records
// inside a compound file; an .xlsx is a plain zip of XML, so this is a zip
// reader and two small XML scrapes on top of it.
//
// Deliberately partial. It reads the first worksheet, shared strings, inline
// strings and numbers, and it ignores styles, formulas, charts, drawings and
// everything else. A cell it can't read comes back missing rather than
// throwing, because one odd cell must never take down an upload.

import { inflateRawSync } from "node:zlib";

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;

// ------------------------------------------------------------------- zip

// walk back from the end for the end-of-central-directory record. it's the only
// fixed thing in a zip whose position you can't compute, because the comment
// that follows it is variable length. 64KB is the most that comment can be.
function findEocd(buf) {
  const floor = Math.max(0, buf.length - 0xffff - 22);
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

// name -> Buffer, for every entry in the archive. these files are small (the
// rest report is 18KB) so reading the whole thing up front beats seeking.
function readZip(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error("not an .xlsx file (no zip end record)");

  const count = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  const files = new Map();

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(pos) !== CENTRAL_SIG) break;
    const method = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.toString("utf8", pos + 46, pos + 46 + nameLen);

    // the local header repeats the name and carries its own extra field, and
    // the two extra fields are allowed to differ in length, so the data offset
    // has to be measured from the local header rather than the central one.
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(start, start + compressedSize);

    try {
      files.set(name, method === 0 ? raw : inflateRawSync(raw));
    } catch {
      // an entry we can't inflate is one we skip. the parts we actually read
      // are checked for by name below, so a bad drawing or theme costs nothing.
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ------------------------------------------------------------------- xml

const ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decode(s) {
  return String(s)
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m])
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

// every <si> in sharedStrings.xml, in order, because a cell refers to one by
// index. a string split across several runs arrives as several <t> and has to
// be joined back up, which is how "Rest Report Checkbox" comes through whole.
function readSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  for (const si of xml.toString("utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let text = "";
    for (const t of si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += t[1];
    out.push(decode(text));
  }
  return out;
}

// "B12" -> "B". the row number is already known from the <row> around it.
function columnOf(ref) {
  const m = /^([A-Z]+)/.exec(ref || "");
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- reading

// which worksheet part is the first sheet. workbook.xml names the sheets in
// order and points at them by relationship id, so the two files have to be read
// together to get the first one rather than whichever sorts first by filename.
function firstSheetPath(files) {
  const workbook = files.get("xl/workbook.xml")?.toString("utf8") || "";
  const rel = /<sheet[^>]*r:id="([^"]+)"/.exec(workbook)?.[1];
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") || "";
  if (rel) {
    const target = new RegExp(`<Relationship[^>]*Id="${rel}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
    if (target) return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  // no usable relationship. fall back to the conventional path, then to the
  // first worksheet part in the archive.
  if (files.has("xl/worksheets/sheet1.xml")) return "xl/worksheets/sheet1.xml";
  return [...files.keys()].find((n) => n.startsWith("xl/worksheets/") && n.endsWith(".xml")) || null;
}

// Rows of { row, cells }, where cells is a plain object keyed by column letter.
// Values are strings or numbers. An empty cell is absent rather than "", so a
// caller can tell "nothing there" from "they typed a blank".
export function readXlsxRows(bytes) {
  const files = readZip(bytes);
  const path = firstSheetPath(files);
  if (!path || !files.has(path)) throw new Error("that .xlsx has no readable worksheet");

  const shared = readSharedStrings(files.get("xl/sharedStrings.xml"));
  const xml = files.get(path).toString("utf8");
  const rows = [];

  for (const r of xml.matchAll(/<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    // a self-closing <c/> is an empty styled cell and carries no value, so the
    // two endings are matched separately. written as one pattern with a shared
    // ending it swallows the next cell whole and the columns come out shifted.
    for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1] || "";
      const inner = c[2] || "";
      const col = columnOf(/\br="([A-Z]+\d+)"/.exec(attrs)?.[1]);
      if (!col) continue;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];

      let value;
      if (type === "inlineStr") {
        let text = "";
        for (const t of inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += t[1];
        value = decode(text);
      } else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (raw === undefined) continue;
        if (type === "s") value = shared[Number(raw)];
        else if (type === "str" || type === "e") value = decode(raw);
        else if (type === "b") value = raw === "1";
        else {
          const n = Number(raw);
          value = Number.isFinite(n) ? n : decode(raw);
        }
      }
      if (value !== undefined) cells[col] = value;
    }
    rows.push({ row: Number(r[1]), cells });
  }
  return rows;
}

// Excel keeps dates as a day count from 1899-12-30, and this report writes them
// that way (46237 is the 3rd of August 2026). Returned as the "08/03/26" the
// rest of the timesheet code passes around.
export function excelDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n < 1) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${String(d.getUTCFullYear()).slice(2)}`;
}
