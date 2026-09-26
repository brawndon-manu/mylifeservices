"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { daysFrom, dayNum } from "@/lib/timesheet/schedule-lock";
import { LOCK_SLOTS, readUpload, lockSummary, compareToLock, monthDays, UnreadableExport } from "./compare";

async function requireLockAccess() {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");
  return user;
}

const BLOB_HOST = /\.blob\.vercel-storage\.com$/i;

// "2026-09-24" (the date picker) -> "09/24/26"
const fromIso = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || "").trim());
  return m ? `${m[2]}/${m[3]}/${m[1].slice(2)}` : null;
};

// today in the office's own time zone, "09/26/26"
function officeToday() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "2-digit", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  return `${p.month}/${p.day}/${p.year}`;
}

// THE UPLOAD. The browser has already put every export in the private store;
// this gets their references, reads them back, and either locks the month
// (its first upload) or lays them against the lock. Returns { error } for the
// form to show, or redirects to what the upload found.
export async function uploadScheduleLock(_prev, formData) {
  const user = await requireLockAccess();

  let refs;
  try { refs = JSON.parse((formData.get("blobs") || "null").toString()) || {}; } catch { refs = {}; }
  const files = {};
  for (const slot of LOCK_SLOTS) {
    const r = refs[slot];
    if (!r || typeof r.url !== "string") continue;
    let host = null;
    try { host = new URL(r.url).hostname; } catch { /* refused below */ }
    if (!host || !BLOB_HOST.test(host)) return { error: "A file didn't finish uploading. Nothing was saved - try again." };
    files[slot] = { url: r.url, name: String(r.name || ""), size: Number(r.size) || 0 };
  }
  if (!files.schedule) return { error: "The Employee Schedules export is required." };

  let nowRead;
  try {
    nowRead = await readUpload(files);
  } catch (e) {
    console.error("schedule lock read failed:", e);
    return { error: e instanceof UnreadableExport ? `${e.message}. Check it is the right export.` : "The exports couldn't be read." };
  }
  // what each file covers rides on its reference, so the list can say it
  const stored = Object.fromEntries(Object.entries(files).map(([slot, f]) => {
    const cover = slot === "schedule" ? nowRead.covers.roster : nowRead.covers[slot === "notes" ? "dsn" : slot === "mileage" ? "miles" : slot];
    return [slot, { ...f, from: cover?.from || null, to: cover?.to || null }];
  }));

  const monthKey = nowRead.monthKey;
  const month = monthDays(monthKey);
  const lock = await prisma.scheduleLockUpload.findFirst({
    where: { monthKey, lockId: null },
    orderBy: { createdAt: "asc" },
  });
  const by = { uploadedById: user.id, uploadedByName: preferredName(user) || user.email || null };

  // ---------------------------------------------------------------- the lock
  if (!lock) {
    // the days picked, else the month up to yesterday: a day still being
    // worked cannot be locked
    let from = fromIso(formData.get("from")) || month.from;
    let to = fromIso(formData.get("to"));
    if (!to) {
      const today = officeToday();
      const yesterday = daysFrom(month.from, today).slice(-2, -1)[0] || null;
      to = dayNum(today) > dayNum(month.to) ? month.to : yesterday;
    }
    if (!to || dayNum(from) > dayNum(to)) return { error: "Pick the days to lock. Nothing in this month has been worked yet." };
    if (dayNum(from) < dayNum(month.from) || dayNum(to) > dayNum(month.to)) {
      return { error: `The days to lock have to be inside the month the schedule is for (${month.from} to ${month.to}).` };
    }
    const days = daysFrom(from, to);
    const created = await prisma.scheduleLockUpload.create({
      data: { monthKey, lockId: null, fromDate: from, toDate: to, files: stored, summary: { lock: lockSummary(nowRead, days) }, ...by },
      select: { id: true },
    });
    revalidatePath("/portal/admin/schedule-lock");
    redirect(`/portal/admin/schedule-lock/${created.id}`);
  }

  // ---------------------------------------------------------------- a check
  const days = daysFrom(lock.fromDate, lock.toDate);
  let lockRead;
  try {
    lockRead = await readUpload(lock.files || {});
  } catch (e) {
    console.error("schedule lock: the lock's own exports failed to read:", e);
    return { error: "The lock's own exports couldn't be read back, so nothing was compared." };
  }
  // what was approved and still stands, in the order it was approved
  const approved = await prisma.scheduleLockChange.findMany({
    where: { lockId: lock.id, decision: "approved", present: true },
    orderBy: { decidedAt: "asc" },
    select: { source: true, kind: true, before: true, after: true, decidedAt: true },
  });
  const { changes, compared } = compareToLock({
    lockRead,
    nowRead,
    days,
    approved: approved.map((c) => ({ ...c, decidedAt: c.decidedAt?.toISOString() || null })),
  });

  const existing = await prisma.scheduleLockChange.findMany({
    where: { lockId: lock.id },
    select: { id: true, key: true, decision: true, present: true },
  });
  const byKey = new Map(existing.map((c) => [c.key, c]));

  const result = await prisma.$transaction(async (tx) => {
    const upload = await tx.scheduleLockUpload.create({
      data: { monthKey, lockId: lock.id, fromDate: lock.fromDate, toDate: lock.toDate, files: stored, ...by },
      select: { id: true },
    });
    const again = changes.filter((c) => byKey.has(c.key));
    const fresh = changes.filter((c) => !byKey.has(c.key));
    const againIds = again.map((c) => byKey.get(c.key).id);
    if (againIds.length) {
      await tx.scheduleLockChange.updateMany({ where: { id: { in: againIds } }, data: { lastUploadId: upload.id, present: true } });
    }
    const made = fresh.length
      ? await tx.scheduleLockChange.createManyAndReturn({
        data: fresh.map((c) => ({
          lockId: lock.id,
          key: c.key,
          source: c.source,
          kind: c.kind,
          employee: c.employee || null,
          date: c.date || null,
          lastDate: c.lastDate || null,
          before: c.before ?? undefined,
          after: c.after ?? undefined,
          evidence: c.evidence ?? undefined,
          matchesClock: !!c.matchesClock,
          awayFromClock: !!c.awayFromClock,
          firstUploadId: upload.id,
          lastUploadId: upload.id,
        })),
        select: { id: true },
      })
      : [];
    // what an earlier upload showed and this one does not: put back, or
    // changed again into something else. An approved change is not "gone" -
    // it is in the lock now, which is why it no longer differs.
    const seen = new Set(changes.map((c) => c.key));
    const goneIds = existing.filter((c) => c.present && c.decision !== "approved" && !seen.has(c.key)).map((c) => c.id);
    if (goneIds.length) {
      await tx.scheduleLockChange.updateMany({ where: { id: { in: goneIds } }, data: { present: false } });
    }
    const presentIds = [...againIds, ...made.map((m) => m.id)];
    const summary = {
      changes: presentIds.length,
      fresh: made.length,
      still: againIds.length,
      gone: goneIds.length,
      matchesClock: changes.filter((c) => c.matchesClock).length,
      awayFromClock: changes.filter((c) => c.awayFromClock).length,
      compared,
    };
    await tx.scheduleLockUpload.update({ where: { id: upload.id }, data: { presentIds, goneIds, summary } });
    return upload;
  }, { timeout: 60000, maxWait: 15000 });

  revalidatePath("/portal/admin/schedule-lock");
  redirect(`/portal/admin/schedule-lock/${result.id}`);
}

// ONE DECISION: "approved", "unauthorized", or null to take it back
export async function decideLockChange(id, decision) {
  const user = await requireLockAccess();
  if (![null, "approved", "unauthorized"].includes(decision)) return { error: "That isn't a decision." };
  const row = await prisma.scheduleLockChange.findUnique({ where: { id: String(id) }, select: { id: true } });
  if (!row) return { error: "That change is no longer here." };
  const saved = await prisma.scheduleLockChange.update({
    where: { id: row.id },
    data: decision
      ? { decision, decidedById: user.id, decidedByName: preferredName(user) || user.email || null, decidedAt: new Date() }
      : { decision: null, decidedById: null, decidedByName: null, decidedAt: null },
    select: { id: true, decision: true, decidedByName: true, decidedAt: true },
  });
  return { ok: true, change: { ...saved, decidedAt: saved.decidedAt?.toISOString() || null } };
}

// every undecided change on one upload whose new times are the clock's punch
export async function approveClockMatches(uploadId) {
  const user = await requireLockAccess();
  const upload = await prisma.scheduleLockUpload.findUnique({
    where: { id: String(uploadId) },
    select: { id: true, presentIds: true },
  });
  const ids = Array.isArray(upload?.presentIds) ? upload.presentIds : [];
  if (!ids.length) return { ok: true, count: 0, ids: [] };
  const targets = await prisma.scheduleLockChange.findMany({
    where: { id: { in: ids }, matchesClock: true, decision: null },
    select: { id: true },
  });
  const at = new Date();
  const name = preferredName(user) || user.email || null;
  if (targets.length) {
    await prisma.scheduleLockChange.updateMany({
      where: { id: { in: targets.map((t) => t.id) }, decision: null },
      data: { decision: "approved", decidedById: user.id, decidedByName: name, decidedAt: at },
    });
  }
  return { ok: true, count: targets.length, ids: targets.map((t) => t.id), decidedByName: name, decidedAt: at.toISOString() };
}
