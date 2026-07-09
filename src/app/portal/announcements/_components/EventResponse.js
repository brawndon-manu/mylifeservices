"use client";

// staff RSVP to an Event for a headcount. "I'm going" / "Can't make it", and on a
// client event a "how many clients are you bringing?" number. posts the no-frills
// rsvpEvent action, which revalidates so the headcount below updates.
import { useState } from "react";
import { rsvpEvent } from "../actions";

export default function EventResponse({ postId, isClientEvent, myRsvp }) {
  const [going, setGoing] = useState(myRsvp ? (myRsvp.going ? "yes" : "no") : "");
  const [count, setCount] = useState(myRsvp?.clientCount ? String(myRsvp.clientCount) : "");

  const btn = (val, label) => {
    const on = going === val;
    const tone =
      val === "yes"
        ? on
          ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
          : "border-border-strong text-muted hover:border-emerald-500/60"
        : on
          ? "border-rose-500 bg-rose-500/10 text-rose-300"
          : "border-border-strong text-muted hover:border-rose-500/60";
    return (
      <button
        type="button"
        onClick={() => setGoing(val)}
        className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition ${tone}`}
      >
        {label}
      </button>
    );
  };

  return (
    <form action={rsvpEvent.bind(null, postId)} className="mt-4 rounded-xl border border-border bg-surface p-4">
      <p className="text-sm font-semibold text-foreground">Will you be there?</p>
      <input type="hidden" name="going" value={going === "no" ? "no" : "yes"} />
      <div className="mt-3 flex gap-2.5">
        {btn("yes", "✓ I'm going")}
        {btn("no", "Can't make it")}
      </div>

      {isClientEvent && going === "yes" && (
        <div className="mt-4">
          <label className="block text-xs font-bold uppercase tracking-wide text-faint">
            How many clients are you bringing?
          </label>
          <input
            type="number"
            name="clientCount"
            min="0"
            max="999"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            placeholder="0"
            className="mt-1.5 w-28 rounded-lg border border-border-strong bg-background px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={!going}
        className="mt-4 rounded-lg bg-brand-light px-4 py-2 text-sm font-bold text-white transition hover:bg-brand disabled:opacity-50"
      >
        Save my RSVP
      </button>
    </form>
  );
}
