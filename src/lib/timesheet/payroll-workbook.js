import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
// LEGAL NAMES ON EVERY DOWNLOADABLE DOCUMENT - see payrollName
import { payrollName } from "@/lib/contacts";
import { batchPremiumStanding } from "@/lib/timesheet/premium-split";
import { miscTimeOffHours } from "@/lib/timesheet/time-off";
import { parsePayrollReport, payrollKey, reconcile } from "@/lib/timesheet/payroll";

// THE WHOLE PAYROLL PACKAGE AS ONE WORKBOOK, Mánu 2026-09-03: "can we make
// the csv be all in one with seperate tabs in the excel sheet? can we also
// decorate it with colors and have proper spacing maybe small logo too?" -
// David asked for the hours and penalties in spreadsheet form, and one file
// with tabs is what payroll actually opens. Three tabs: Summary (logo,
// totals, the provisional/final standing, the QSP reconciliation), Payout
// (the CSV's rows, styled), Penalty hours (the charged premiums per person).
// Built on demand from the same functions the page, CSV and PDFs read, so
// it can never disagree with them. The route does the auth; this does the
// work, and returns null for a batch that does not exist.

const r2 = (n) => Math.round((n || 0) * 100) / 100;

// the portal's own palette, as ARGB
const BRAND = "FF2F6FEB";
const BRAND_SOFT = "FFE8EFFB";
const ZEBRA = "FFF3F6FB";
const INK = "FF1F2937";
const OKBG = "FFE7F6EC";
const OKINK = "FF166534";
const WAITBG = "FFFDF2DE";
const WAITINK = "FF92400E";

export async function buildPayrollWorkbook(id) {
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    include: {
      timesheets: {
        orderBy: { sourceName: "asc" },
        include: {
          user: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
          corrections: {
            where: { OR: [{ status: "open" }, { kind: { startsWith: "q_" } }] },
            select: { id: true, kind: true, date: true, status: true },
          },
        },
      },
    },
  });
  if (!batch) return null;

  const standing = batchPremiumStanding(batch.timesheets, {
    restRows: batch.restsByDate || [],
  });
  const ptoRows = await prisma.ptoEntry.findMany({
    where: { program: batch.program || "MLS", periodFrom: batch.periodFrom, periodTo: batch.periodTo },
    select: { personKey: true, hours: true, kind: true },
  });
  const timeOffBy = new Map();
  for (const p of ptoRows) {
    const cur = timeOffBy.get(p.personKey) || { pto: 0, sick: 0 };
    if (p.kind === "sick") cur.sick += p.hours || 0;
    else cur.pto += p.hours || 0;
    timeOffBy.set(p.personKey, cur);
  }

  // the same column arithmetic as the CSV: misc-classified time off moves
  // columns, payable untouched by construction
  const rows = batch.timesheets.map((t) => {
    const charged = standing.byId[t.id]?.charged ?? 0;
    const cal = (t.userId && timeOffBy.get(t.userId)) || { pto: 0, sick: 0 };
    const misc = miscTimeOffHours(t.data?.days);
    return {
      who: payrollName(t.user, t.sourceName),
      sourceName: t.sourceName,
      matched: !!t.userId,
      reg: r2(Math.max(0, (t.regularHours || 0) - misc.total)),
      ot: r2(t.otHours),
      dbl: r2(t.doubleHours),
      worked: r2(Math.max(0, (t.paidHours || 0) - misc.total)),
      premium: r2(charged),
      pto: r2(cal.pto + misc.pto),
      sick: r2(cal.sick + misc.sick),
      payable: r2((t.paidHours || 0) + charged + cal.pto + cal.sick),
      miles: t.data?.qspMiles ?? null,
      status: t.corrections.some((c) => c.status === "open")
        ? "Reported a problem"
        : t.approvedAt ? "Approved" : t.signedAt ? "Signed" : "Not signed",
      corrected: t.recomputedAt ? "yes" : "no",
    };
  });
  const sum = (k) => r2(rows.reduce((n, r) => n + (r[k] || 0), 0));

  // the QSP reconciliation, same comparison the checks screen runs
  let rec = null;
  if (batch.payrollUrl) {
    try {
      const bytes = Buffer.from(await (await fetch(batch.payrollUrl)).arrayBuffer());
      const theirs = parsePayrollReport(bytes);
      rec = reconcile(
        batch.timesheets.map((t) => ({
          sourceName: t.sourceName, regularHours: t.regularHours, otHours: t.otHours,
          doubleHours: t.doubleHours, paidHours: t.paidHours,
        })),
        theirs,
      );
    } catch (e) {
      console.error("workbook reconciliation skipped:", e);
    }
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "My Life Services";
  wb.created = new Date();
  const period = `${batch.periodFrom} to ${batch.periodTo}`;

  const styleHeader = (row) => {
    row.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      c.alignment = { vertical: "middle", horizontal: c.col > 3 ? "right" : "left" };
      c.border = { bottom: { style: "thin", color: { argb: BRAND } } };
    });
    row.height = 20;
  };
  const num = (cell) => { cell.numFmt = "0.00"; cell.alignment = { horizontal: "right" }; };

  // ---------- Summary ----------
  const s = wb.addWorksheet("Summary", { properties: { defaultRowHeight: 16 } });
  s.columns = [{ width: 3 }, { width: 30 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
  try {
    const logo = wb.addImage({
      buffer: fs.readFileSync(path.join(process.cwd(), "public", "logo", "MLSlogo.png")),
      extension: "png",
    });
    s.addImage(logo, { tl: { col: 1, row: 1 }, ext: { width: 90, height: 90 } });
  } catch {
    // decorative
  }
  s.getCell("B8").value = "Payroll hours and penalties";
  s.getCell("B8").font = { bold: true, size: 16, color: { argb: INK } };
  s.getCell("B9").value = `Pay period ${period} · ${batch.program === "DP" ? "Day Program" : "ILS office"}`;
  s.getCell("B9").font = { size: 11, color: { argb: "FF6B7280" } };
  s.getCell("B10").value = `Generated ${new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}`;
  s.getCell("B10").font = { size: 10, color: { argb: "FF6B7280" } };

  const put = (r, label, value, opts = {}) => {
    s.getCell(`B${r}`).value = label;
    s.getCell(`B${r}`).font = { size: 11, color: { argb: INK } };
    const c = s.getCell(`C${r}`);
    c.value = value;
    c.font = { bold: true, size: 11, color: { argb: opts.color || INK } };
    if (typeof value === "number") num(c);
  };
  put(12, "Employees", rows.length);
  put(13, "Hours worked", sum("worked"));
  put(14, "Overtime (in worked)", sum("ot"));
  put(15, "Penalty hours", sum("premium"));
  put(16, "PTO hours", sum("pto"));
  put(17, "Sick hours", sum("sick"));
  put(18, "Total hours payable", sum("payable"));
  s.getCell("B18").font = { bold: true, size: 11 };
  put(19, "Miles driven (reimbursed, not hours)", sum("miles"));

  // the provisional/final standing, in its colour
  const good = standing.settled;
  s.mergeCells("B21:F22");
  const note = s.getCell("B21");
  note.value = good
    ? `FINAL. All ${standing.people} have answered what they were asked about their breaks. Nothing further can move the penalty column.`
    : `PROVISIONAL. ${standing.waiting} of ${standing.people} have not answered yet. Up to ${r2(standing.assumptions).toFixed(2)} penalty hours come off if they all confirm they took their breaks. This total can fall and cannot rise.`;
  note.fill = { type: "pattern", pattern: "solid", fgColor: { argb: good ? OKBG : WAITBG } };
  note.font = { size: 10, color: { argb: good ? OKINK : WAITINK } };
  note.alignment = { vertical: "middle", wrapText: true, indent: 1 };

  if (rec) {
    const agrees = rec.filter((r) => r.matched && r.agrees).length;
    const diffs = rec.filter((r) => r.matched && !r.agrees);
    const unmatched = rec.filter((r) => !r.matched).length;
    s.getCell("B24").value = "Checked against QSP's own payroll report";
    s.getCell("B24").font = { bold: true, size: 11, color: { argb: INK } };
    s.getCell("B25").value =
      `${agrees} of ${rec.length} match within rounding${unmatched ? `; ${unmatched} not in the payroll report` : ""}.`;
    s.getCell("B25").font = { size: 10, color: { argb: "FF6B7280" } };
    let rr = 26;
    for (const d of diffs) {
      s.getCell(`B${rr}`).value = `${d.name}: ours ${d.ours.paid.toFixed(2)}, QSP ${d.qsp.paid.toFixed(2)} (${d.diff.paid > 0 ? "+" : ""}${d.diff.paid.toFixed(2)})`;
      s.getCell(`B${rr}`).font = { size: 10, color: { argb: d.paysLess ? "FFB91C1C" : INK } };
      rr++;
    }
  }

  // ---------- Payout ----------
  const pay = wb.addWorksheet("Payout", { views: [{ state: "frozen", ySplit: 1 }] });
  pay.columns = [
    { header: "Employee", key: "who", width: 26 },
    { header: "As printed by QSP", key: "sourceName", width: 22 },
    { header: "Matched", key: "matched", width: 9 },
    { header: "Regular", key: "reg", width: 10 },
    { header: "OT", key: "ot", width: 8 },
    { header: "Double", key: "dbl", width: 8 },
    { header: "Hours worked", key: "worked", width: 13 },
    { header: "Penalty", key: "premium", width: 9 },
    { header: "PTO", key: "pto", width: 8 },
    { header: "Sick", key: "sick", width: 8 },
    { header: "Total payable", key: "payable", width: 13 },
    { header: "Miles", key: "miles", width: 9 },
    { header: "Status", key: "status", width: 18 },
    { header: "Corrected", key: "corrected", width: 10 },
  ];
  styleHeader(pay.getRow(1));
  for (const r of rows) {
    const row = pay.addRow({ ...r, matched: r.matched ? "yes" : "no" });
    if (row.number % 2 === 0) {
      row.eachCell({ includeEmpty: true }, (c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      });
    }
    for (const k of ["reg", "ot", "dbl", "worked", "premium", "pto", "sick", "payable", "miles"]) {
      num(row.getCell(k));
    }
    // the two word columns sit at the right edge and read with the numbers
    row.getCell("status").alignment = { horizontal: "right" };
    row.getCell("corrected").alignment = { horizontal: "right" };
    row.getCell("payable").font = { bold: true };
    if (r.premium > 0) row.getCell("premium").font = { color: { argb: "FFBE185D" }, bold: true };
  }
  const totalRow = pay.addRow({
    who: `TOTAL (${rows.length})`,
    reg: sum("reg"), ot: sum("ot"), dbl: sum("dbl"), worked: sum("worked"),
    premium: sum("premium"), pto: sum("pto"), sick: sum("sick"),
    payable: sum("payable"), miles: sum("miles"),
  });
  totalRow.eachCell({ includeEmpty: true }, (c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_SOFT } };
    c.font = { bold: true, color: { argb: INK } };
    c.border = { top: { style: "medium", color: { argb: BRAND } } };
  });
  for (const k of ["reg", "ot", "dbl", "worked", "premium", "pto", "sick", "payable", "miles"]) {
    num(totalRow.getCell(k));
  }

  // ---------- Penalty hours ----------
  const pen = wb.addWorksheet("Penalty hours", { views: [{ state: "frozen", ySplit: 1 }] });
  pen.columns = [
    { header: "Employee", key: "who", width: 26 },
    { header: "As printed by QSP", key: "sourceName", width: 22 },
    { header: "Penalty hours", key: "premium", width: 14 },
  ];
  styleHeader(pen.getRow(1));
  for (const r of rows) {
    const row = pen.addRow({ who: r.who, sourceName: r.sourceName, premium: r.premium });
    if (row.number % 2 === 0) {
      row.eachCell({ includeEmpty: true }, (c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      });
    }
    num(row.getCell("premium"));
    if (r.premium > 0) row.getCell("premium").font = { color: { argb: "FFBE185D" }, bold: true };
  }
  const penTotal = pen.addRow({ who: `TOTAL (${rows.length})`, premium: sum("premium") });
  penTotal.eachCell({ includeEmpty: true }, (c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_SOFT } };
    c.font = { bold: true, color: { argb: INK } };
    c.border = { top: { style: "medium", color: { argb: BRAND } } };
  });
  num(penTotal.getCell("premium"));

  const bytes = await wb.xlsx.writeBuffer();
  const slug = `${batch.periodFrom}-${batch.periodTo}`.replace(/[^\w]+/g, "-");
  return { bytes: Buffer.from(bytes), filename: `payroll-${slug}.xlsx` };
}
