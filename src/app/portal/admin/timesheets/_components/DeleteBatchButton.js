"use client";

// deleting a batch is not recoverable, so the confirm names exactly what goes -
// especially signatures, which are somebody else's attestation and not ours to
// throw away casually. the counts are read from the server at click time rather
// than passed in stale.
import { useState } from "react";
import { deleteBatch, batchDeletionImpact } from "../actions";

export default function DeleteBatchButton({ batchId, period }) {
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const n = await batchDeletionImpact(batchId);
      const lines = [
        `Delete the ${period} batch?`,
        "",
        `${n.sheets} timesheet${n.sheets === 1 ? "" : "s"} will be removed.`,
      ];
      if (n.sent) lines.push(`${n.sent} had already been emailed to staff.`);
      if (n.signed) {
        lines.push(
          `${n.signed} ${n.signed === 1 ? "has" : "have"} been SIGNED by the employee. Those signatures are destroyed and cannot be recovered.`,
        );
      }
      if (n.approved) lines.push(`${n.approved} had management sign-off.`);
      lines.push("", "This cannot be undone.");

      if (!window.confirm(lines.join("\n"))) {
        setBusy(false);
        return;
      }
      await deleteBatch(batchId);
    } catch {
      // a redirect throws by design in a server action; anything else and the
      // button simply comes back
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="rounded-md border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/30"
    >
      {busy ? "Deleting…" : "Delete this batch"}
    </button>
  );
}
