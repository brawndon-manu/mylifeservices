// THE WHOLE SERVICE AUDIT AS ONE WORKBOOK - Mánu 2026-09-05: "I want an
// excel sheet too now that has all the info in different tabs and make it
// look nice and pretty with logo and colors when needed."
//
// Six tabs: Summary (logo, the standing, the findings tally, DSN coverage),
// Every shift (the full board), Flagged (the pile with reasons and corrected
// figures), By employee, By client (with the monthly authorizations), and
// Notes with no shift. Built from the same buildAudit the screen and every
// PDF read, so nothing here can disagree with them; the payout workbook's
// palette and manners, so the two land in one folder as one set.
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { scheduleKey } from "@/lib/timesheet/schedule";
import { buildAudit } from "@/app/portal/admin/audit/[id]/build";
import { ampmLabel } from "@/lib/timesheet/hours-label";

const r2 = (n) => Math.round((n || 0) * 100) / 100;
const h = (min) => (min == null ? null : r2(min / 60));

// the portal's own palette, as ARGB - the payout workbook's exactly
const BRAND = "FF2F6FEB";
const BRAND_SOFT = "FFE8EFFB";
const ZEBRA = "FFF3F6FB";
const INK = "FF1F2937";
const OKBG = "FFE7F6EC";
const OKINK = "FF166534";
const WAITBG = "FFFDF2DE";
const WAITINK = "FF92400E";
const AMBER = "FFB45309";
const RED = "FFB91C1C";
const GREEN = "FF166534";

// SPREADSHEET ORDER IS BORING ON PURPOSE - Mánu 2026-09-05: "seems so
// random." The screen ranks by findings for triage; a workbook is reference
// material, so people go A-Z and their rows run chronologically.
const dayKey = (d) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(d || "");
  return m ? Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]) : 0;
};
const legal = (r) => r.whoLegal || r.who;
const byWhoThenDate = (a, b) =>
  legal(a).localeCompare(legal(b)) || dayKey(a.date) - dayKey(b.date) || (a.schedFrom ?? 0) - (b.schedFrom ?? 0);

const firstLast = (c) => {
  const v = String(c || "");
  const i = v.indexOf(",");
  return i < 0 ? v : `${v.slice(i + 1).trim()} ${v.slice(0, i).trim()}`;
};

export async function buildAuditWorkbook(id) {
  const data = await buildAudit(id);
  if (!data) return null;
  const { batch, rows, orphans, authorized, authMonthLabel, hasAuthorizations } = data;

  const staff = await prisma.user.findMany({
    where: { deactivatedAt: null },
    select: { name: true, title: true },
  });
  const titleOf = new Map();
  for (const u of staff) {
    const k = scheduleKey(u.name || "");
    if (k && u.title) titleOf.set(k, u.title);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "My Life Services";
  wb.created = new Date();
  const period = `${batch.periodFrom} to ${batch.periodTo}`;

  const styleHeader = (row, leftCols = 4) => {
    row.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      c.alignment = { vertical: "middle", horizontal: c.col > leftCols ? "right" : "left" };
      c.border = { bottom: { style: "thin", color: { argb: BRAND } } };
    });
    row.height = 20;
  };
  const num = (cell) => { cell.numFmt = "0.00"; cell.alignment = { horizontal: "right" }; };
  const zebra = (row) => {
    if (row.number % 2 === 0) {
      row.eachCell({ includeEmpty: true }, (c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      });
    }
  };
  const totalStyle = (row) => {
    row.eachCell({ includeEmpty: true }, (c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_SOFT } };
      c.font = { bold: true, color: { argb: INK } };
      c.border = { top: { style: "medium", color: { argb: BRAND } } };
    });
  };

  // ---------- the shared readings ----------
  const decided = rows.filter((r) => r.review?.decision);
  const approved = decided.filter((r) => r.review.decision === "approved");
  const flagged = decided.filter((r) => r.review.decision === "flagged");
  const open = rows.length - decided.length;
  const corrected = rows.filter((r) => r.review?.billableMin != null);
  const billedMin = rows.reduce((n, r) => n + (r.billedMin ?? 0), 0);
  const billableMin = rows.reduce((n, r) => n + (r.review?.billableMin ?? r.billedMin ?? 0), 0);
  const clockedMin = rows.reduce((n, r) => n + (r.clockedMin ?? 0), 0);
  const findings = new Map();
  for (const r of rows) for (const x of r.reasons) {
    findings.set(x.label, (findings.get(x.label) || 0) + 1);
  }
  const dsn = rows.filter((r) => r.note?.source === "dsn").length;
  const xls = rows.filter((r) => r.note && r.note.source !== "dsn").length;
  const noNote = rows.length - dsn - xls;

  const noteWord = (r) =>
    r.note ? `${r.note.source === "dsn" ? "DSN" : "service note"} · ${r.note.words ?? 0} words` : "none";
  const decisionWord = (r) =>
    r.review?.decision === "approved" ? "Approved" : r.review?.decision === "flagged" ? "Flagged" : "Not decided";

  // ---------- Summary ----------
  const s = wb.addWorksheet("Summary", { properties: { defaultRowHeight: 16 } });
  s.columns = [{ width: 3 }, { width: 34 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
  try {
    const logo = wb.addImage({
      buffer: fs.readFileSync(path.join(process.cwd(), "public", "logo", "MLSlogo.png")),
      extension: "png",
    });
    s.addImage(logo, { tl: { col: 1, row: 1 }, ext: { width: 90, height: 90 } });
  } catch {
    // decorative
  }
  s.getCell("B8").value = "Service audit";
  s.getCell("B8").font = { bold: true, size: 16, color: { argb: INK } };
  s.getCell("B9").value = `Pay period ${period}`;
  s.getCell("B9").font = { size: 11, color: { argb: "FF6B7280" } };
  s.getCell("B10").value = `Generated ${new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}`;
  s.getCell("B10").font = { size: 10, color: { argb: "FF6B7280" } };

  const put = (r, label, value, opts = {}) => {
    s.getCell(`B${r}`).value = label;
    s.getCell(`B${r}`).font = { size: 11, color: { argb: INK }, bold: !!opts.boldLabel };
    const c = s.getCell(`C${r}`);
    c.value = value;
    c.font = { bold: true, size: 11, color: { argb: opts.color || INK } };
    if (typeof value === "number" && opts.hours) num(c);
  };
  put(12, "Service shifts billed", rows.length);
  put(13, "Hours billed", h(billedMin), { hours: true });
  put(14, "Hours billable (corrections applied)", h(billableMin), { hours: true, color: corrected.length ? AMBER : INK });
  put(15, "Hours clocked", h(clockedMin), { hours: true });
  put(16, "Shifts with a corrected figure", corrected.length, { color: corrected.length ? AMBER : INK });
  put(17, "Approved", approved.length, { color: GREEN });
  put(18, "Flagged", flagged.length, { color: AMBER });
  put(19, "Not decided", open);
  put(20, "Notes: DSN / service note / none", `${dsn} / ${xls} / ${noNote}`, { color: noNote ? RED : INK });
  put(21, "Notes matching no billed shift", orphans.length);

  s.mergeCells("B23:F24");
  const note = s.getCell("B23");
  const done = open === 0;
  note.value = done
    ? `REVIEW COMPLETE. Every shift carries a decision: ${approved.length} approved, ${flagged.length} flagged.`
    : `IN REVIEW. ${open} of ${rows.length} shifts are not decided yet. Approved and flagged figures move as the review continues.`;
  note.fill = { type: "pattern", pattern: "solid", fgColor: { argb: done ? OKBG : WAITBG } };
  note.font = { size: 10, color: { argb: done ? OKINK : WAITINK } };
  note.alignment = { vertical: "middle", wrapText: true, indent: 1 };

  s.getCell("B26").value = "What the findings raised";
  s.getCell("B26").font = { bold: true, size: 11, color: { argb: INK } };
  let fr = 27;
  for (const [label, n] of [...findings.entries()].sort((a, b) => b[1] - a[1])) {
    s.getCell(`B${fr}`).value = label;
    s.getCell(`B${fr}`).font = { size: 10, color: { argb: "FF6B7280" } };
    const c = s.getCell(`C${fr}`);
    c.value = n;
    c.font = { size: 10, bold: true, color: { argb: INK } };
    c.alignment = { horizontal: "right" };
    fr++;
  }
  if (hasAuthorizations) {
    fr += 1;
    s.getCell(`B${fr}`).value = `Client authorizations on file: ${authMonthLabel} Budget Capture Report.`;
    s.getCell(`B${fr}`).font = { size: 10, color: { argb: "FF6B7280" } };
  }

  // ---------- Every shift ----------
  const ev = wb.addWorksheet("Every shift", { views: [{ state: "frozen", ySplit: 1 }] });
  ev.columns = [
    { header: "Employee", key: "who", width: 22 },
    { header: "Role", key: "role", width: 24 },
    { header: "Client", key: "client", width: 22 },
    { header: "Date", key: "date", width: 10 },
    { header: "Scheduled", key: "sched", width: 19 },
    { header: "Billed", key: "billed", width: 9 },
    { header: "Billable", key: "billable", width: 9 },
    { header: "Clocked", key: "clocked", width: 9 },
    { header: "In", key: "pin", width: 9 },
    { header: "Out", key: "pout", width: 9 },
    { header: "GPS in", key: "gin", width: 8 },
    { header: "GPS out", key: "gout", width: 8 },
    { header: "Note", key: "note", width: 20 },
    { header: "Schedule note", key: "sn", width: 12 },
    { header: "Findings", key: "findings", width: 40 },
    { header: "Decision", key: "decision", width: 12 },
    { header: "Decided by", key: "by", width: 18 },
    { header: "Reason", key: "reason", width: 44 },
  ];
  styleHeader(ev.getRow(1), 5);
  for (const r of [...rows].sort(byWhoThenDate)) {
    const row = ev.addRow({
      who: legal(r),
      role: titleOf.get(r.employeeKey) || "",
      client: firstLast(r.client),
      date: r.date,
      sched: r.schedFrom != null && r.schedTo != null ? `${ampmLabel(r.schedFrom)} - ${ampmLabel(r.schedTo)}` : "",
      billed: h(r.billedMin),
      billable: h(r.review?.billableMin ?? r.billedMin),
      clocked: h(r.clockedMin),
      pin: r.actualFrom != null ? ampmLabel(r.actualFrom) : r.noIn ? "missed" : "",
      pout: r.actualTo != null ? ampmLabel(r.actualTo) : r.noOut ? "missed" : "",
      gin: r.gpsIn || "",
      gout: r.gpsOut || "",
      note: noteWord(r),
      sn: r.scheduleNote ? "yes" : "no",
      findings: r.reasons.map((x) => x.label).join("; "),
      decision: decisionWord(r),
      by: r.review?.byLegal || "",
      reason: r.review?.reason || "",
    });
    zebra(row);
    for (const k of ["billed", "billable", "clocked"]) num(row.getCell(k));
    if (r.review?.billableMin != null) {
      row.getCell("billable").font = { bold: true, color: { argb: AMBER } };
    }
    if (!r.note || r.note.source !== "dsn") row.getCell("note").font = { color: { argb: RED }, bold: !r.note };
    const dc = row.getCell("decision");
    if (r.review?.decision === "approved") dc.font = { color: { argb: GREEN }, bold: true };
    else if (r.review?.decision === "flagged") dc.font = { color: { argb: AMBER }, bold: true };
  }

  // ---------- Flagged ----------
  const fl = wb.addWorksheet("Flagged", { views: [{ state: "frozen", ySplit: 1 }] });
  fl.columns = [
    { header: "Employee", key: "who", width: 22 },
    { header: "Client", key: "client", width: 22 },
    { header: "Date", key: "date", width: 10 },
    { header: "Scheduled", key: "sched", width: 19 },
    { header: "Billed", key: "billed", width: 9 },
    { header: "Corrected billable", key: "corr", width: 16 },
    { header: "Clocked", key: "clocked", width: 9 },
    { header: "Reason", key: "reason", width: 60 },
    { header: "Flagged by", key: "by", width: 18 },
  ];
  styleHeader(fl.getRow(1), 4);
  for (const r of [...flagged].sort(byWhoThenDate)) {
    const row = fl.addRow({
      who: legal(r),
      client: firstLast(r.client),
      date: r.date,
      sched: r.schedFrom != null && r.schedTo != null ? `${ampmLabel(r.schedFrom)} - ${ampmLabel(r.schedTo)}` : "",
      billed: h(r.billedMin),
      corr: h(r.review?.billableMin),
      clocked: h(r.clockedMin),
      reason: r.review?.reason || "",
      by: r.review?.byLegal || "",
    });
    zebra(row);
    for (const k of ["billed", "corr", "clocked"]) num(row.getCell(k));
    if (r.review?.billableMin != null) row.getCell("corr").font = { bold: true, color: { argb: AMBER } };
    row.getCell("reason").alignment = { wrapText: true };
  }

  // ---------- By employee / By client ----------
  const groupTab = (name, of, withAuth) => {
    const m = new Map();
    for (const r of rows) {
      const key = of(r);
      let g = m.get(key);
      if (!g) {
        g = { name: key, shifts: 0, billedMin: 0, billableMin: 0, adjusted: 0, clockedMin: 0, overMin: 0, noted: 0, open: 0, approved: 0, flagged: 0, authKey: r.authKey || null };
        m.set(key, g);
      }
      g.shifts++;
      g.billedMin += r.billedMin ?? 0;
      g.billableMin += r.review?.billableMin ?? r.billedMin ?? 0;
      if (r.review?.billableMin != null) g.adjusted++;
      if (r.clockedMin != null) {
        g.clockedMin += r.clockedMin;
        if (r.billedMin != null) g.overMin += Math.max(0, r.billedMin - r.clockedMin);
      }
      if (r.note) g.noted++;
      if (!g.authKey && r.authKey) g.authKey = r.authKey;
      if (!r.review?.decision) g.open++;
      else if (r.review.decision === "approved") g.approved++;
      else g.flagged++;
    }
    const t = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    t.columns = [
      { header: name === "By employee" ? "Employee" : "Client", key: "name", width: 26 },
      ...(name === "By employee" ? [{ header: "Role", key: "role", width: 24 }] : []),
      { header: "Shifts", key: "shifts", width: 8 },
      { header: "Billed", key: "billed", width: 10 },
      { header: "Billable", key: "billable", width: 10 },
      { header: "Adjusted", key: "adjusted", width: 9 },
      ...(withAuth ? [{ header: "Authorized / month", key: "auth", width: 16 }, { header: "% of authorized", key: "pct", width: 14 }] : []),
      { header: "Clocked", key: "clocked", width: 10 },
      { header: "Billed above clocked", key: "over", width: 17 },
      { header: "With a note", key: "noted", width: 11 },
      { header: "Not decided", key: "open", width: 11 },
      { header: "Approved", key: "approved", width: 10 },
      { header: "Flagged", key: "flagged", width: 9 },
    ];
    styleHeader(t.getRow(1), name === "By employee" ? 2 : 1);
    const groups = [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const g of groups) {
      const auth = withAuth && g.authKey ? authorized[g.authKey] : null;
      const row = t.addRow({
        name: name === "By client" ? firstLast(g.name) : g.name,
        ...(name === "By employee" ? { role: titleOf.get(rows.find((r) => legal(r) === g.name)?.employeeKey) || "" } : {}),
        shifts: g.shifts,
        billed: h(g.billedMin),
        billable: h(g.billableMin),
        adjusted: g.adjusted || "",
        ...(withAuth ? {
          auth: auth ? auth.hours : "",
          pct: auth?.hours ? Math.round((g.billableMin / 60 / auth.hours) * 100) / 100 : "",
        } : {}),
        clocked: h(g.clockedMin),
        over: g.overMin ? h(g.overMin) : "",
        noted: `${g.noted}/${g.shifts}`,
        open: g.open || "",
        approved: g.approved || "",
        flagged: g.flagged || "",
      });
      zebra(row);
      for (const k of ["billed", "billable", "clocked"]) num(row.getCell(k));
      if (g.overMin) { const c = row.getCell("over"); num(c); c.font = { color: { argb: RED }, bold: true }; }
      if (g.adjusted) row.getCell("billable").font = { bold: true, color: { argb: AMBER } };
      if (withAuth && auth?.hours) {
        const c = row.getCell("pct");
        c.numFmt = "0%";
        c.alignment = { horizontal: "right" };
        if (g.billableMin / 60 / auth.hours > 1) c.font = { color: { argb: RED }, bold: true };
      }
      row.getCell("noted").alignment = { horizontal: "right" };
    }
    const tot = t.addRow({
      name: `TOTAL (${groups.length})`,
      shifts: rows.length,
      billed: h(billedMin),
      billable: h(billableMin),
      clocked: h(clockedMin),
    });
    totalStyle(tot);
    for (const k of ["billed", "billable", "clocked"]) num(tot.getCell(k));
  };
  groupTab("By employee", (r) => legal(r), false);
  groupTab("By client", (r) => r.client || "No client on the booking", hasAuthorizations);

  // ---------- Notes with no shift ----------
  const orp = wb.addWorksheet("Notes with no shift", { views: [{ state: "frozen", ySplit: 1 }] });
  orp.columns = [
    { header: "Written by", key: "who", width: 22 },
    { header: "Date", key: "date", width: 10 },
    { header: "Client", key: "client", width: 22 },
    { header: "Times", key: "times", width: 16 },
    { header: "Hours documented", key: "hrs", width: 16 },
    { header: "Words", key: "words", width: 8 },
    { header: "Opens with", key: "summary", width: 70 },
  ];
  styleHeader(orp.getRow(1), 4);
  for (const n of orphans) {
    const row = orp.addRow({
      who: n.whoLegal || n.who,
      date: n.date,
      client: firstLast(n.client),
      times: [n.start, n.end].filter(Boolean).join("-"),
      hrs: n.minutes != null ? h(n.minutes) : "",
      words: n.words ?? "",
      summary: n.summary || "",
    });
    zebra(row);
    if (n.minutes != null) num(row.getCell("hrs"));
    row.getCell("summary").alignment = { wrapText: true };
  }

  const bytes = await wb.xlsx.writeBuffer();
  const slug = `${batch.periodFrom}-${batch.periodTo}`.replace(/[^\w]+/g, "-");
  return { bytes: Buffer.from(bytes), filename: `service-audit-${slug}.xlsx` };
}
