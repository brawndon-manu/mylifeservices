"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { readDayFiles } from "@/lib/clock-amendment/files";
import { raiseOne } from "@/lib/clock-amendment/raise";

// THE DESK THAT RAISES THESE is the one that runs payroll - same people, same
// job. A SUPERVISOR is not on it: they RECEIVE an amendment through a link the
// way a staff member does, which is a different thing from running the queue.
async function requireDesk() {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) return null;
  return user;
}

const ROSTER_SELECT = { id: true, name: true, email: true, role: true, preferredFirstName: true, preferredLastName: true };

// there is no `active` flag on this roster - a leaver carries a
// `deactivatedAt`, and sending an amendment to one is sending it nowhere
const roster = () => prisma.user.findMany({ where: { deactivatedAt: null }, select: ROSTER_SELECT });

async function bytesOf(file) {
  if (!file || typeof file.arrayBuffer !== "function" || !file.size) return null;
  return Buffer.from(await file.arrayBuffer());
}

const shown = (u) => preferredName(u) || u?.name || u?.email || "";

// WHO TO SEND IT TO, BY TYPING A NAME. Usually the staff member the clock row
// names, and the picker starts on them; the office changes it to a supervisor
// when that is who was there.
//
// SEARCHES THE PREFERRED NAME TOO. Half this roster is known by a name that is
// not the one on their account, and a picker that only matches the legal name
// is a picker somebody gives up on.
export async function searchPeople(term) {
  if (!(await requireDesk())) return [];
  const q = String(term || "").trim();
  if (q.length < 2) return [];
  const rows = await prisma.user.findMany({
    where: {
      deactivatedAt: null,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { preferredFirstName: { contains: q, mode: "insensitive" } },
        { preferredLastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    select: ROSTER_SELECT,
    orderBy: { name: "asc" },
    take: 8,
  });
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    // what to show: the name they go by, with the account name behind it when
    // they differ, so two people with the same first name are still tellable apart
    label: shown(u),
  }));
}

// STEP ONE: READ THE DAY'S TWO FILES and say which shifts a form could be
// raised for. Nothing is written. The office ticks from this list.
export async function readDayFilesAction(formData) {
  if (!(await requireDesk())) return { ok: false, error: "auth" };
  const clock = formData.get("clock");
  const notes = formData.get("notes");
  const xls = await bytesOf(clock);
  const pdf = await bytesOf(notes);
  if (!xls) return { ok: false, error: "noclock" };
  try {
    const read = await readDayFiles({ xlsBytes: xls, pdfBytes: pdf, users: await roster() });
    return {
      ok: true,
      shifts: read.shifts.length,
      notes: read.notes.length,
      pageCount: read.pageCount,
      underFloor: read.underFloor,
      clockName: clock?.name || null,
      notesName: notes?.name || null,
      candidates: read.candidates.map((c) => ({ ...c, account: c.account ? { ...c.account, label: shown(c.account) } : null })),
    };
  } catch (e) {
    return { ok: false, error: "read", detail: String(e?.message || e) };
  }
}

// STEP TWO: RAISE THE ONES THAT WERE TICKED. The files come back up with the
// picks so nothing has to be parked anywhere between the two steps - they are
// small, and the browser still holds them.
//
// What the office typed is stored as the INTAKE. The person asked confirms or
// corrects it on the form and their signature makes it theirs - see rules.js.
export async function raiseAmendments(formData) {
  const user = await requireDesk();
  if (!user) return { ok: false, error: "auth" };

  let picks;
  try { picks = JSON.parse(String(formData.get("picks") || "[]")); } catch { picks = null; }
  if (!Array.isArray(picks) || !picks.length) return { ok: false, error: "nopicks" };
  const testOnly = ["1", "on", "true"].includes(String(formData.get("testOnly") || ""));

  const clock = formData.get("clock");
  const notes = formData.get("notes");
  const xls = await bytesOf(clock);
  const pdf = await bytesOf(notes);
  if (!xls) return { ok: false, error: "noclock" };

  let read;
  try {
    read = await readDayFiles({ xlsBytes: xls, pdfBytes: pdf, users: await roster() });
  } catch (e) {
    return { ok: false, error: "read", detail: String(e?.message || e) };
  }
  const byKey = new Map(read.candidates.map((c) => [c.key, c]));
  // the writing itself is shared with the audit card - see raise.js
  const results = [];
  for (const p of picks) {
    const c = byKey.get(p?.key);
    if (!c) { results.push({ key: p?.key, ok: false, error: "gone" }); continue; }
    results.push(await raiseOne({ user, candidate: c, pick: p, testOnly, pdf, clockName: clock?.name || null, notesName: notes?.name || null }));
  }

  revalidatePath("/portal/admin/clock-amendments");
  return { ok: true, results };
}
