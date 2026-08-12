"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";

// PUT A RED MARK ON A CHECKS ROW, OR TAKE IT OFF.
//
// A working marker between the people reviewing a batch. It moves no figure and
// the employee never sees it - the only thing it changes is that the row is red
// and carries the avatar of whoever pressed it.
//
// Anybody who may manage timesheets can clear anybody's. It is a
// shared worklist rather than a personal one, so a mark nobody can remove but
// its author is a mark that outlives its usefulness. Who set it is still
// recorded, which is the part worth keeping.
export async function setCheckFlag({ batchId, rowKey, on }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) return { ok: false, error: "forbidden" };
  if (!batchId || !rowKey) return { ok: false, error: "missing" };

  // THE DESIRED STATE, NOT A TOGGLE. This read the row and flipped it, which is
  // the obvious shape and is wrong the moment the call happens twice: React
  // re-invokes a transition callback in development, so one click created the
  // flag and then immediately removed it, and the mark vanished on reload with
  // nothing in the log to say why. Sending what the button should END UP as
  // makes a repeat call a no-op instead of an undo.
  if (!on) {
    await prisma.timesheetCheckFlag.deleteMany({ where: { batchId, rowKey } });
  } else {
    await prisma.timesheetCheckFlag.upsert({
      where: { batchId_rowKey: { batchId, rowKey } },
      update: {},
      create: {
        batchId,
        rowKey,
        flaggedById: user.id,
        // copied rather than joined - see the model comment. The preferred name
        // is the one the rest of the portal shows people by.
        flaggedName: preferredName(user) || user.name || user.email || null,
        flaggedImage: user.image || null,
      },
    });
  }

  revalidatePath(`/portal/admin/timesheets/${batchId}/checks`);
  return { ok: true, flagged: !!on };
}
