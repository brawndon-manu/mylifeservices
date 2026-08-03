// the companion report - point 6 of the spec David has been running by hand,
// one employee at a time.
//
// it's the "show your working" document that sits next to the corrected
// timesheet: what the law requires, what each day actually did, which days owe
// a premium and why, and what a human should eyeball before anyone is paid.
// deliberately readable on its own, because it may well be the only thing
// someone reads if a figure is ever questioned.
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
const PREM = rgb(0.7, 0.11, 0.11);
const OK = rgb(0.13, 0.5, 0.28);
const GRID = rgb(0.75, 0.79, 0.83);
const WHITE = rgb(1, 1, 1);

const r2 = (n) => Math.round((n || 0) * 100) / 100;
const f2 = (n) => r2(n).toFixed(2);

// minutes worked before the meal -> "5h 42m into the shift"
function intoShift(min) {
  if (min == null) return "-";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

// widths add up to exactly R - L (532) so the table fills the same span as its
// header bar. Violation takes most of the slack - it's the only cell that holds
// a sentence ("No meal period, Rest 0 of 2") rather than a number.
const COLS = [
  ["Date", 58],
  ["Hours", 46],
  ["Rests\ntaken/req", 58],
  ["Meal", 42],
  ["Meal began", 66],
  ["Violation", 200],
  ["Premium", 62],
];

export async function renderComplianceReport(sheet, opts = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo = null;
  try {
    logo = await doc.embedPng(fs.readFileSync(LOGO_PATH));
  } catch {
    // decorative only
  }

  let page = null;
  let y = 0;

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - 46;
  };
  const text = (s, x, yy, { size = 9, f = font, color = INK } = {}) =>
    page.drawText(String(s), { x, y: yy, size, font: f, color });
  const room = (need) => {
    if (y - need < 52) {
      newPage();
      return true;
    }
    return false;
  };
  const heading = (s) => {
    room(34);
    y -= 8;
    text(s, L, y, { size: 11.5, f: bold, color: BRAND });
    y -= 6;
    page.drawLine({
      start: { x: L, y }, end: { x: R, y },
      thickness: 0.7, color: GRID,
    });
    y -= 13;
  };
  const para = (s, { size = 8.5, f = font, color = INK, leading = 11.5 } = {}) => {
    const words = String(s).split(/\s+/);
    let line = "";
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) > R - L) {
        room(leading);
        text(line, L, y, { size, f, color });
        y -= leading;
        line = w;
      } else {
        line = t;
      }
    }
    if (line) {
      room(leading);
      text(line, L, y, { size, f, color });
      y -= leading;
    }
  };
  const bullet = (s) => {
    room(12);
    text("•", L + 2, y, { size: 8.5, color: MUTED });
    const words = String(s).split(/\s+/);
    let line = "";
    const x = L + 14;
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(t, 8.5) > R - x) {
        text(line, x, y, { size: 8.5 });
        y -= 11;
        room(11);
        line = w;
      } else {
        line = t;
      }
    }
    if (line) {
      text(line, x, y, { size: 8.5 });
      y -= 11;
    }
    y -= 2;
  };

  newPage();

  // ---------- masthead ----------
  // logo and title sit on one line as a single unit, the wordmark tucked above
  // the title beside the mark. stacking a small logo on top of a big left
  // aligned title reads as two unrelated things that happen to share a corner.
  const period = sheet.payPeriod
    ? `${sheet.payPeriod.from} to ${sheet.payPeriod.to}`
    : opts.periodLabel || "";

  const mastTop = PAGE_H - 44;
  const logoH = 44;
  let titleX = L;
  if (logo) {
    const logoW = (logo.width / logo.height) * logoH;
    page.drawImage(logo, { x: L, y: mastTop - logoH, width: logoW, height: logoH });
    titleX = L + logoW + 14;
  }
  text("My Life Services, Inc.", titleX, mastTop - 13, {
    size: 8.5, f: bold, color: MUTED,
  });
  text("Payroll Hours and Break Penalties", titleX, mastTop - 36, {
    size: 16, f: bold, color: BRAND,
  });

  y = mastTop - logoH - 17;
  text(`${sheet.employee || "(unnamed)"}  ·  Pay period ${period}`, L, y, {
    size: 10, f: bold, color: INK,
  });
  y -= 12;
  text(
    `Prepared ${opts.generatedOn || new Date().toLocaleDateString("en-US")}`,
    L, y, { size: 8, color: MUTED },
  );
  // rule closing the masthead off from the body
  y -= 9;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.8, color: GRID });
  y -= 20;

  const days = sheet.days || [];
  const p = sheet.premiums || { mealDays: [], restDays: [], mealHours: 0, restHours: 0, totalHours: 0 };
  const mealDays = new Set(p.mealDays || []);
  const restDays = new Set(p.restDays || []);
  const lateDays = days.filter((d) => d.mealLate).map((d) => d.date);
  const missingMealDays = days.filter((d) => d.mealMissing ?? (d.mealViolation && !d.mealLate)).map((d) => d.date);
  const restAdded = r2((sheet.totals?.paidHours || 0) - (sheet.totals?.rawHours || 0));

  // ---------- summary ----------
  heading("Summary");
  para(
    `This report reviews ${days.length} worked day${days.length === 1 ? "" : "s"} against California meal and rest period requirements. ` +
    `It accompanies the corrected timesheet for the same pay period and explains every figure on it.`,
  );
  y -= 4;

  const sumRows = [
    ["Days reviewed", String(days.length)],
    ["Hours as exported by payroll", f2(sheet.totals?.rawHours)],
    ["Corrected hours (rest break time added back)", f2(sheet.totals?.paidHours)],
    ["Paid rest time added back", restAdded > 0 ? `+${f2(restAdded)}` : f2(restAdded)],
    ["Days owing a meal premium", String(mealDays.size)],
    ["Days owing a rest premium", String(restDays.size)],
    ["Total premium hours due", f2(p.totalHours)],
  ];
  // row geometry: text baseline, rule 6pt under it, 10pt on to the next
  // baseline. that puts ~4pt of air on both sides of every label instead of
  // pinning it 1pt under the rule above, which is what 13pt rows were doing.
  // figures are right-aligned off the margin so the decimals stack - a column
  // of left-aligned numbers makes "10" and "24.60" look ragged against each
  // other, which on a payroll document reads as sloppy rather than merely plain.
  for (const [k, v] of sumRows) {
    room(16);
    const last = k === "Total premium hours due";
    text(k, L + 4, y, { size: 8.5, f: last ? bold : font });
    text(v, R - 4 - bold.widthOfTextAtSize(v, 8.5), y, {
      size: 8.5, f: bold,
      color: last && p.totalHours > 0 ? PREM : INK,
    });
    y -= 6;
    page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.4, color: GRID });
    y -= 10;
  }
  y -= 4;

  // ---------- the requirements ----------
  heading("What California requires");
  bullet(
    "Rest periods: 10 paid minutes per 4 hours worked, or major fraction thereof. In practice that is one rest for a shift over 3.5 hours, two over 6 hours, three over 10 hours. Rest time is paid and counts as hours worked.",
  );
  bullet(
    "Meal periods: an unpaid 30-minute meal once a day passes 5 hours worked, and it must BEGIN no later than the end of the fifth hour. A meal that was taken but taken late is still non-compliant.",
  );
  bullet(
    "A meal may be waived only when the day is 6 hours or less, and only by mutual written consent. Days flagged here do not account for any signed waiver on file - see the observations below.",
  );
  bullet(
    "Labor Code §226.7: one additional hour at the regular rate for a non-compliant meal period, and one for non-compliant rest periods. Maximum one of each per workday, which is how the totals above are capped.",
  );
  bullet(
    "These payments are wages rather than penalties (Murphy v. Kenneth Cole, Naranjo v. Spectrum), so they belong on the wage statement and carry a three-year lookback.",
  );

  // ---------- day by day ----------
  heading("Day by day");

  const drawTableHead = () => {
    const hH = 22;
    page.drawRectangle({ x: L, y: y - hH + 4, width: R - L, height: hH, color: HEADBG });
    let x = L;
    COLS.forEach(([label, w], ci) => {
      const numeric = ci === 1 || ci === 6;
      label.split("\n").forEach((ln, i) => {
        const lx = numeric ? x + w - 4 - bold.widthOfTextAtSize(ln, 7) : x + 4;
        text(ln, lx, y - 4 - i * 8, { size: 7, f: bold, color: WHITE });
      });
      x += w;
    });
    y -= hH + 2;
  };
  drawTableHead();

  let alt = false;
  for (const d of days) {
    if (room(16)) drawTableHead();
    const rowH = 13;
    if (alt) {
      page.drawRectangle({
        x: L, y: y - 3, width: R - L, height: rowH, color: ROWALT,
      });
    }
    alt = !alt;

    const mealOwed = (d.paidHours || 0) > 5;
    const violations = [];
    if (mealDays.has(d.date)) violations.push(d.mealLate ? "Meal began late" : "No meal period");
    if (restDays.has(d.date)) violations.push(`Rest ${d.restCount || 0} of ${d.restRequired || 0}`);
    const premium = (mealDays.has(d.date) ? 1 : 0) + (restDays.has(d.date) ? 1 : 0);

    const cells = [
      d.date,
      f2(d.paidHours),
      `${d.restCount || 0} / ${d.restRequired || 0}`,
      d.mealCount > 0 ? "Yes" : mealOwed ? "No" : "n/a",
      d.mealCount > 0 ? intoShift(d.mealStartedAfterMin) : mealOwed ? "-" : "n/a",
      violations.length ? violations.join(", ") : "Compliant",
      premium ? `${premium}.00` : "-",
    ];

    let x = L;
    cells.forEach((c, i) => {
      const isViol = i === 5 && violations.length > 0;
      const isPrem = i === 6 && premium > 0;
      const f = isViol || isPrem ? bold : font;
      // hours and premium are figures, so they hang off the right of their
      // column and the decimals stack down the page. everything else reads as
      // text and stays left.
      const numeric = i === 1 || i === 6;
      const cx = numeric
        ? x + COLS[i][1] - 4 - f.widthOfTextAtSize(c, 7.2)
        : x + 4;
      text(c, cx, y, {
        size: 7.2,
        f,
        color: isViol || isPrem ? PREM : i === 5 ? OK : INK,
      });
      x += COLS[i][1];
    });
    y -= rowH;
  }

  y -= 4;
  page.drawLine({ start: { x: L, y: y + 6 }, end: { x: R, y: y + 6 }, thickness: 0.8, color: GRID });
  y -= 6;
  room(16);
  text("Total premium hours due", L + 4, y, { size: 8.5, f: bold });
  // sits under the Premium column it totals, not out at the page margin
  const premRight = L + COLS.reduce((n, [, w]) => n + w, 0) - 4;
  const totalStr = f2(p.totalHours);
  text(totalStr, premRight - bold.widthOfTextAtSize(totalStr, 9), y, {
    size: 9, f: bold, color: p.totalHours > 0 ? PREM : INK,
  });
  y -= 16;

  // ---------- premium detail ----------
  if (p.totalHours > 0) {
    heading("Premium hours due");
    if (missingMealDays.length) {
      para(`Meal period never taken (${missingMealDays.length} hr): ${missingMealDays.join(", ")}`, { size: 8.5 });
    }
    if (lateDays.length) {
      para(`Meal period began after the fifth hour (${lateDays.length} hr): ${lateDays.join(", ")}`, { size: 8.5 });
    }
    if (restDays.size) {
      para(`Rest periods short (${restDays.size} hr): ${[...restDays].join(", ")}`, { size: 8.5 });
    }
    y -= 2;
    para(
      `Total ${f2(p.totalHours)} premium hours, payable at the employee's regular rate of pay.`,
      { f: bold, size: 9 },
    );
  }

  // ---------- corrections ----------
  heading("Corrections made to the hours");
  if (restAdded > 0) {
    para(
      `Paid rest break time of ${f2(restAdded)} hours was added back. Payroll's export treated those minutes as unpaid because the employee clocked out for them; under California law rest periods are paid time and count toward the daily overtime threshold, which is why the corrected overtime can exceed what was originally exported.`,
    );
  } else {
    para("No rest break time needed adding back for this pay period.");
  }
  if (opts.overrides && Object.keys(opts.overrides).length) {
    y -= 4;
    // keep the heading with at least its first entry - a lone "Adjustments
    // applied after review:" at the foot of a page reads like nothing was
    // adjusted.
    room(30);
    para("Adjustments applied after review:", { f: bold });
    for (const [date, patch] of Object.entries(opts.overrides)) {
      const bits = [];
      if (patch.paidHours != null) bits.push(`hours set to ${f2(patch.paidHours)}`);
      if (patch.mealViolation === true) bits.push("meal period recorded as not taken");
      if (patch.mealViolation === false) bits.push("meal premium removed");
      if (patch.restViolation === true) bits.push("rest premium added");
      if (patch.restViolation === false) bits.push("rest premium removed");
      if (patch.removed) bits.push("day removed");
      if (patch.added) bits.push("day added");
      if (bits.length) bullet(`${date}: ${bits.join("; ")}`);
    }
  }

  // ---------- observations ----------
  heading("Worth verifying before payout");
  const obs = [];

  // rest breaks are meant to be clocked so they land on this record. when
  // someone never punches one, there is nothing to show the break happened -
  // which is exactly why the premium is owed - but it is worth saying plainly
  // that the cause is how it's being recorded, because the fix is a
  // conversation rather than a recalculation.
  const restPunches = days.reduce((n, d) => n + (d.restCount || 0), 0);
  const restPremiumDays = days.filter((d) => d.restViolation).length;
  if (restPunches === 0 && restPremiumDays > 0) {
    obs.push(
      `No rest break was clocked on ANY day this period, which is what produces all ${restPremiumDays} rest premium${restPremiumDays === 1 ? "" : "s"} above. Rest breaks are meant to be clocked so they appear on this record; with no punch there is nothing to show the break was taken, so the premium is owed. This is worth raising with the employee directly - the correction is to clock the break at the time, not at the end of the pay period.`,
    );
  } else if (restPremiumDays > 0 && restPremiumDays === days.length) {
    obs.push(
      `A rest premium is charged on every one of the ${days.length} days worked. Check how this employee is recording breaks - a premium every single day usually means the breaks are not being clocked rather than not being taken.`,
    );
  }

  const noBreaksAtAll = days.filter(
    (d) => (d.restCount || 0) === 0 && (d.mealCount || 0) === 0 && (d.paidHours || 0) > 5,
  );
  if (noBreaksAtAll.length) {
    obs.push(
      `${noBreaksAtAll.length} ${noBreaksAtAll.length === 1 ? "day shows" : "days show"} no break punches at all (${noBreaksAtAll.map((d) => d.date).join(", ")}). That is often a timekeeping habit rather than breaks being denied, but the distinction decides whether these premiums are genuinely owed.`,
    );
  }
  if (lateDays.length) {
    obs.push(
      `${lateDays.length} meal period${lateDays.length === 1 ? "" : "s"} began after the fifth hour. Confirm the punch times are accurate before treating these as violations.`,
    );
  }
  const shortDays = days.filter((d) => (d.paidHours || 0) > 5 && (d.paidHours || 0) <= 6 && d.mealViolation);
  if (shortDays.length) {
    obs.push(
      `${shortDays.length} flagged day${shortDays.length === 1 ? " is" : "s are"} 6 hours or less (${shortDays.map((d) => d.date).join(", ")}). A meal period on a day of 6 hours or less can be waived by mutual written consent. If a signed waiver is on file, those premiums are not owed and should be removed.`,
    );
  }
  if (sheet.partialWeekDates?.length) {
    obs.push(
      `This pay period cuts across the Monday-Sunday workweek, so the weeks at each end are incomplete (${sheet.partialWeekDates.join(", ")}). Any weekly overtime over 40 hours on those weeks is provisional until the neighbouring pay period is known.`,
    );
  }
  const longDays = days.filter((d) => (d.paidHours || 0) > 12);
  if (longDays.length) {
    obs.push(
      `${longDays.map((d) => `${d.date} (${f2(d.paidHours)} hrs)`).join(", ")} exceeded 12 hours. Worth confirming the punches are real before paying double time.`,
    );
  }
  if (!obs.length) obs.push("Nothing on this timesheet needs a second look before payout.");
  for (const o of obs) bullet(o);

  // ---------- page numbers ----------
  const all = doc.getPages();
  all.forEach((pg, i) => {
    pg.drawText(`Page ${i + 1} of ${all.length}`, {
      x: R - 62, y: 28, size: 7, font, color: MUTED,
    });
    pg.drawText(`${sheet.employee || ""} · ${period}`, {
      x: L, y: 28, size: 7, font, color: MUTED,
    });
  });

  return { bytes: await doc.save() };
}
