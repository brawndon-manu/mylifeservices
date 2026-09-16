// THE APPROVAL, STAMPED ONTO THE SHEET: the drawn signature, the date, and
// since 2026-09-15 the approver's name. Mánu: "add to the timesheets who the
// person signing off on it is ... automatically appends admin name (legal name)
// in a field for their name". Pulled out of the action so it can be tested on
// a rendered sheet rather than only pressed in production.
//
// GEOMETRY COMES FROM THE ANCHOR. `rect` is the signature line the anchor read
// off the bytes (or the stored fallback), so everything here is relative to it
// and lands the same on a sheet rendered today and on one rendered in August.
// The label column: "Approval Signature:" sits 94pt left of the signature rect
// in both layouts of render.js. The name line: 20pt above the rect's bottom,
// which clears the 42pt admin box with room and stays under the tick row in
// the 58pt corrections box.
import { StandardFonts } from "pdf-lib";

export const APPROVED_BY_LABEL = "Approved by:";
const LABEL_DX = 94;
const NAME_DY = 20;
const NAME_SIZE = 8.5;

// LEGAL NAME, NOT PREFERRED. Documents print the name on the account (`name`);
// the preferred name is for screens. The caller hands in `user.name`.
export async function stampApproval(doc, { rect, signatureDataUrl, approvedOn, approvedBy = null }) {
  const page = doc.getPages()[rect.pageIndex] || doc.getPages()[0];
  const png = await doc.embedPng(signatureDataUrl);
  // fit inside the line without distorting the drawing
  const k = Math.min(rect.width / png.width, rect.height / png.height);
  const w = png.width * k;
  const h = png.height * k;
  page.drawImage(png, {
    x: rect.x + (rect.width - w) / 2,
    y: rect.y + (rect.height - h) / 2,
    width: w,
    height: h,
  });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(approvedOn, { x: rect.dateX + 4, y: rect.dateY + 4, size: 9, font });
  const name = String(approvedBy || "").trim();
  if (name) {
    page.drawText(APPROVED_BY_LABEL, { x: rect.x - LABEL_DX, y: rect.y + NAME_DY, size: NAME_SIZE, font });
    page.drawText(name, { x: rect.x, y: rect.y + NAME_DY, size: NAME_SIZE, font });
  }
  return { name: name || null, nameY: name ? rect.y + NAME_DY : null };
}
