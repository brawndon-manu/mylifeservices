// A small reader for the .xls files QSP exports (BIFF8 inside a Compound File).
//
// Written by hand rather than pulling in SheetJS: the npm build of that is
// deprecated and carries known advisories, and this is the payroll path. Same
// reasoning as `zip.js` - a narrow, readable implementation of exactly the bit
// we need beats a large dependency we can't vouch for.
//
// Deliberately partial. It reads the cell types QSP's reports actually contain
// (shared strings, inline strings, numbers, RK-encoded numbers, blanks) and
// ignores formatting, formulas, charts and everything else. Anything it can't
// read comes back as null rather than throwing, because a cell we don't
// understand must never take down an upload.
//
// IMPORTANT: nothing read through here is allowed to change an hours figure or
// a premium. It labels and corroborates. See `clock.js`.

const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;

// ---------------------------------------------------------------- container

function readCfb(buf) {
  if (buf.readUInt32LE(0) !== 0xe011cfd0 || buf.readUInt32LE(4) !== 0xe11ab1a1) {
    throw new Error("not an .xls file (missing the compound-file signature)");
  }
  const sectorSize = 1 << buf.readUInt16LE(0x1e);
  const numFat = buf.readUInt32LE(0x2c);
  const dirStart = buf.readUInt32LE(0x30);
  const difatStart = buf.readUInt32LE(0x44);
  const numDifat = buf.readUInt32LE(0x48);

  const sectorOffset = (s) => (s + 1) * sectorSize;

  // the DIFAT lists which sectors hold the FAT. the first 109 entries live in
  // the header; beyond that it chains through its own sectors.
  const fatSectors = [];
  for (let i = 0; i < 109 && fatSectors.length < numFat; i++) {
    const s = buf.readUInt32LE(0x4c + i * 4);
    if (s !== FREESECT) fatSectors.push(s);
  }
  let next = difatStart;
  for (let n = 0; n < numDifat && next !== ENDOFCHAIN && next !== FREESECT; n++) {
    const base = sectorOffset(next);
    const perSector = sectorSize / 4 - 1;
    for (let i = 0; i < perSector && fatSectors.length < numFat; i++) {
      const s = buf.readUInt32LE(base + i * 4);
      if (s !== FREESECT) fatSectors.push(s);
    }
    next = buf.readUInt32LE(base + perSector * 4);
  }

  const fat = [];
  for (const s of fatSectors) {
    const base = sectorOffset(s);
    for (let i = 0; i < sectorSize / 4; i++) fat.push(buf.readUInt32LE(base + i * 4));
  }

  const chain = (start, size) => {
    const parts = [];
    let s = start;
    let left = size;
    const seen = new Set();
    while (s !== ENDOFCHAIN && s !== FREESECT && left > 0) {
      if (seen.has(s)) break; // a corrupt chain must not loop forever
      seen.add(s);
      const take = Math.min(sectorSize, left);
      parts.push(buf.subarray(sectorOffset(s), sectorOffset(s) + take));
      left -= take;
      s = fat[s];
      if (s === undefined) break;
    }
    return Buffer.concat(parts);
  };

  // the directory, to find the Workbook stream
  let dirBuf = chain(dirStart, sectorSize * 512);
  for (let i = 0; i + 128 <= dirBuf.length; i++) {
    const e = dirBuf.subarray(i * 128, (i + 1) * 128);
    if (e.length < 128) break;
    const nameLen = e.readUInt16LE(64);
    if (!nameLen || nameLen > 64) continue;
    const name = e.subarray(0, nameLen - 2).toString("utf16le");
    if (name === "Workbook" || name === "Book") {
      return chain(e.readUInt32LE(116), e.readUInt32LE(120));
    }
  }
  throw new Error("no Workbook stream in that .xls");
}

// ------------------------------------------------------------------- strings

// BIFF8 XLUnicodeString: a length, a flags byte, then either compressed
// (one byte per char) or plain UTF-16.
function readString(buf, pos, lenBytes) {
  const cch = lenBytes === 2 ? buf.readUInt16LE(pos) : buf.readUInt8(pos);
  let p = pos + lenBytes;
  const flags = buf.readUInt8(p);
  p += 1;
  const high = (flags & 0x01) !== 0;
  if (flags & 0x08) p += 2; // rich text run count
  if (flags & 0x04) p += 4; // far-east extended data size
  const bytes = high ? cch * 2 : cch;
  const s = high
    ? buf.subarray(p, p + bytes).toString("utf16le")
    : latin(buf.subarray(p, p + bytes));
  return { value: s, next: p + bytes };
}

const latin = (b) => {
  let out = "";
  for (const c of b) out += String.fromCharCode(c);
  return out;
};

// The shared string table spans CONTINUE records, and a single string can be
// cut in half by that boundary. The byte at the start of the next block is a
// FRESH flags byte, and the second half can even switch between compressed and
// wide - so the halves must be stitched with that byte consumed, not simply
// concatenated.
//
// Getting this wrong is quiet and nasty: the counts all still come out right
// and only the strings after the first split are corrupt. It showed up here as
// a report reading 22 employees instead of 55.
function readSst(parts) {
  const buf = Buffer.concat(parts);
  // where each block ends in the concatenated buffer
  const ends = [];
  let acc = 0;
  for (const p of parts) { acc += p.length; ends.push(acc); }
  const boundaryAfter = (pos) => {
    for (const e of ends) if (e > pos) return e;
    return buf.length;
  };

  // read `cch` characters from `pos`, crossing block boundaries as needed
  function readChars(pos, cch, high) {
    let out = "";
    let got = 0;
    while (got < cch && pos < buf.length) {
      const end = boundaryAfter(pos);
      const size = high ? 2 : 1;
      const take = Math.min(cch - got, Math.floor((end - pos) / size));
      if (take > 0) {
        const raw = buf.subarray(pos, pos + take * size);
        out += high ? raw.toString("utf16le") : latin(raw);
        pos += take * size;
        got += take;
      }
      if (got < cch) {
        if (end >= buf.length) break;
        high = (buf.readUInt8(end) & 0x01) !== 0; // the fresh flags byte
        pos = end + 1;
      }
    }
    return { value: out, next: pos };
  }

  const total = buf.readUInt32LE(4);
  const strings = [];
  let p = 8;
  for (let i = 0; i < total && p + 3 <= buf.length; i++) {
    const cch = buf.readUInt16LE(p);
    const flags = buf.readUInt8(p + 2);
    p += 3;
    let runs = 0, extra = 0;
    if (flags & 0x08) { runs = buf.readUInt16LE(p); p += 2; }
    if (flags & 0x04) { extra = buf.readUInt32LE(p); p += 4; }
    const r = readChars(p, cch, (flags & 0x01) !== 0);
    strings.push(r.value);
    p = r.next + runs * 4 + extra;
  }
  return strings;
}

// RK numbers pack a float or a scaled integer into 4 bytes
function rkValue(v) {
  const isInt = (v & 0x02) !== 0;
  const div100 = (v & 0x01) !== 0;
  let n;
  if (isInt) {
    n = v >> 2;
  } else {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(0, 0);
    b.writeInt32LE(v & 0xfffffffc, 4);
    n = b.readDoubleLE(0);
  }
  return div100 ? n / 100 : n;
}

// --------------------------------------------------------------------- sheet

const REC = {
  BOF: 0x0809, EOF: 0x000a, SST: 0x00fc, CONTINUE: 0x003c,
  LABELSST: 0x00fd, LABEL: 0x0204, NUMBER: 0x0203, RK: 0x027e,
  MULRK: 0x00bd, BLANK: 0x0201, MULBLANK: 0x00be, BOOLERR: 0x0205,
  FORMULA: 0x0006, STRING: 0x0207,
};

// Returns the FIRST worksheet as an array of rows, each an array of cells.
// QSP's reports are always one sheet, so that's all this needs to do.
export function readXls(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const wb = readCfb(buf);

  // pass 1: shared strings
  const sstParts = [];
  let inSst = false;
  let p = 0;
  while (p + 4 <= wb.length) {
    const type = wb.readUInt16LE(p);
    const len = wb.readUInt16LE(p + 2);
    const data = wb.subarray(p + 4, p + 4 + len);
    if (type === REC.SST) { sstParts.push(data); inSst = true; }
    else if (type === REC.CONTINUE && inSst) sstParts.push(data);
    else if (type !== REC.CONTINUE) inSst = false;
    p += 4 + len;
  }
  const sst = sstParts.length ? readSst(sstParts) : [];

  // pass 2: cells
  const cells = new Map(); // "r,c" -> value
  let maxRow = -1, maxCol = -1;
  const put = (r, c, v) => {
    cells.set(`${r},${c}`, v);
    if (r > maxRow) maxRow = r;
    if (c > maxCol) maxCol = c;
  };

  p = 0;
  let sheetsSeen = 0;
  let lastFormulaCell = null;
  while (p + 4 <= wb.length) {
    const type = wb.readUInt16LE(p);
    const len = wb.readUInt16LE(p + 2);
    const d = wb.subarray(p + 4, p + 4 + len);
    p += 4 + len;

    if (type === REC.BOF && len >= 4 && d.readUInt16LE(2) === 0x0010) {
      sheetsSeen++;
      if (sheetsSeen > 1) break; // first worksheet only
    }
    if (sheetsSeen === 0) continue;

    try {
      if (type === REC.LABELSST) {
        put(d.readUInt16LE(0), d.readUInt16LE(2), sst[d.readUInt32LE(6)] ?? null);
      } else if (type === REC.LABEL) {
        put(d.readUInt16LE(0), d.readUInt16LE(2), readString(d, 6, 2).value);
      } else if (type === REC.NUMBER) {
        put(d.readUInt16LE(0), d.readUInt16LE(2), d.readDoubleLE(6));
      } else if (type === REC.RK) {
        put(d.readUInt16LE(0), d.readUInt16LE(2), rkValue(d.readInt32LE(6)));
      } else if (type === REC.MULRK) {
        const r = d.readUInt16LE(0);
        const first = d.readUInt16LE(2);
        const n = (len - 6) / 6;
        for (let i = 0; i < n; i++) put(r, first + i, rkValue(d.readInt32LE(6 + i * 6)));
      } else if (type === REC.FORMULA) {
        // a formula with a string result is followed by a STRING record
        lastFormulaCell = [d.readUInt16LE(0), d.readUInt16LE(2)];
        const isStr = d.readUInt16LE(12) === 0xffff && d.readUInt8(6) === 0;
        if (!isStr) { put(lastFormulaCell[0], lastFormulaCell[1], d.readDoubleLE(6)); lastFormulaCell = null; }
      } else if (type === REC.STRING && lastFormulaCell) {
        put(lastFormulaCell[0], lastFormulaCell[1], readString(d, 0, 2).value);
        lastFormulaCell = null;
      }
    } catch {
      // an unreadable cell is skipped, never fatal
    }
  }

  const rows = [];
  for (let r = 0; r <= maxRow; r++) {
    const row = [];
    for (let c = 0; c <= maxCol; c++) row.push(cells.get(`${r},${c}`) ?? null);
    rows.push(row);
  }
  return rows;
}

// Find the header row (the first row with several non-empty cells) and return
// the sheet as objects keyed by column name. QSP puts a title block above every
// report, so the header is never row 0.
export function readXlsTable(bytes, { minCols = 4 } = {}) {
  const rows = readXls(bytes);
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
