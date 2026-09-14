// ONE NAME ON ONE CERTIFICATE.
//
// Mánu 2026-09-13: "it should take names and a certificate pdf and hopefully we
// can make it so we choose where it goes for the name?" The place is picked
// once by clicking the rendered template and stored with the batch, so every
// name in a run lands identically.
//
// COORDINATES ARE PDF POINTS FROM THE BOTTOM-LEFT, which is what pdf-lib draws
// in. The picker works in screen pixels at whatever width it happens to be, so
// it converts before saving - storing pixels would bake that width into the
// record and move every name the next time the layout changed.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const DEFAULT_SIZE = 28;

// THE DATE AS A CERTIFICATE SAYS IT. The picker hands over an ISO string
// ("2026-09-13") because that is unambiguous to store and to sort; nobody
// prints a date that way. Read as California's calendar day rather than as an
// instant, so a date never slides to the day before on a server in another
// zone.
export function printedDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  // anything already typed as words or slashes is left exactly as it is
  if (!m) return raw;
  const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(at);
}
export const MIN_SIZE = 8;
export const MAX_SIZE = 96;

// A NAME IS CENTRED ON THE POINT unless told otherwise. Certificates put the
// name in the middle of a line, and asking somebody to find the left edge of a
// centred name by eye is asking them to get it wrong.
export function placeName({ text, x, y, size, align, font, pageWidth }) {
  const width = font.widthOfTextAtSize(text, size);
  let left = align === "left" ? x : x - width / 2;
  // never off the page: a name longer than its slot moves in rather than
  // hanging off the edge where it would be silently cut
  const margin = 4;
  if (left < margin) left = margin;
  if (left + width > pageWidth - margin) left = Math.max(margin, pageWidth - margin - width);
  return { x: left, y, width };
}

// the size that keeps a long name inside the width it was given. Certificates
// are printed, so a name that overflows is a reprint.
export function fitSize({ text, font, size, maxWidth }) {
  let s = Math.min(Math.max(size, MIN_SIZE), MAX_SIZE);
  while (s > MIN_SIZE && font.widthOfTextAtSize(text, s) > maxWidth) s -= 1;
  return s;
}

// one piece of text, fitted and placed. Shared so the name and the date cannot
// drift apart in how they land.
function stamp({ target, text, x, y, size, align, font }) {
  const pageWidth = target.getWidth();
  // the usable width around the point, so a long name shrinks instead of
  // running into the border art
  const room = align === "left" ? pageWidth - x - 24 : Math.min(x, pageWidth - x) * 2 - 24;
  const fitted = fitSize({ text, font, size, maxWidth: Math.max(60, room) });
  const at = placeName({ text, x, y, size: fitted, align, font, pageWidth });
  target.drawText(text, { x: at.x, y, size: fitted, font, color: rgb(0.06, 0.09, 0.16) });
}

// `date` is drawn only where the batch was given a place for it - most
// templates print their own, and a batch with no placement still RECORDS each
// person's date without putting it on the page.
export async function renderCertificate(templateBytes, {
  name, page = 0, x, y, size = DEFAULT_SIZE, align = "center",
  date = null, datePage = null, dateX = null, dateY = null, dateSize = 14, dateAlign = "center",
}) {
  const doc = await PDFDocument.load(templateBytes);
  const pages = doc.getPages();
  const pick = (n) => pages[Math.min(Math.max(0, Number(n) || 0), pages.length - 1)];
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const plain = await doc.embedFont(StandardFonts.Helvetica);

  const text = String(name || "").trim();
  if (text) stamp({ target: pick(page), text, x, y, size, align, font });

  const when = printedDate(date);
  if (when && dateX != null && dateY != null) {
    // the date is not a heading - it goes on in the plain face
    stamp({
      target: pick(datePage ?? page),
      text: when,
      x: dateX,
      y: dateY,
      size: dateSize || 14,
      align: dateAlign || "center",
      font: plain,
    });
  }
  return Buffer.from(await doc.save());
}

// every certificate in a run, as one file to print
export async function mergeCertificates(list) {
  const out = await PDFDocument.create();
  for (const bytes of list) {
    const src = await PDFDocument.load(bytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  return Buffer.from(await out.save());
}
