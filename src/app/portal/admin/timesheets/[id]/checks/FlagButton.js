"use client";

import { useState, useTransition } from "react";
import ContactViaIcon from "@/components/ContactViaIcon";
import { setCheckFlag } from "./flag-actions";
import { CHECK_STATUSES, CONTACT_VIAS, MARK_OPTIONS, asksHow, statusAfter, normalizeCheckStatus } from "@/lib/timesheet/check-status";

// THE ACT OF MARKING. Where they currently ARE is `CheckStatusChip`, which is a
// label and sits elsewhere on the row.
//
// They used to be one control - the chip was the button - and Mánu 2026-08-13
// split them: "the ability to mark should stay. even if they've selected
// something? so they can put the options. Again, you can put contact again or
// change it."
//
// That is the important behaviour here. This button does NOT disappear or turn
// into a chip once a state is set, because contacting somebody a second time is
// a normal thing that happens and every one of those is a row in the log. A
// control that hides once used cannot record the second call.
//
// TWO STEPS ONLY ON THE ONE THAT NEEDS IT. "Waiting" and "Verified" write
// immediately; "Contacted" swaps to phone-or-email. Making all three two-click
// would tax the two states that have nothing more to say.
//
// OPTIMISTIC, because the server action revalidates the whole page and half a
// second of nothing after a click reads as a dead button. The state is re-seeded
// from the server on the next render, so a failed write corrects itself.
export default function FlagButton({ batchId, rowKey, flag }) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(null);
  const [pending, start] = useTransition();

  // through the normaliser: a row still stored as "verified" is a row somebody
  // already marked, and without this the button offers Responded as if it were
  // unpressed and the second press would silently clear it
  const current = normalizeCheckStatus(flag?.status);
  const marked = !!current;

  const write = (status, via = null) =>
    start(async () => {
      setOpen(false);
      setAsking(null);
      // NO "SAVED" CONFIRMATION HERE. There was one, and it stuck: it was set
      // on success and only cleared when the picker was reopened, so a marked
      // row sat reading "Saved" forever. Mánu: "Why does it say saved?"
      //
      // It was redundant even working. The chip beside it changes to the new
      // state and a line appears in the log underneath - the row confirms the
      // write twice already, in the places somebody is actually looking.
      await setCheckFlag({ batchId, rowKey, status, via });
    });

  const choose = (key) => {
    // pressing the state it is already in takes it off, which is the undo. Only
    // where there is no second step - "contacted" always means a new contact.
    if (statusAfter(key) === current && !asksHow(key)) return write(null);
    if (asksHow(key)) return setAsking(key);
    return write(key);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-strong px-2.5 py-1 text-[11px] font-semibold text-faint transition hover:border-brand hover:text-brand disabled:opacity-50"
      >
        <span aria-hidden="true" className="text-sm leading-none">+</span>
        {pending ? "Saving..." : marked ? "Mark again" : "Mark"}
      </button>
    );
  }

  if (asking) {
    return (
      <div className="inline-flex flex-wrap items-center gap-1">
        <span className="text-[11px] font-semibold text-faint">Contacted by</span>
        {CONTACT_VIAS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => write(asking, v.key)}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-800 disabled:opacity-50 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-300"
          >
            <ContactViaIcon via={v.key} />
            {v.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAsking(null)}
          className="px-1.5 text-[11px] font-medium text-faint hover:text-foreground"
        >
          back
        </button>
      </div>
    );
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      {/* THE TWO ACTIONS, not the three states. "Waiting response" is what
          contacting somebody LEAVES them in - see `statusAfter` - so offering it
          as a button asked for a second click nobody should have to think
          about. */}
      {CHECK_STATUSES.filter((s) => MARK_OPTIONS.includes(s.key)).map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => choose(s.key)}
          disabled={pending}
          aria-pressed={current === statusAfter(s.key)}
          className={`rounded-full border px-2 py-1 text-[11px] font-semibold transition disabled:opacity-50 ${
            current === statusAfter(s.key) ? s.chip : "border-border-strong text-muted hover:text-foreground"
          }`}
        >
          {s.key === "contacted" ? "Contacted" : s.short}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="px-1.5 text-[11px] font-medium text-faint hover:text-foreground"
      >
        cancel
      </button>
    </div>
  );
}
