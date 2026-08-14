"use client";

// WHO IS IN THIS BATCH, ON THE BATCH'S OWN CARD.
//
// This lived in a strip above the whole list, which answers "is anybody
// working" but not "which one are they in" - and the second is the question,
// because the answer decides whether it is safe to upload over that period.
//
// NOTHING WHEN NOBODY IS THERE. An empty slot on every card would be a row of
// reassurance that costs a glance each time, and the only moment this matters
// is the moment it is not empty.
//
// A DIMMED FACE IS SOMEBODY WHOSE WINDOW IS BEHIND ANOTHER ONE - usually them
// in QuickSolve making the fix, which is the least safe moment to replace the
// export they will come back to. Solid means they are looking at it now.
import PresenceProvider, { usePresence } from "../[id]/Presence";
import Avatar from "@/components/Avatar";

function Faces() {
  const here = usePresence();
  if (!here.length) return null;
  const away = here.filter((p) => p.hidden).length;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-50 py-0.5 pl-0.5 pr-2.5 dark:border-sky-800/70 dark:bg-sky-950/40"
      title={here
        .map((p) => `${p.name || "Somebody"}${p.hidden ? " (in another window)" : ""}`)
        .join(" · ")}
    >
      <span className="flex items-center">
        {here.slice(0, 4).map((p) => (
          <span
            key={p.userId}
            className={`-mr-1.5 rounded-full ring-2 ring-surface last:mr-0.5 ${p.hidden ? "opacity-50" : ""}`}
          >
            <Avatar name={p.name} image={p.image} size={20} />
          </span>
        ))}
      </span>
      <span className="text-[11px] font-bold text-sky-800 dark:text-sky-300">
        {here.length} here{away ? ` · ${away} away` : ""}
      </span>
    </span>
  );
}

// WATCH ONLY. Reading a card is not opening the batch, and the first version of
// this announced itself - so loading the list put you inside every period you
// could see, and the screen asking "is anybody in there" was what put somebody
// in there.
//
// ONLY POINTED AT PERIODS SOMEBODY MIGHT ACTUALLY BE IN. Every card polling
// would be one request per pay period per tab, and a period finished months ago
// is not one anybody is chasing. The caller decides; this just refuses to mount
// a poller it was not given a batch for.
export default function CardPresence({ batchId, alsoBatchIds = [] }) {
  if (!batchId) return null;
  return (
    <PresenceProvider batchId={batchId} alsoBatchIds={alsoBatchIds} watchOnly>
      <Faces />
    </PresenceProvider>
  );
}
