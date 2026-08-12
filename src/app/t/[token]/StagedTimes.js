"use client";

// THE TIME THEY ARE TYPING, ON THE PICTURE BESIDE THEM, BEFORE IT IS COMMITTED.
//
// Mánu 2026-08-12: "if they add in their break or lunch meal, I want it to be
// added to the visible schedule next to it as well. And then, again, if you go
// back, then you remove it from it as well."
//
// The day's calendar is drawn from the stored sheet, and the answer being
// composed lives in client state inside two different components - `slotAt` in a
// single question, `times` in the batch provider. Neither can see the calendar
// and the calendar cannot see either, so a time typed into the box changed
// nothing on the axis until the answer was committed and the page refreshed.
//
// This is the one place both write to and the calendar reads from. It holds ONLY
// what is on screen and uncommitted: nothing here is ever submitted, and nothing
// submitted comes back through here - a committed answer arrives the way it
// always did, on the rebuilt day.
//
// KEYED BY OWNER so "going back" needs no bookkeeping. Each owner republishes
// its whole list on every change, so un-picking an answer, clearing a box or
// switching to a choice that needs no time all publish an empty list, and the
// block comes off the axis by itself.

import { createContext, useCallback, useContext, useMemo, useState } from "react";

const Ctx = createContext(null);

export function StagedTimesProvider({ children }) {
  // ownerId -> [{ date, min, minutes, kind }]
  const [byOwner, setByOwner] = useState({});

  // Republish an owner's entire list. Compared before storing, because this is
  // called from an effect that runs on every keystroke and setting state to an
  // equal-but-new object would re-render the whole card for nothing - and, since
  // the effect depends on what it sets, would not stop.
  const publish = useCallback((ownerId, entries) => {
    setByOwner((prev) => {
      const next = entries?.length ? entries : null;
      const same = JSON.stringify(prev[ownerId] ?? null) === JSON.stringify(next);
      if (same) return prev;
      const out = { ...prev };
      if (next) out[ownerId] = next;
      else delete out[ownerId];
      return out;
    });
  }, []);

  const byDate = useMemo(() => {
    const out = {};
    for (const entries of Object.values(byOwner)) {
      for (const e of entries) {
        if (!e?.date || !Number.isFinite(e.min)) continue;
        (out[e.date] ||= []).push(e);
      }
    }
    return out;
  }, [byOwner]);

  const value = useMemo(() => ({ byDate, publish }), [byDate, publish]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// what to draw on one day. Safe outside the provider - the "All questions" view
// has no calendar to draw on, and this must not make it throw.
export function useStagedOn(date) {
  const ctx = useContext(Ctx);
  return ctx?.byDate?.[date] || EMPTY;
}
const EMPTY = [];

// for the two components that own a half-typed answer
export function useStagedPublisher() {
  const ctx = useContext(Ctx);
  return ctx?.publish || noop;
}
const noop = () => {};
