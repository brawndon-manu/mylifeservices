"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { isReasonCode, reasonNeedsText } from "@/lib/clock-amendment/rules";

// THE DESK THAT RAISES THESE is the one that runs payroll - same people, same
// job. A SUPERVISOR is not on it: they RECEIVE an amendment through a link the
// way a staff member does, which is a different thing from running the queue.
async function requireDesk() {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) return null;
  return user;
}

// WHO TO SEND IT TO, BY TYPING A NAME.
//
// Mánu 2026-09-18: "we can just make it so you start typing and the options
// come up of who to send thats all." It is either the staff member themselves
// or the field supervisor for their shift, and `User.supervisorId` is filled in
// for 0 of 99 staff - so there is nothing to derive and the answer is to ask.
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
      // there is no `active` flag on this roster - a leaver carries a
      // `deactivatedAt`, and sending an amendment to one is sending it nowhere
      deactivatedAt: null,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { preferredFirstName: { contains: q, mode: "insensitive" } },
        { preferredLastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, email: true, role: true, preferredFirstName: true, preferredLastName: true },
    orderBy: { name: "asc" },
    take: 8,
  });
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    // what to show: the name they go by, with the account name behind it when
    // they differ, so two people called Brandon are still tellable apart
    label: [u.preferredFirstName, u.preferredLastName].filter(Boolean).join(" ") || u.name || u.email,
  }));
}

// EVERYTHING THE OFFICE KNOWS, BEFORE ANYBODY IS ASKED ANYTHING.
//
// The form is stronger the less of it somebody has to remember, so the create
// screen carries the shift as the office holds it and the recipient confirms
// rather than reconstructs.
//
// THE REASON IS NOT ON THIS SCREEN, and that is not the same as not being
// asked. It is required on the form the person who was there fills in - see
// `fillAmendment` - because they are the only one who knows it, and collecting
// it is the point of the exercise rather than a field on the way to one.
export async function createAmendment(form) {
  const user = await requireDesk();
  if (!user) return { ok: false, error: "auth" };

  const str = (k, max = 120) => String(form.get(k) ?? "").trim().slice(0, max) || null;
  const staffId = str("staffId", 40);
  const recipientId = str("recipientId", 40);
  const clientName = str("clientName");
  const service = str("service");
  const shiftDate = str("shiftDate", 10);

  if (!staffId || !recipientId) return { ok: false, error: "who" };
  if (!clientName || !service || !shiftDate) return { ok: false, error: "shift" };
  // the date the rest of this app writes, so a row here and a row on a
  // timesheet are the same day without either side parsing
  if (!/^\d{2}\/\d{2}\/\d{2}$/.test(shiftDate)) return { ok: false, error: "date" };

  // both have to be real accounts: the finished copy is mailed to the staff
  // member, and the link goes to whoever was asked
  const [staff, recipient] = await Promise.all([
    prisma.user.findUnique({ where: { id: staffId }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: recipientId }, select: { id: true, email: true } }),
  ]);
  if (!staff || !recipient) return { ok: false, error: "who" };

  const a = await prisma.clockAmendment.create({
    data: {
      staffId, recipientId, clientName, service, shiftDate,
      scheduledIn: str("scheduledIn", 12), scheduledOut: str("scheduledOut", 12),
      clockedIn: str("clockedIn", 12), clockedOut: str("clockedOut", 12),
      // their own service note for this visit, copied at creation rather than
      // joined - a note edited later must not change what a signed form says
      // it was confirming
      dsnStart: str("dsnStart", 12), dsnEnd: str("dsnEnd", 12),
      dsnSummary: str("dsnSummary", 2000),
      createdById: user.id,
    },
    select: { id: true },
  });

  revalidatePath("/portal/admin/clock-amendments");
  return { ok: true, id: a.id };
}

// WHAT THE RECIPIENT SENT BACK. Their signature, and the client's where one
// could be collected.
export async function fillAmendment(id, form) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "auth" };
  const a = await prisma.clockAmendment.findUnique({
    where: { id: String(id || "") },
    select: { id: true, recipientId: true, approvedAt: true },
  });
  if (!a) return { ok: false, error: "notfound" };
  // only the person who was asked, and never after it has been approved - an
  // approved amendment is a document somebody put their name to
  if (a.recipientId !== user.id) return { ok: false, error: "auth" };
  if (a.approvedAt) return { ok: false, error: "approved" };

  const str = (k, max = 300) => String(form.get(k) ?? "").trim().slice(0, max) || null;
  const reasonCode = str("reasonCode", 20);
  const reasonText = str("reasonText", 2000);
  if (!isReasonCode(reasonCode)) return { ok: false, error: "reason" };
  // "something else" that does not say what else is not a reason
  if (reasonNeedsText(reasonCode) && !reasonText) return { ok: false, error: "reasontext" };
  const actualOut = str("actualOut", 12);
  if (!actualOut) return { ok: false, error: "times" };

  await prisma.clockAmendment.update({
    where: { id: a.id },
    data: {
      reasonCode, reasonText,
      actualIn: str("actualIn", 12), actualOut,
      filledName: str("filledName", 120) || user.name,
      filledAt: new Date(),
      clientSigner: str("clientSigner", 120),
      clientSignerKind: str("clientSignerKind", 20),
      clientSignedAt: str("clientSigner", 120) ? new Date() : null,
      clientUnavailableReason: str("clientUnavailableReason", 500),
    },
  });
  revalidatePath("/portal/admin/clock-amendments");
  return { ok: true };
}
