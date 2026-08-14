"use client";

// WHO IS IN WHICH UPLOAD, on the batch list.
//
// A pay period is one card with its earlier uploads folded underneath, and a
// face has to land on the upload somebody is ACTUALLY reading. This merged them
// at first, which put somebody in the 12:36 AM export on the live card - they
// are not in the live one. Two uploads of a fortnight are two documents with two
// sets of timesheet rows, and being in one is not being in the other.
//
// WATCH ONLY. Reading a card is not opening the batch, and an earlier version of
// this announced itself - so loading the list put you inside every period you
// could see, and the screen asking "is anybody in there" was what put somebody
// in there.
//
// ONE POLL FOR THE WHOLE PERIOD. The answer comes back grouped by upload, so the
// card and each folded row read their own slice of it rather than each mounting
// a poller of their own.
import PresenceProvider, { useBatchPresence, useAllBatchPresence } from "../[id]/Presence";
import Avatar from "@/components/Avatar";

// the faces for ONE upload. Renders nothing when nobody is in that one, rather
// than an empty slot on every row.
export function BatchFaces({ batchId, compact = false }) {
  const here = useBatchPresence(batchId);
  if (!here.length) return null;
  const away = here.filter((p) => p.hidden).length;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-50 py-0.5 pl-0.5 dark:border-sky-800/70 dark:bg-sky-950/40 ${
        compact ? "pr-2" : "pr-2.5"
      }`}
      title={here
        .map((p) => `${p.name || "Somebody"}${p.hidden ? " (in another window)" : ""} has this upload open`)
        .join(" · ")}
    >
      <span className="flex items-center">
        {here.slice(0, 4).map((p) => (
          <span
            key={p.userId}
            // a dimmed face is a window behind another one - usually them in
            // QuickSolve making the fix, which is when it matters most
            className={`-mr-1.5 rounded-full ring-2 ring-surface last:mr-0.5 ${p.hidden ? "opacity-50" : ""}`}
          >
            <Avatar name={p.name} image={p.image} size={compact ? 16 : 20} />
          </span>
        ))}
      </span>
      <span className={`font-bold text-sky-800 dark:text-sky-300 ${compact ? "text-[10px]" : "text-[11px]"}`}>
        {here.length} here{away ? ` · ${away} away` : ""}
      </span>
    </span>
  );
}

// HOW MANY ARE IN THE FOLDED ONES, so a shut fold does not hide a person. The
// precise face is on the row inside; this is only the reason to open it.
export function FoldedCount({ batchIds = [] }) {
  // the whole map, then pick - a hook cannot be called once per id in a loop
  const byBatch = useAllBatchPresence();
  const n = new Set(
    batchIds.flatMap((b) => byBatch[b] || []).map((p) => p.userId),
  ).size;
  if (!n) return null;
  return (
    <span className="ml-2 rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-300">
      {n} in {n === 1 ? "one of them" : "them"}
    </span>
  );
}

// ONLY POINTED AT PERIODS SOMEBODY MIGHT ACTUALLY BE IN. A poller per period per
// tab grows for ever, and a fortnight closed months ago is not one anybody is
// chasing. The caller decides; this refuses to mount without a batch.
export default function PeriodPresence({ batchId, alsoBatchIds = [], children }) {
  if (!batchId) return children;
  return (
    <PresenceProvider batchId={batchId} alsoBatchIds={alsoBatchIds} watchOnly>
      {children}
    </PresenceProvider>
  );
}
