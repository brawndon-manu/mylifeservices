"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp, canManageTimesheets } from "@/lib/roles";
import { readBudgetCapture } from "@/lib/timesheet/budget-capture";
import { CHOSEN_KINDS } from "@/lib/timesheet/review-kinds";
import { PDFDocument } from "pdf-lib";
import { clockShifts } from "@/lib/timesheet/clock";
import { buildWhoKey } from "@/lib/timesheet/people";
import { clientKey } from "@/lib/timesheet/note-audit";
import { clockShiftFor } from "@/lib/timesheet/amended";
import { hasIssue, punchIssue } from "@/lib/clock-amendment/rules";
import { shiftFacts, accountsByKey, notePageSpan } from "@/lib/clock-amendment/files";
import { raiseOne, ROSTER_SELECT, str } from "@/lib/clock-amendment/raise";

// THE STANDALONE SERVICE NOTES UPLOAD IS GONE, 2026-08-27.
//
// Mánu: "i want to be able to upload all of this info just to the timesheets
// page. and the audit card and more to come can just get it from that info ...
// i also want to do it by timesheet pay period."
//
// `uploadServiceNotes`, `deleteServiceNotes` and `coverageOf` lived here. The
// notes arrive with every other export on the pay period now, so a period's
// notes are replaced by re-uploading it and deleted with it. What is left in
// this file is the reviewing, which was never about the upload.

// A REVIEWER'S DECISION ABOUT ONE SHIFT.
//
// Mánu 2026-08-26: approve means "it looks good as far as billing", and anyone
// who can reach the page may record one - which is admin and up, so field staff
// cannot sign off their own work by reaching this screen.
//
// WHO decided is recorded on every row regardless. An approval is only worth
// what the reviewer's independence makes it worth, and the one person in this
// data who could approve their own shifts is the person reading this.
export async function reviewShift(formData) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");

  // A SUPERSEDED COPY IS FROZEN, 2026-09-07. Deciding from an old copy would
  // freeze figures the current one has already replaced, so the write is
  // refused on the server the same way the payroll lane refuses - the screen
  // hides the buttons, but the rule does not live in a hidden button.
  const fromBatchId = String(formData.get("batchId") || "");
  if (fromBatchId) {
    const { supersededBy } = await import("@/lib/timesheet/superseded");
    if (await supersededBy(fromBatchId)) return { ok: false, error: "superseded" };
  }

  const decision = formData.get("decision");
  if (decision !== "approved" && decision !== "flagged") return { ok: false, error: "unknown" };

  const shiftKey = String(formData.get("shiftKey") || "");
  if (!shiftKey) return { ok: false, error: "noshift" };

  const reason = String(formData.get("reason") || "").trim();
  // A FLAG NEEDS NO WORDS - Mánu 2026-09-03: "i should be able to flag
  // without leaving comments." The flagged pile routes attention on its own;
  // words help whoever picks it up and stay optional.

  const num = (k) => {
    const v = formData.get(k);
    return v === null || v === "" || v === "null" ? null : Number(v);
  };

  // THE REVIEWER'S CORRECTED BILLABLE TIME. Mánu 2026-08-31: "when i go
  // through every shift i can adjust how much of the time is actually
  // billable." Optional on either decision; null means the billed figure
  // stands. Clamped to a sane day rather than trusted: this drives a report.
  const rawBillable = num("billableMin");
  const billableMin =
    rawBillable != null && Number.isFinite(rawBillable) && rawBillable >= 0
      ? Math.min(Math.round(rawBillable), 24 * 60)
      : null;

  // THE WINDOW THE CORRECTION WAS TYPED AS - Mánu 2026-09-06: "the time i
  // input needs to be part of the system now." Both ends or neither, running
  // forward inside one day, and only ever beside a figure - a window with no
  // billableMin is noise and is dropped, same as a half-typed one.
  const rawFrom = num("billableFromMin");
  const rawTo = num("billableToMin");
  const windowOk =
    billableMin != null
    && rawFrom != null && rawTo != null
    && Number.isFinite(rawFrom) && Number.isFinite(rawTo)
    && rawFrom >= 0 && rawTo > rawFrom && rawTo <= 24 * 60;
  const billableFromMin = windowOk ? Math.round(rawFrom) : null;
  const billableToMin = windowOk ? Math.round(rawTo) : null;

  // WHAT THE FLAG IS ABOUT. Only the chosen kinds are stored - billing is
  // derived from billableMin - and an unknown one is dropped rather than
  // saved, since the screen reads these back by name.
  const kinds = String(formData.get("kinds") || "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => CHOSEN_KINDS.includes(k));

  const row = {
    shiftKey,
    employeeKey: String(formData.get("employeeKey") || ""),
    date: String(formData.get("date") || ""),
    startMin: num("startMin"),
    client: String(formData.get("client") || "") || null,
    service: String(formData.get("service") || "") || null,
    decision,
    reason: decision === "flagged" ? reason || null : null,
    // an approval is not about anything - the kinds go with the flag
    kinds: decision === "flagged" ? kinds : [],
    // THE READING AS IT STOOD. A later upload can move these figures; what was
    // signed off should not move with them.
    billedMin: num("billedMin"),
    clockedMin: num("clockedMin"),
    documentedMin: num("documentedMin"),
    billableMin,
    billableFromMin,
    billableToMin,
    // which copy was on screen - Mánu 2026-09-09: new flags must tell
    // themselves apart from the old copy's
    sourceBatchId: fromBatchId || null,
    decidedById: user.id,
  };

  await prisma.shiftReview.upsert({
    where: { shiftKey },
    create: row,
    // changing your mind is allowed and overwrites the decision, the reason and
    // who made it - the row is the current decision, not a history of them
    update: {
      decision: row.decision, reason: row.reason, kinds: row.kinds, decidedById: user.id,
      billedMin: row.billedMin, clockedMin: row.clockedMin, documentedMin: row.documentedMin,
      billableMin: row.billableMin,
      billableFromMin: row.billableFromMin, billableToMin: row.billableToMin,
      service: row.service, client: row.client,
      sourceBatchId: row.sourceBatchId,
    },
  });

  revalidatePath("/portal/admin/audit");
  return { ok: true };
}

// THE MONTH'S AUTHORIZED HOURS, off QSP's Budget Capture Report. The month is
// read from the document's own title line; uploading a month again replaces
// it wholesale, the same shape as every other point-in-time import here.
export async function uploadBudgetCapture(formData) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");

  const file = formData.get("file");
  if (!file || typeof file !== "object" || !("size" in file) || file.size === 0) {
    redirect("/portal/admin/audit?budgeterr=nofile");
  }

  let parsed;
  try {
    parsed = readBudgetCapture(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    redirect(`/portal/admin/audit?budgeterr=${e?.code || "unreadable"}`);
  }

  await prisma.$transaction([
    prisma.clientAuthorization.deleteMany({ where: { monthKey: parsed.monthKey } }),
    prisma.clientAuthorization.createMany({
      data: parsed.rows.map((r) => ({
        monthKey: parsed.monthKey,
        clientKey: r.clientKey,
        clientName: r.clientName,
        office: r.office,
        caseManagerName: r.caseManagerName,
        serviceType: r.serviceType,
        authorizedHours: r.authorizedHours,
        scheduledHours: r.scheduledHours,
        sourceName: typeof file.name === "string" ? file.name.slice(0, 200) : null,
        uploadedById: user.id,
      })),
    }),
  ]);

  revalidatePath("/portal/admin/audit");
  redirect(
    `/portal/admin/audit?budget=${parsed.monthKey}&clients=${parsed.rows.length}` +
      (parsed.skipped.length ? `&skipped=${parsed.skipped.length}` : ""),
  );
}

export async function deleteBudgetMonth(formData) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");
  const monthKey = String(formData.get("monthKey") || "");
  if (!/^\d{4}-\d{2}$/.test(monthKey)) redirect("/portal/admin/audit");
  await prisma.clientAuthorization.deleteMany({ where: { monthKey } });
  revalidatePath("/portal/admin/audit");
  redirect("/portal/admin/audit");
}

// A NEW-NOTES ENTRY LEAVES THE LIST ONLY WHEN A PERSON SAYS SEEN - Mánu
// 2026-09-07: the entries accumulate across uploads so a busy day cannot
// slip one past him. Seen is a fact about the reader, not the shift, so
// nothing else moves.
export async function markNoteChangeSeen(formData) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");
  const id = String(formData.get("id") || "");
  if (!id) return { ok: false };
  await prisma.auditNoteChange.updateMany({
    where: { id, seenAt: null },
    data: { seenAt: new Date(), seenById: user.id },
  });
  revalidatePath("/portal/admin/audit");
  return { ok: true };
}

// A STAR ON ONE SHIFT INSIDE A SUPERSEDED COPY - Mánu 2026-09-07: "starring
// only works in superceded." The server holds the rule: the batch must be an
// audit copy a newer one has replaced, or the toggle refuses.
export async function toggleShiftStar(formData) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");
  const batchId = String(formData.get("batchId") || "");
  const shiftKey = String(formData.get("shiftKey") || "");
  if (!batchId || !shiftKey) return { ok: false };
  const { supersededBy } = await import("@/lib/timesheet/superseded");
  if (!(await supersededBy(batchId))) return { ok: false, error: "current" };
  const standing = await prisma.auditShiftStar.findUnique({
    where: { batchId_shiftKey: { batchId, shiftKey } },
    select: { id: true },
  });
  if (standing) {
    await prisma.auditShiftStar.delete({ where: { id: standing.id } });
  } else {
    await prisma.auditShiftStar.create({ data: { batchId, shiftKey, byId: user.id } });
  }
  revalidatePath("/portal/admin/audit");
  return { ok: true, starred: !standing };
}

// FLAGGING FROM INSIDE THE THING ITSELF - Mánu 2026-09-11: "i want to add an
// option to flag the note for review", and 2026-09-12: "i also liked the flag
// for dsn."
//
// Adds or removes ONE kind, leaving the reason, the corrected figure and the
// other kinds alone - which is why it is not reviewShift with a kinds list.
// Adding a kind to a shift nobody has decided flags it, because Mánu chose one
// pile: "flagged above would hold all of those combined."
//
// Removing the last kind does NOT unflag the shift. A flag is a decision a
// person made; saying it is no longer about the DSN is not the same as saying
// it was never flagged, and 695 flags on record carry no kind at all.
export async function toggleReviewKind(formData) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");
  const shiftKey = String(formData.get("shiftKey") || "");
  const kind = String(formData.get("kind") || "");
  if (!shiftKey) return { ok: false };
  if (!CHOSEN_KINDS.includes(kind)) return { ok: false, error: "kind" };

  const batchId = String(formData.get("batchId") || "");
  if (batchId) {
    const { supersededBy } = await import("@/lib/timesheet/superseded");
    if (await supersededBy(batchId)) return { ok: false, error: "superseded" };
  }

  const off = String(formData.get("off") || "") === "1";
  const num = (k) => {
    const v = formData.get(k);
    return v === null || v === "" || v === "null" ? null : Number(v);
  };

  const standing = await prisma.shiftReview.findUnique({
    where: { shiftKey },
    select: { id: true, kinds: true, decision: true },
  });

  if (!standing) {
    if (off) return { ok: true, kinds: [] };
    await prisma.shiftReview.create({
      data: {
        shiftKey,
        employeeKey: String(formData.get("employeeKey") || ""),
        date: String(formData.get("date") || ""),
        startMin: num("startMin"),
        client: String(formData.get("client") || "") || null,
        service: String(formData.get("service") || "") || null,
        decision: "flagged",
        kinds: [kind],
        billedMin: num("billedMin"),
        clockedMin: num("clockedMin"),
        documentedMin: num("documentedMin"),
        sourceBatchId: batchId || null,
        decidedById: user.id,
      },
    });
    revalidatePath("/portal/admin/audit");
    return { ok: true, decision: "flagged", kinds: [kind] };
  }

  const next = off
    ? standing.kinds.filter((k) => k !== kind)
    : [...new Set([...standing.kinds, kind])];
  await prisma.shiftReview.update({
    where: { id: standing.id },
    data: {
      kinds: next,
      // adding a kind to an approved shift flags it - one pile, his call
      ...(off ? {} : { decision: "flagged", sourceBatchId: batchId || null, decidedById: user.id }),
    },
  });
  revalidatePath("/portal/admin/audit");
  return { ok: true, decision: off ? standing.decision : "flagged", kinds: next };
}

export async function undoReview(formData) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");
  const shiftKey = String(formData.get("shiftKey") || "");
  if (!shiftKey) return { ok: false };
  await prisma.shiftReview.deleteMany({ where: { shiftKey } });
  revalidatePath("/portal/admin/audit");
  return { ok: true };
}

// THE AUTO FLAGGER - Mánu 2026-09-04: "itll auto flag them and we can review
// them and we can approve them or leave the flag and add comments and change
// time as usual." The rules live in @/lib/timesheet/auto-flag; this pair is
// the same contract as reset-all: impact read at click time so the dialog
// names real counts, and the write only lands on the second press.
export async function autoFlagImpact(batchId) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) return { ok: false, error: "auth" };
  const { buildAudit } = await import("./[id]/build");
  const { autoFlagPlan } = await import("@/lib/timesheet/auto-flag");
  const data = await buildAudit(batchId);
  if (!data) return { ok: false, error: "nobatch" };
  const { counts, flags } = autoFlagPlan(data.rows);
  return { ok: true, counts, total: flags.length };
}

export async function autoFlagShifts(batchId) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) return { ok: false, error: "auth" };
  const { buildAudit } = await import("./[id]/build");
  const { autoFlagPlan } = await import("@/lib/timesheet/auto-flag");
  const data = await buildAudit(batchId);
  if (!data) return { ok: false, error: "nobatch" };
  const { flags } = autoFlagPlan(data.rows);
  if (!flags.length) return { ok: true, flagged: 0, applied: [] };
  // skipDuplicates: a decision that appeared between the dialog and the click
  // wins - the engine never overwrites anybody, itself included
  const made = await prisma.shiftReview.createMany({
    data: flags.map(({ row, reason }) => ({
      shiftKey: row.shiftKey,
      employeeKey: row.employeeKey,
      date: row.date,
      startMin: row.startMin,
      client: row.client,
      service: row.service,
      decision: "flagged",
      reason,
      billedMin: row.billedMin,
      clockedMin: row.clockedMin,
      documentedMin: row.documentedMin,
      billableMin: null,
      sourceBatchId: batchId,
      decidedById: user.id,
    })),
    skipDuplicates: true,
  });
  revalidatePath("/portal/admin/audit");
  return {
    ok: true,
    flagged: made.count,
    applied: flags.map(({ row, reason }) => ({ shiftKey: row.shiftKey, reason })),
    byName: user.name || null,
  };
}

// EVERYTHING DECIDED ON ONE PAY PERIOD, WIPED - Mánu 2026-09-03: "there
// should be a reset all button with are you sure buttons". The impact is
// read at click time so the dialog names the real count, the same contract
// the recompute dialog keeps.
export async function auditResetImpact(batchId) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) return { ok: false, error: "auth" };
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id: batchId },
    select: { periodFrom: true, periodTo: true },
  });
  if (!batch) return { ok: false, error: "nobatch" };
  const { periodDates } = await import("@/lib/timesheet/period-of");
  const count = await prisma.shiftReview.count({
    where: { date: { in: periodDates(batch.periodFrom, batch.periodTo) } },
  });
  return { ok: true, count };
}

export async function resetAllReviews(batchId) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) return { ok: false, error: "auth" };
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id: batchId },
    select: { periodFrom: true, periodTo: true },
  });
  if (!batch) return { ok: false, error: "nobatch" };
  const { periodDates } = await import("@/lib/timesheet/period-of");
  // scoped by the period's own dates: ShiftReview keys on the shift, not the
  // batch, so this is every decision the fortnight holds - which is what
  // "reset all" means - and nothing from any other fortnight.
  const gone = await prisma.shiftReview.deleteMany({
    where: { date: { in: periodDates(batch.periodFrom, batch.periodTo) } },
  });
  revalidatePath("/portal/admin/audit");
  return { ok: true, deleted: gone.count };
}

// RAISE A CLOCK AMENDMENT FROM THE CARD.
//
// the amendments page asks the office to drop the day's clock export and DSN
// and tick a shift. an audit copy already holds both files and every card
// already knows its shift and its note, so the same form can be raised from
// where the finding is read. the shift is re-read out of the copy's own clock
// export rather than trusted off the card, the note is the one the card
// shows, found by its page in the copy's stored notes, and its pages are cut
// from the stored DSN file. the writing and the send are raise.js, the same
// as the page's, so the two screens cannot raise two different documents.
//
// one open amendment per shift: a second while one is out is refused. a
// rehearsal (testOnly) neither counts as open nor blocks a real one.
const numOf = (v) => (v === null || v === undefined || v === "" || v === "null" ? null : Number(v));

export async function raiseAmendmentFromCard(formData) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) return { ok: false, error: "auth" };

  const batchId = str(formData.get("batchId"), 40);
  if (!batchId) return { ok: false, error: "nobatch" };
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true, clockUrl: true, clockName: true, notesUrl: true, notesName: true,
      serviceNotes: { select: { notes: true } },
    },
  });
  if (!batch?.clockUrl) return { ok: false, error: "noclock" };

  // which shift, as the card identifies one
  const identity = {
    employeeKey: str(formData.get("employeeKey"), 120) || "",
    date: str(formData.get("date"), 10) || "",
    client: str(formData.get("client"), 200) || "",
    startMin: numOf(formData.get("startMin")),
    originalFrom: numOf(formData.get("originalFrom")),
  };

  const users = await prisma.user.findMany({ where: { deactivatedAt: null }, select: ROSTER_SELECT });
  const who = buildWhoKey(users);
  let xls;
  try {
    xls = Buffer.from(await (await fetch(batch.clockUrl, { cache: "no-store" })).arrayBuffer());
  } catch (e) {
    console.error("clock amendment from the card: clock export not read:", e);
    return { ok: false, error: "clockfile" };
  }
  const shift = clockShiftFor(clockShifts(xls), identity, { whoKey: who, clientKey });
  if (!shift) return { ok: false, error: "norow" };
  if (!hasIssue(shift)) return { ok: false, error: "clean" };
  const account = accountsByKey(users, who).get(who(shift.name)) || null;
  if (!account) return { ok: false, error: "noaccount" };

  const open = await prisma.clockAmendment.findMany({
    where: { testOnly: false, approvedAt: null, staffId: account.id, shiftDate: shift.date },
    select: { clockRow: true },
  });
  const sameShift = (a) =>
    a.clockRow?.schedFrom === shift.schedFrom
    && clientKey(a.clockRow?.client || "") === clientKey(shift.client || "");
  if (open.some(sameShift)) return { ok: false, error: "open" };

  // the note the card shows, by its page, and the pages it sits on
  const notes = (batch.serviceNotes?.notes || []).filter((n) => n && n.page != null);
  const page = numOf(formData.get("notePage"));
  const note = page != null
    ? notes.find((n) => n.page === page && who(n.employee) === who(shift.name) && n.date === shift.date) || null
    : null;
  let pdf = null;
  let pages = null;
  if (note && batch.notesUrl) {
    try {
      pdf = Buffer.from(await (await fetch(batch.notesUrl, { cache: "no-store" })).arrayBuffer());
      const pageCount = (await PDFDocument.load(pdf, { ignoreEncryption: true })).getPageCount();
      pages = notePageSpan(notes, note, pageCount);
    } catch (e) {
      // the form still goes out; only the appendix is lost, and it says so
      console.error("clock amendment from the card: notes file not read:", e);
      pdf = null;
      pages = null;
    }
  }

  const candidate = {
    key: `${shift.key}|${shift.date}|${shift.schedFrom ?? ""}|${shift.client || ""}`,
    issue: punchIssue(shift),
    shift,
    facts: shiftFacts(shift),
    note,
    pages,
    account: {
      id: account.id, name: account.name, email: account.email,
      preferredFirstName: account.preferredFirstName, preferredLastName: account.preferredLastName,
    },
  };
  const testOnly = ["1", "on", "true"].includes(String(formData.get("testOnly") || ""));
  const pick = {
    reasonText: formData.get("reasonText"),
    actualIn: formData.get("actualIn"),
    actualOut: formData.get("actualOut"),
    placeIn: formData.get("placeIn"),
    placeOut: formData.get("placeOut"),
    recipientId: formData.get("recipientId"),
  };
  const res = await raiseOne({ user, candidate, pick, testOnly, pdf, clockName: batch.clockName, notesName: batch.notesName });
  if (res.ok) {
    revalidatePath(`/portal/admin/audit/${batch.id}`);
    revalidatePath("/portal/admin/clock-amendments");
  }
  return res;
}
