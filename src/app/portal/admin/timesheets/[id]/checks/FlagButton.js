"use client";

import { useState, useTransition } from "react";
import { setCheckFlag } from "./flag-actions";

// THE RED MARK, bottom right of a checks card.
//
// Mánu 2026-08-12: "a little mark as red button that then puts whoever presses
// it as marked as red using their avatar picture." Unpressed it is a quiet
// outline; pressed it is red and wears the avatar of whoever pressed it, so a
// row somebody has already looked at is obvious from across the list.
//
// OPTIMISTIC, because the server action revalidates the whole page and a
// half-second of nothing after a click reads as a dead button. The state is
// re-seeded from the server on the next render, so a failed write corrects
// itself rather than leaving a mark that is not really there.
export default function FlagButton({ batchId, rowKey, flag }) {
  // WHAT THE CLICK ASKED FOR, held only while the write is in flight. The state
  // used to be seeded from `flag` once and then owned by the component, which
  // meant it never re-synced: after `revalidatePath` the server sent the new
  // truth and the button carried on showing whatever it had decided. Falling
  // back to the prop the moment the transition settles makes the server the
  // authority, so a failed or refused write corrects itself with no rollback
  // bookkeeping.
  const [want, setWant] = useState(null);
  const [pending, start] = useTransition();
  const on = want === null ? !!flag : want;
  const who = on ? flag : null;

  const click = () => {
    const next = !on;
    setWant(next);
    start(async () => {
      await setCheckFlag({ batchId, rowKey, on: next });
      // and hand authority back to the server copy, whatever it says
      setWant(null);
    });
  };

  return (
    <button
      type="button"
      onClick={click}
      disabled={pending}
      aria-pressed={on}
      title={on && who?.flaggedName ? `Flagged by ${who.flaggedName}` : "Mark this for someone to look at"}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold transition ${
        on
          ? "border-rose-500 bg-rose-500 text-white"
          : "border-border text-muted hover:border-rose-400 hover:text-rose-600"
      } ${pending ? "opacity-60" : ""}`}
    >
      {/* the avatar only once there is one to show, so an un-flagged button is
          not a ghost circle waiting for a face */}
      {on && who?.flaggedImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={who.flaggedImage}
          alt=""
          className="-ml-1 h-4 w-4 rounded-full object-cover ring-1 ring-white/70"
        />
      ) : (
        <span aria-hidden="true" className={on ? "text-white" : "text-rose-500"}>●</span>
      )}
      {on ? (who?.flaggedName ? who.flaggedName.split(" ")[0] : "Flagged") : "Flag"}
    </button>
  );
}
