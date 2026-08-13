"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { isCheckStatus, isContactVia, asksHow, statusAfter, isMarkAction } from "@/lib/timesheet/check-status";
import { bumpBatchVersion } from "@/lib/timesheet-presence";

// WHERE A PERSON HAS GOT TO, set from any of the three screens that list them.
//
// A working marker between the people reviewing a batch. It moves no figure and
// the employee never sees it. It used to be a single red flag - pressed or not -
// and now carries one of the three states in `check-status.js`, because "we
// messaged them" and "we messaged them and heard nothing" are different facts
// and only the second one means chase.
//
// Anybody who may manage timesheets can change anybody's. It is a shared
// worklist rather than a personal one, so a mark nobody can move but its author
// is a mark that outlives its usefulness. WHO set it is still recorded and is
// the point: Mánu and Gabe need to see who has contacted who.
export async function setCheckFlag({ batchId, rowKey, status, via = null }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) return { ok: false, error: "forbidden" };
  if (!batchId || !rowKey) return { ok: false, error: "missing" };
  // null clears it. Anything else has to be one of the three - an unknown string
  // would land in the column and render as no chip at all, which looks exactly
  // like "not started" while occupying the row.
  if (status != null && !isCheckStatus(status)) return { ok: false, error: "badstatus" };
  // HOW is only a question on "contacted", and an unknown value is refused
  // rather than stored - a `via` the icon cannot draw is a column with a secret
  // in it. Anything arriving on a state that does not ask is dropped, so the row
  // never claims somebody was phoned about a QSP verification.
  const how = asksHow(status) && isContactVia(via) ? via : null;
  // WHAT THEY ARE LEFT IN, which is not always what was pressed. Contacting
  // somebody leaves them WAITING - see `statusAfter`. The log below still
  // records the event that happened rather than the state it produced, because
  // "Contacted by phone" is the fact worth keeping and "waiting" is a
  // consequence anybody can re-derive.
  const resting = status == null ? null : statusAfter(status);

  // THE DESIRED STATE, NOT A TOGGLE. This read the row and flipped it, which is
  // the obvious shape and is wrong the moment the call happens twice: React
  // re-invokes a transition callback in development, so one click created the
  // flag and then immediately removed it, and the mark vanished on reload with
  // nothing in the log to say why. Sending what the button should END UP as
  // makes a repeat call a no-op instead of an undo.
  if (status == null) {
    // THE HISTORY SURVIVES. Clearing means "back on the pile", not "nobody ever
    // called them" - and deleting the log here would quietly destroy the record
    // this whole thing exists to keep.
    await prisma.timesheetCheckFlag.deleteMany({ where: { batchId, rowKey } });
  } else {
    // WHOEVER MOVED IT LAST OWNS THE MARK. On `update` the name and picture are
    // rewritten, not left alone: if Gabe messages somebody Mánu had already
    // marked, the row has to say Gabe, or "who has contacted who" answers with
    // whoever happened to touch it first.
    const who = {
      flaggedById: user.id,
      // copied rather than joined - see the model comment. The preferred name
      // is the one the rest of the portal shows people by.
      flaggedName: preferredName(user) || user.name || user.email || null,
      flaggedImage: user.image || null,
    };
    // ONE TRANSACTION, because the flag is the newest log row materialised and
    // a crash between the two would leave a current state with no record of how
    // it got there - exactly the thing being asked for.
    // THE LOG RECORDS WHAT SOMEBODY DID, and only that. "Waiting response" is
    // where contacting them leaves the person, not an act - logging it would put
    // a line under the card that says the same thing as the line above it.
    const writes = [
      prisma.timesheetCheckFlag.upsert({
        where: { batchId_rowKey: { batchId, rowKey } },
        update: { status: resting, via: how, ...who },
        create: { batchId, rowKey, status: resting, via: how, ...who },
      }),
    ];
    if (isMarkAction(status)) {
      writes.push(
        prisma.timesheetContactLog.create({
          data: {
            batchId,
            rowKey,
            status,
            via: how,
            byId: user.id,
            byName: who.flaggedName,
            byImage: who.flaggedImage,
          },
        }),
      );
    }
    // one transaction, so a current state never exists without the event that
    // produced it
    await prisma.$transaction(writes);
  }

  // all three screens carry these marks now, so all three have to be refreshed
  // or the one you are not looking at keeps yesterday's answer
  // tell anybody else's open tab that something moved, so their poll picks it
  // up without them reloading
  await bumpBatchVersion(batchId);
  revalidatePath(`/portal/admin/timesheets/${batchId}/checks`);
  revalidatePath(`/portal/admin/timesheets/${batchId}/people`);
  return { ok: true, status: resting, via: how };
}

// RAISE A FLAG ON A ROW, or take your own back down.
//
// Mánu 2026-08-13: "multiple people can flag the same one ... it'll show by who
// next to the flag."
//
// Separate from `setCheckFlag` on purpose. That one sets the single current
// STATUS of a person and the last writer owns it. This is a per-reviewer mark
// with no state in it, and two people flagging the same card is the normal case.
//
// YOU ONLY EVER TOGGLE YOUR OWN. Pressing it cannot take somebody else's flag
// off, which is what makes it safe to leave visible to everybody: a flag means
// "I want eyes on this" and only the person who said it gets to unsay it.
export async function toggleRowFlag({ batchId, rowKey }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) return { ok: false, error: "forbidden" };
  if (!batchId || !rowKey) return { ok: false, error: "missing" };

  const mine = await prisma.timesheetRowFlag.findUnique({
    where: { batchId_rowKey_userId: { batchId, rowKey, userId: user.id } },
    select: { id: true },
  });

  if (mine) {
    await prisma.timesheetRowFlag.delete({ where: { id: mine.id } });
  } else {
    await prisma.timesheetRowFlag.create({
      data: {
        batchId,
        rowKey,
        userId: user.id,
        userName: preferredName(user) || user.name || user.email || null,
        userImage: user.image || null,
      },
    });
  }

  // tell anybody else's open tab that something moved, so their poll picks it
  // up without them reloading
  await bumpBatchVersion(batchId);
  revalidatePath(`/portal/admin/timesheets/${batchId}/checks`);
  revalidatePath(`/portal/admin/timesheets/${batchId}/people`);
  return { ok: true, flagged: !mine };
}

// LEAVE A NOTE ON SOMEBODY, for whoever is working the list next.
//
// Mánu 2026-08-13: "I also want to add a little comment section. Underneath each
// card." It is the sentence the status and the log cannot hold - "her phone is
// broken, use the email" is not an event and not a state.
//
// INTERNAL. Behind `canManageTimesheets` like everything else on these screens,
// and nothing renders it to an employee.
export async function addRowComment({ batchId, rowKey, body }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) return { ok: false, error: "forbidden" };
  if (!batchId || !rowKey) return { ok: false, error: "missing" };

  // trimmed and capped here rather than trusted from the client. An empty
  // comment is a no-op rather than a row, so a stray Enter leaves nothing.
  const text = String(body ?? "").trim().slice(0, 2000);
  if (!text) return { ok: false, error: "empty" };

  await prisma.timesheetRowComment.create({
    data: {
      batchId,
      rowKey,
      userId: user.id,
      userName: preferredName(user) || user.name || user.email || null,
      userImage: user.image || null,
      body: text,
    },
  });

  // tell anybody else's open tab that something moved, so their poll picks it
  // up without them reloading
  await bumpBatchVersion(batchId);
  revalidatePath(`/portal/admin/timesheets/${batchId}/checks`);
  revalidatePath(`/portal/admin/timesheets/${batchId}/people`);
  return { ok: true };
}

// take your own note back down. ONLY YOUR OWN, unlike the status mark which
// anybody may move: a mark is a shared worklist state, and a comment is
// something a particular person said. Deleting somebody else's sentence is a
// different act from moving a shared flag.
export async function deleteRowComment(id) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) return { ok: false, error: "forbidden" };

  const row = await prisma.timesheetRowComment.findUnique({
    where: { id },
    select: { id: true, batchId: true, userId: true },
  });
  if (!row) return { ok: false, error: "gone" };
  if (row.userId !== user.id) return { ok: false, error: "notyours" };

  await prisma.timesheetRowComment.delete({ where: { id: row.id } });
  await bumpBatchVersion(row.batchId);
  revalidatePath(`/portal/admin/timesheets/${row.batchId}/checks`);
  revalidatePath(`/portal/admin/timesheets/${row.batchId}/people`);
  return { ok: true };
}
