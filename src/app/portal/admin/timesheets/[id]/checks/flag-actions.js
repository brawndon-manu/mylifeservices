"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { isCheckStatus, isContactVia, asksHow, statusAfter, isMarkAction } from "@/lib/timesheet/check-status";
import { bumpBatchVersion } from "@/lib/timesheet-presence";
import { isBreakAnswer, isHeardVia } from "@/lib/timesheet/break-answers";
import { supersededBy, supersededByForTimesheet, refusal } from "@/lib/timesheet/superseded";

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
export async function setCheckFlag({
  batchId, rowKey, status, via = null,
  // WHAT THE MARK IS ACTUALLY ABOUT - see mark-key.js. Passed alongside the old
  // rowKey rather than instead of it: the old columns still carry the audit of
  // which upload a mark was first made on, and production may still be reading
  // them.
  personKey = null, findingKey = null,
  // HOW FAR THE DATA REACHED ON THE SCREEN THEY WERE LOOKING AT. Comes from the
  // page rather than being re-derived here, because the honest claim is "I went
  // through everything this screen showed me", and the screen is the authority
  // on what that was.
  coveredThrough = null,
}) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) return { ok: false, error: "forbidden" };
  if (!batchId || !rowKey) return { ok: false, error: "missing" };
  // A REPLACED UPLOAD IS READ ONLY - see superseded.js. Refused on the SERVER,
  // because hiding a button is a suggestion and this one has to be a rule.
  {
    const newer = await supersededBy(batchId);
    if (newer) return refusal(newer);
  }
  // a horizon that is not a date QSP would print is dropped rather than stored.
  // A junk value here would make every staleness comparison silently false.
  const covered = /^\d{2}\/\d{2}\/\d{2}$/.test(String(coveredThrough || "")) ? coveredThrough : null;
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
  // THE PERIOD, which is what makes a mark outlive the upload. Read here rather
  // than trusted from the client, because it decides which marks a later upload
  // will find and it is printed on the document either way.
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id: batchId },
    select: { periodFrom: true, periodTo: true },
  });
  if (!batch) return { ok: false, error: "nobatch" };
  const keyed = !!(personKey && findingKey);
  const where = {
    periodFrom: batch.periodFrom, periodTo: batch.periodTo, personKey, findingKey,
  };

  if (status == null) {
    // THE HISTORY SURVIVES. Clearing means "back on the pile", not "nobody ever
    // called them" - and deleting the log here would quietly destroy the record
    // this whole thing exists to keep.
    //
    // Cleared BY THE PERIOD KEY when we have one, so taking a mark off on the
    // 08/12 batch also takes off the copy made on the 08/09 one. Clearing only
    // this batch's row would leave the older copy behind and the mark would
    // reappear on the next read.
    await prisma.timesheetCheckFlag.deleteMany(
      keyed ? { where } : { where: { batchId, rowKey } },
    );
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
    //
    // FOUND BY THE PERIOD KEY, NOT UPSERTED ON IT. There is no unique index on
    // (period, person, finding) yet - two marks from two uploads of one
    // fortnight can still share a key, and collapsing them means deleting a row
    // somebody made. So the existing mark is looked up and moved, and its
    // batchId and rowKey are left ALONE: those columns are now the record of
    // which upload it was first raised on.
    const existing = keyed
      ? await prisma.timesheetCheckFlag.findFirst({
        where, orderBy: { updatedAt: "desc" }, select: { id: true },
      })
      : null;
    const fields = {
      status: resting, via: how, ...who,
      ...where, coveredThrough: covered,
    };
    const writes = [
      existing
        ? prisma.timesheetCheckFlag.update({ where: { id: existing.id }, data: fields })
        : prisma.timesheetCheckFlag.upsert({
          where: { batchId_rowKey: { batchId, rowKey } },
          update: fields,
          create: { batchId, rowKey, ...fields },
        }),
    ];
    if (isMarkAction(status)) {
      writes.push(
        prisma.timesheetContactLog.create({
          data: {
            batchId,
            rowKey,
            // the log carries the same key, and it is the half that CANNOT be
            // rebuilt: a mark can be re-made, "we rang them twice" cannot
            ...where,
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
  // A REPLACED UPLOAD IS READ ONLY - see superseded.js. Refused on the SERVER,
  // because hiding a button is a suggestion and this one has to be a rule.
  {
    const newer = await supersededBy(batchId);
    if (newer) return refusal(newer);
  }

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
  // A REPLACED UPLOAD IS READ ONLY - see superseded.js. Refused on the SERVER,
  // because hiding a button is a suggestion and this one has to be a rule.
  {
    const newer = await supersededBy(batchId);
    if (newer) return refusal(newer);
  }

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
  // a replaced upload is read only, and a note is a change like any other
  {
    const newer = await supersededBy(row.batchId);
    if (newer) return refusal(newer);
  }

  await prisma.timesheetRowComment.delete({ where: { id: row.id } });
  await bumpBatchVersion(row.batchId);
  revalidatePath(`/portal/admin/timesheets/${row.batchId}/checks`);
  revalidatePath(`/portal/admin/timesheets/${row.batchId}/people`);
  return { ok: true };
}

// WHAT THEY SAID ABOUT A BREAK THEY DID NOT TAKE.
//
// The one thing none of the four QSP exports carries. The rest report's
// Schedule Notes are about late clock-ins - "forgot to punch in", "traffic" -
// and the timesheet's comments block is the same field time-ranged against a
// shift. So every reason here is gathered fresh, from a call or a text, or from
// what the employee writes on their own page.
//
// KEYED ON (period, person, finding), never on the timesheet. Corrections are
// timesheet-scoped and die on every re-upload, which is what stranded 70
// contact marks. A reason taken off a phone call must survive the next export.
export async function setBreakAnswer({
  batchId, personKey, findingKey, date = null, kind = "meal",
  answer, reason = null, via = null,
  // HOW MANY OF THEM THEY TOOK, and how many the day was short. A meal is one
  // thing; a rest violation is "0 of 2 recorded" and taking one of the two is a
  // real answer that neither button could say on its own.
  takenCount = null, missingCount = null,
}) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) return { ok: false, error: "forbidden" };
  if (!batchId || !personKey || !findingKey) return { ok: false, error: "missing" };
  // A REPLACED UPLOAD IS READ ONLY - see superseded.js. Refused on the SERVER,
  // because hiding a button is a suggestion and this one has to be a rule.
  {
    const newer = await supersededBy(batchId);
    if (newer) return refusal(newer);
  }

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id: batchId },
    select: { periodFrom: true, periodTo: true },
  });
  if (!batch) return { ok: false, error: "nobatch" };
  const where = {
    periodFrom_periodTo_personKey_findingKey: {
      periodFrom: batch.periodFrom, periodTo: batch.periodTo, personKey, findingKey,
    },
  };

  // null clears it, the same shape as the contact marks: pressing the answer it
  // already holds takes it back off rather than writing it twice.
  if (answer == null) {
    await prisma.timesheetBreakAnswer.deleteMany({
      where: { periodFrom: batch.periodFrom, periodTo: batch.periodTo, personKey, findingKey },
    });
    await bumpBatchVersion(batchId);
    revalidatePath(`/portal/admin/timesheets/${batchId}/checks`);
    revalidatePath(`/portal/admin/timesheets/${batchId}/people`);
    return { ok: true, answer: null };
  }
  if (!isBreakAnswer(answer)) return { ok: false, error: "badanswer" };

  // trimmed and capped here rather than trusted. An empty reason is NOT an
  // empty string: null is a state - nobody gathered one - and it is what moves
  // the question to the employee.
  const why = String(reason ?? "").trim().slice(0, 1000) || null;
  const heard = isHeardVia(via) ? via : null;
  const who = {
    byId: user.id,
    byName: preferredName(user) || user.name || user.email || null,
    byImage: user.image || null,
  };
  const missing = Math.max(1, Number(missingCount) || 1);
  // clamped to what the day could possibly allow, because it arrives from the
  // browser and decides whether a reason is still owed
  const took = answer === "not-taken"
    ? 0
    : Math.min(missing, Math.max(0, Number(takenCount) || 0)) || missing;
  const fields = {
    date, kind,
    answer,
    takenCount: took, missingCount: missing,
    // A REASON BELONGS TO WHAT WAS MISSED, not to which button was pressed.
    // Taking one of two rests still leaves one nobody took, and that one is owed
    // a why. Only an answer that accounts for every missing one has nothing to
    // explain, and a reason arriving on that is dropped rather than stored.
    reason: took < missing ? why : null,
    via: heard,
    ...who,
  };

  await prisma.timesheetBreakAnswer.upsert({
    where,
    update: {
      ...fields,
      // OUR WORDING CHANGED, SO THEIR AGREEMENT TO THE OLD ONE IS STALE. They
      // confirmed a sentence, not a row, and quietly keeping the tick against
      // different words is how somebody ends up having attested to something
      // nobody read to them.
      confirmedAt: null,
      confirmedText: null,
    },
    create: {
      periodFrom: batch.periodFrom, periodTo: batch.periodTo, personKey, findingKey,
      ...fields,
    },
  });

  await bumpBatchVersion(batchId);
  revalidatePath(`/portal/admin/timesheets/${batchId}/checks`);
  revalidatePath(`/portal/admin/timesheets/${batchId}/people`);
  return { ok: true, answer, reason: fields.reason };
}
