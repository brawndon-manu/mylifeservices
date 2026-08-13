"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import Avatar from "@/components/Avatar";

// WHO ELSE IS ON THIS BATCH, live-ish.
//
// ONE POLLER FOR THE WHOLE PAGE. The obvious version puts a timer in each row,
// which on sixty rows is sixty timers and sixty requests every few seconds for
// one answer. This polls once and hands the result down through context; a row
// reads its own slice with `useRowPresence` and renders nothing when empty.
//
// The interval is 10 SECONDS and the entry lives 30, so somebody has two misses
// before they blink off. That trade is deliberate: for "do not both ring the
// same person", a face being five seconds stale is invisible, and it costs a
// request every ten seconds per open tab instead of a socket per tab.
//
// It stops when the tab is hidden. A backgrounded list is nobody's presence, and
// polling from a tab nobody is looking at is how a nicety turns into load.
const PresenceContext = createContext([]);
const POLL_MS = 10_000;

export function usePresence() {
  return useContext(PresenceContext);
}

// everybody currently on one row. The rows are server-rendered, so this is how a
// row gets a live answer without the page re-rendering.
export function useRowPresence(rowKey) {
  const here = useContext(PresenceContext);
  return useMemo(() => here.filter((p) => p.rowKey === rowKey), [here, rowKey]);
}

export default function PresenceProvider({ batchId, rowKey = null, page = null, children }) {
  const [here, setHere] = useState([]);
  // held in a ref so changing what I am looking at does not restart the timer.
  // Synced in an effect rather than assigned during render: a ref written while
  // rendering is a side effect in the render path, and React says so.
  const what = useRef({ rowKey, page });
  useEffect(() => {
    what.current = { rowKey, page };
  }, [rowKey, page]);

  useEffect(() => {
    if (!batchId) return undefined;
    let alive = true;
    const url = `/portal/admin/timesheets/${batchId}/presence`;

    const beat = async () => {
      // a hidden tab is not presence. It also stops a wall of open tabs from
      // polling all day.
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(what.current),
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setHere(Array.isArray(data.here) ? data.here : []);
      } catch {
        // a missed beat is a missed face, never a broken page. The next one
        // fixes it, and the entry outlives two misses on purpose.
      }
    };

    beat();
    const timer = setInterval(beat, POLL_MS);
    // coming back to the tab should not wait out the interval
    const onVisible = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", onVisible);

    // SAY SO ON THE WAY OUT where we can. `keepalive` because the request has to
    // outlive the page that sent it. This is a courtesy on top of the timeout,
    // not the mechanism - a crash or a closed laptop never gets here.
    const leave = () => {
      try {
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leaving: true }),
          keepalive: true,
        });
      } catch {
        // nothing to do about it at this point
      }
    };
    window.addEventListener("pagehide", leave);

    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [batchId]);

  return <PresenceContext.Provider value={here}>{children}</PresenceContext.Provider>;
}

// WHO IS ON THIS PAGE AT ALL, for the top of a list.
export function PresenceBar() {
  const here = usePresence();
  if (!here.length) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs dark:border-sky-800/70 dark:bg-sky-950/30">
      <span className="flex items-center">
        {here.slice(0, 8).map((p) => (
          <span key={p.userId} title={p.name || "somebody"} className="-ml-1.5 rounded-full ring-2 ring-surface first:ml-0">
            <Avatar name={p.name} image={p.image} size={20} />
          </span>
        ))}
      </span>
      <span className="text-sky-800 dark:text-sky-300">
        {here.length === 1
          ? `${here[0].name || "Somebody"} is on this batch right now`
          : `${here.length} people are on this batch right now`}
      </span>
    </div>
  );
}

// WHO IS LOOKING AT THIS PERSON, for a row.
//
// Only ever shown from a page where the answer is EXACT - somebody opened one
// person, so that is the card they are on. On a scrolling list it would be a
// guess from scroll position, and a guess that is wrong often enough is worse
// than no answer at all.
export function RowPresence({ rowKey }) {
  const on = useRowPresence(rowKey);
  if (!on.length) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-300">
      <span className="flex items-center">
        {on.slice(0, 3).map((p) => (
          <span key={p.userId} title={p.name || "somebody"} className="-ml-1.5 rounded-full ring-2 ring-surface first:ml-0">
            <Avatar name={p.name} image={p.image} size={16} />
          </span>
        ))}
      </span>
      {on.length === 1 ? `${firstName(on[0].name)} is here` : `${on.length} here`}
    </span>
  );
}

// "Uribe, Brandon" -> "Brandon", "Gabe Smith" -> "Gabe". A row is tight and the
// surname is not what tells you who is already on it.
function firstName(name) {
  const s = String(name || "").trim();
  if (!s) return "Somebody";
  if (s.includes(",")) return s.split(",")[1]?.trim().split(/\s+/)[0] || s;
  return s.split(/\s+/)[0];
}
