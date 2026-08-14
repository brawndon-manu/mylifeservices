"use client";

// DON'T UPLOAD ON TOP OF SOMEBODY.
//
// Mánu 2026-08-14, on the upload screen: if Gabe is currently chasing people
// down, a new batch landing underneath him is a screen that changes while he is
// reading it - and a mark he sets in that moment is set against findings the
// upload is in the middle of replacing.
//
// The presence machinery already existed one level in, on the checks and people
// screens. It is the same heartbeat, pointed at the batch about to be replaced
// and read from the one place where the answer changes what somebody does next.
//
// A WARNING, NOT A BLOCK. Two people uploading and reviewing at once is normal
// and often fine; the thing worth preventing is doing it without knowing.
import { usePresence } from "../[id]/Presence";
import Avatar from "@/components/Avatar";

export default function WorkingNow({ period = null, quiet = false }) {
  const here = usePresence();

  // NOTHING WHEN NOBODY IS THERE, rather than "nobody is here". An empty state
  // for this would be a line of reassurance on every page load, and the only
  // moment it matters is the moment it is not empty.
  if (!here.length) return null;

  const names = here.map((p) => p.name || "Somebody");
  const who =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

  // SOMEBODY IN QUICKSOLVE WITH THE BATCH OPEN IS THE CASE THIS EXISTS FOR, and
  // their window is behind another one, so they read as hidden. Worth saying out
  // loud rather than folding into "working": switching away is usually them
  // going to make the fix, which is the least safe moment to replace the export
  // underneath them.
  const away = here.filter((p) => p.hidden).length;
  const looking = here.length - away;

  return (
    <div
      className={`mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5 ${
        quiet
          ? "border-sky-300 bg-sky-50 dark:border-sky-800/70 dark:bg-sky-950/30"
          : "border-amber-300 bg-amber-50 dark:border-amber-700/70 dark:bg-amber-950/30"
      }`}
    >
      <span className="flex items-center">
        {here.slice(0, 6).map((p) => (
          <span
            key={p.userId}
            title={
              p.hidden
                ? `${p.name || "Somebody"} has it open in another window`
                : p.page === "upload"
                  ? `${p.name || "Somebody"} is on the upload screen`
                  : `${p.name || "Somebody"} is looking at it`
            }
            // a dimmed face for a window that is not in front of them, so the
            // strip says at a glance who is reading and who has stepped out
            className={`-ml-1.5 rounded-full ring-2 ring-surface first:ml-0 ${p.hidden ? "opacity-55" : ""}`}
          >
            <Avatar name={p.name} image={p.image} size={22} />
          </span>
        ))}
      </span>
      <span className={`text-sm ${quiet ? "text-sky-900 dark:text-sky-300" : "text-amber-900 dark:text-amber-200"}`}>
        <b>{who}</b>{" "}
        {names.length === 1 ? "has" : "have"} {period ? `the ${period} batch` : "this batch"} open
        {away > 0 && looking === 0
          ? ", in another window right now"
          : away > 0
            ? `, ${away} of them in another window`
            : ""}
        .
        {!quiet && (
          <span className="block text-xs opacity-90">
            {away > 0
              ? "A window switched away is usually somebody in QuickSolve making the fix. Uploading now replaces what they come back to."
              : "Uploading replaces what they are looking at. Worth a word first."}
          </span>
        )}
      </span>
    </div>
  );
}
