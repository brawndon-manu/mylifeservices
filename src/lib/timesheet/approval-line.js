// THE APPROVAL LINE, IN ONE PLACE. Mánu 2026-09-15, after approving his own
// sheet: "it should be Approved by: ____ Approval Signature ____ Date: ____
// ... just like the date it should just auto fill in. in our case it would be
// whichever admin is signing off".
//
// The renderer draws the three labels and their fields from these offsets, and
// the anchor reads them back off the signed bytes by the same offsets, so the
// two cannot drift the way the stored rect once did (22.5pt on every sheet of
// 08/16-08/31). Offsets are points from the page's left margin L. The label
// widths are Helvetica at 8.5pt, rounded up: "Approved by:" 50.1, "Approval
// Signature:" 74.6, "Date:" 20.3; 6pt from a label to its field, 14pt from a
// field to the next label; the date field ends 6pt inside the right margin
// (L + 550 on a 556pt row).
export const APPROVAL_LINE = Object.freeze({
  nameLabel: "Approved by:",
  nameLabelX: 6,
  nameX: 62,
  nameWidth: 120,
  sigLabel: "Approval Signature:",
  sigLabelX: 196,
  sigX: 278,
  sigWidth: 140,
  dateLabel: "Date:",
  dateLabelX: 432,
  dateX: 458,
  dateWidth: 92,
  height: 15,
});

// EVERY SHEET RENDERED BEFORE 2026-09-15: signature and date only, with the
// signature label at the margin. The anchor still resolves these, so a copy
// signed under the old layout can be approved; the name goes on the free line
// above the signature there, since the line itself has no field for it.
export const APPROVAL_LINE_OLD = Object.freeze({
  sigLabelX: 6,
  sigX: 100,
  sigWidth: 200,
  dateLabelX: 322,
  dateX: 356,
  dateWidth: 180,
  height: 15,
});
