"use client";

import { useState, useTransition } from "react";
import Avatar from "@/components/Avatar";
import { toggleRowFlag } from "./flag-actions";
import { useReadOnly } from "../ReadOnly";

// I WANT EYES ON THIS ONE, and so might somebody else.
//
// Mánu 2026-08-13: "Give a little flag icon under mark again. If you flag it,
// the card gets a red outline over it. And multiple people can flag it. And
// it'll show by who next to the flag ... The flag should still be visible for
// anyone viewing this and multiple people can flag the same one."
//
// So the flag is PER REVIEWER. Pressing it raises or lowers YOUR OWN and never
// touches anybody else's - which is what makes it safe to leave on a shared
// screen. The faces beside it are everybody who has flagged this row, and they
// stay visible to whoever is looking.
//
// The red outline on the card is drawn by the page, not here: it belongs to the
// card and this component does not own that box.
export default function RowFlagButton({ batchId, rowKey, flags = [], mine = false, me = null }) {
  // A REPLACED UPLOAD IS READ ONLY. The server refuses every write on one
  // regardless - this only stops the click being wasted, and says why.
  const readOnly = useReadOnly();

  // what the click asked for, held only while the write is in flight
  const [want, setWant] = useState(undefined);
  const [pending, start] = useTransition();
  const on = want === undefined ? mine : want;

  const click = () =>
    start(async () => {
      const next = !on;
      setWant(next);
      const res = await toggleRowFlag({ batchId, rowKey });
      // the server is the authority. A refused or failed write drops back to the
      // prop rather than leaving a flag on screen that is not in the database.
      if (!res?.ok) setWant(undefined);
    });

  // everybody who has flagged it, with mine shown optimistically so the click
  // lands immediately rather than waiting for the page to revalidate
  const shown = want === undefined ? flags : flags.filter((f) => !f.isMe);

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={click}
        disabled={pending || !!readOnly}
        aria-pressed={on}
        aria-label={on ? "Remove your flag" : "Flag this for a second look"}
        title={
          readOnly
            ? "This upload has been replaced. Flag it on the current one."
            : on ? "Remove your flag" : "Flag this for a second look"
        }
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold transition disabled:opacity-50 ${
          on
            ? "border-rose-400 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
            : "border-dashed border-border-strong text-faint hover:border-rose-400 hover:text-rose-600"
        }`}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 16 16"
          aria-hidden="true"
          fill={on ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          <path d="M3.5 14V2.5" />
          <path d="M3.5 3h8.2l-1.6 2.6L11.7 8.2H3.5z" />
        </svg>
        Flag
      </button>

      {/* WHO RAISED IT. The whole reason the flag is worth having on a screen
          two people share: a red card nobody is named on tells you something is
          wrong and not who to ask about it. */}
      {(shown.length > 0 || (on && want !== undefined)) && (
        <span className="flex items-center">
          {shown.map((f) => (
            <span
              key={f.id}
              title={f.userName || "somebody"}
              className="-ml-1.5 rounded-full ring-2 ring-surface first:ml-0"
            >
              <Avatar name={f.userName} image={f.userImage} size={18} />
            </span>
          ))}
          {/* MY OWN FACE while the write is in flight, so the click lands
              immediately. It used to pass the literal string "you" as the name,
              which `Avatar` dutifully turned into the initials "YO" - a
              placeholder leaking into the screen. The real name and picture come
              down as `me`. */}
          {on && want !== undefined && (
            <span className="-ml-1.5 rounded-full opacity-70 ring-2 ring-surface first:ml-0">
              <Avatar name={me?.name} email={me?.email} image={me?.image} size={18} />
            </span>
          )}
        </span>
      )}
    </span>
  );
}
