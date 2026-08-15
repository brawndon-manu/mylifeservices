"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
// A HIDDEN TAB SLOWS DOWN, IT DOES NOT STOP. It used to stop, and that took the
// face off thirty seconds after somebody switched to QuickSolve - which is the
// one moment they are certainly working the batch, since that is where the fix
// gets made. Hidden beats go out every 20 seconds, marked hidden, and give up
// after ten minutes so a laptop left open overnight stops claiming somebody is
// at work.
const PresenceContext = createContext([]);
// WHO IS IN WHICH UPLOAD. Only the batch list asks for this: it draws one card
// per fortnight with the earlier uploads folded under it, and a face has to land
// on the upload somebody is actually reading rather than on the newest one.
const ByBatchContext = createContext({});
const ReportContext = createContext(() => {});

// TWO SPEEDS, because hover and "has it open" want different things.
//
// A page nobody is touching only needs to know somebody else arrived, and 12
// seconds is fine for that. But a face that appears 12 seconds after a coworker
// hovers a card - and lingers 12 after they leave - reads as broken rather than
// slow, so while a pointer is actually moving over the list it polls at 3.
//
// It matters more than it looks: every poll is three redis commands, and a tab
// left open all day at 3 seconds is about 86,000 of them. Fast only while
// somebody is actually working the list is what keeps this cheap.
const POLL_IDLE_MS = 12_000;
// A TAB BEHIND ANOTHER WINDOW IS STILL SOMEBODY MID-JOB.
//
// Hidden tabs used to stop beating outright, which took a face off the screen
// thirty seconds after somebody switched to QuickSolve - the one moment they are
// most certainly working the batch, because that is where the fix gets made.
// They keep beating, just slowly, and say they are hidden so the screen can tell
// "has it open" from "is looking at it".
const POLL_HIDDEN_MS = 20_000;
// ...but not for ever. A laptop left open overnight would otherwise report
// somebody as working the batch until the tab is closed. After this long out of
// sight it goes quiet and the 30 second timeout takes the face off.
const HIDDEN_GRACE_MS = 10 * 60_000;
const POLL_ACTIVE_MS = 3_000;
// how long after the last pointer movement the page still counts as active
const ACTIVE_FOR_MS = 20_000;
// HOW LONG A POINTER HAS TO REST before it counts as looking at a card. Sweeping
// down a list of sixty crosses every one of them, and reporting each would be
// sixty writes and a row of faces flickering on and off for everybody else.
// Resting on one is the difference between passing over and reading it.
const DWELL_MS = 700;

export function usePresence() {
  return useContext(PresenceContext);
}

// everybody in ONE upload, by its id. Two uploads of a fortnight are two
// documents with two sets of timesheet rows, so somebody open in the older one
// is not open in this one.
export function useBatchPresence(batchId) {
  const byBatch = useContext(ByBatchContext);
  return useMemo(() => byBatch[batchId] || [], [byBatch, batchId]);
}

// the whole map, for a caller that needs several uploads at once. A hook cannot
// be called once per id in a loop, so the loop reads this instead.
export function useAllBatchPresence() {
  return useContext(ByBatchContext);
}

// tell the provider which card I am on. Null means "on the page, no card".
export function useReportRow() {
  return useContext(ReportContext);
}

// everybody currently on one row. The rows are server-rendered, so this is how a
// row gets a live answer without the page re-rendering.
export function useRowPresence(rowKey) {
  const here = useContext(PresenceContext);
  return useMemo(() => here.filter((p) => p.rowKey === rowKey), [here, rowKey]);
}

// TWO DIFFERENT FACTS, and the screen should not say them the same way.
//
// Somebody with a person's page OPEN is working on them. Somebody whose pointer
// is resting on the card is reading it and may move on in a second. The first is
// worth interrupting for, the second is not.
export function useRowActivity(rowKey) {
  const on = useRowPresence(rowKey);
  return useMemo(
    () => ({
      all: on,
      open: on.filter((p) => !p.hover),
      hovering: on.filter((p) => p.hover),
    }),
    [on],
  );
}

export default function PresenceProvider({
  batchId, rowKey = null, page = null, children,
  // READ WITHOUT ANNOUNCING YOURSELF. The batch list shows who is inside each
  // period, and a poller that announced itself put you inside every batch you
  // could see a card for - so the screen asking "is anybody in there" was what
  // put somebody in there. Being on a list is not being in a batch.
  watchOnly = false,
  // the other uploads of the same pay period, for a watcher on the batch list.
  // Somebody reading a superseded upload is still inside that fortnight, and
  // the card must not hide them just because the fold is shut.
  alsoBatchIds = null,
}) {
  const router = useRouter();
  const [here, setHere] = useState([]);
  const [byBatch, setByBatch] = useState({});
  // the batch's change counter as of the last poll. Starts unknown so the first
  // answer only records it - refreshing on arrival would be a reload nobody
  // asked for.
  const seenVersion = useRef(null);
  // the card a pointer is currently resting on, and when the pointer last moved
  const hovered = useRef(null);
  const activeUntil = useRef(0);
  // whether anybody else is on this batch, read by the timer to decide its speed
  const someoneHere = useRef(false);
  // when this tab was last in front of somebody, so a hidden one knows whether
  // it is a quick trip to QuickSolve or a laptop left open
  // null until the effect stamps it. Date.now() in a ref initialiser runs during
  // render, which is the impurity the note below is already about.
  const lastVisible = useRef(null);
  // joined, because a new array literal every render would restart the poll
  // timer on every render. The effect depends on the STRING and reads the list
  // out of a ref, the same shape `what` already uses for rowKey and page.
  const alsoKey = (alsoBatchIds || []).join(",");
  const alsoRef = useRef([]);
  const beatNow = useRef(() => {});
  // held in a ref so changing what I am looking at does not restart the timer.
  // Synced in an effect rather than assigned during render: a ref written while
  // rendering is a side effect in the render path, and React says so.
  const what = useRef({ rowKey, page });
  useEffect(() => {
    what.current = { rowKey, page };
  }, [rowKey, page]);
  useEffect(() => {
    alsoRef.current = alsoKey ? alsoKey.split(",") : [];
  }, [alsoKey]);

  // what a card calls when a pointer rests on it or leaves it. Reports straight
  // away rather than waiting for the next beat - the whole point is that it
  // lands while the other person is still looking.
  const report = useMemo(
    () => (key) => {
      hovered.current = key;
      activeUntil.current = Date.now() + ACTIVE_FOR_MS;
      beatNow.current();
    },
    [],
  );

  useEffect(() => {
    if (!batchId) return undefined;
    let alive = true;
    const url = `/portal/admin/timesheets/${batchId}/presence`;

    const beat = async () => {
      // hidden, but only recently: still on the batch, just not looking at it
      const hiddenNow = document.visibilityState === "hidden";
      // no stamp yet means the tab has not been visible since mount, so treat it
      // as fresh rather than expired - the alternative silences a tab that was
      // opened in the background and is about to be looked at
      if (hiddenNow && lastVisible.current && Date.now() - lastVisible.current > HIDDEN_GRACE_MS) return;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // a card being hovered outranks the page's own row: on a list there
          // is no page row, and on a person page hovering a card is a more
          // precise answer than "they have this person open"
          // WHETHER THIS IS A HOVER IS SENT, NOT INFERRED. It used to be read
          // off `page === "person"`, which is wrong inside a person's own page:
          // everything there reports page "person", so hovering a DAY card came
          // back as "has this open" and drew the pulsing ring instead of the
          // hover border. Only the sender knows which it is.
          body: JSON.stringify(
            watchOnly
              // nothing about me, because I am not here - just the question
              ? { watch: true, also: alsoRef.current }
              : {
                ...what.current,
                rowKey: hovered.current ?? what.current.rowKey,
                hover: hovered.current != null && !hiddenNow,
                // said, not inferred: only this end knows whether the window is
                // in front of them
                hidden: hiddenNow,
              },
          ),
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        const list = Array.isArray(data.here) ? data.here : [];
        setHere(list);
        if (data.byBatch && typeof data.byBatch === "object") setByBatch(data.byBatch);
        someoneHere.current = list.length > 0;

        // SOMETHING ELSE MOVED, so re-fetch. `router.refresh` re-runs the server
        // components and swaps the result in without losing scroll position or
        // anything typed into a note box - which a reload would.
        //
        // Only when the number actually CHANGED. Refreshing on every poll would
        // be the whole page re-rendered every three seconds for nothing.
        const v = Number(data.version) || 0;
        if (seenVersion.current === null) seenVersion.current = v;
        else if (v !== seenVersion.current) {
          seenVersion.current = v;
          router.refresh();
        }
      } catch {
        // a missed beat is a missed face, never a broken page. The next one
        // fixes it, and the entry outlives two misses on purpose.
      }
    };

    beatNow.current = beat;
    if (document.visibilityState === "visible") lastVisible.current = Date.now();
    beat();
    // re-armed each time rather than a fixed interval, so the speed can change
    // with whether anybody is actually working the list
    let timer;
    const arm = () => {
      // FAST WHENEVER SOMEBODY ELSE IS HERE, not only while a pointer is moving.
      //
      // The first version sped up on pointer activity alone, which missed the
      // case the whole thing is for: two people working the same list, one
      // posting a note while the other reads. Sitting still meant waiting out
      // the 12 second idle poll for their note to land, which reads as not being
      // live at all.
      //
      // Alone on a batch there is nothing to be quick about, so it stays lazy.
      const hiddenNow = typeof document !== "undefined" && document.visibilityState === "hidden";
      const active = Date.now() < activeUntil.current || someoneHere.current;
      timer = setTimeout(async () => {
        await beat();
        arm();
      }, hiddenNow ? POLL_HIDDEN_MS : active ? POLL_ACTIVE_MS : POLL_IDLE_MS);
    };
    arm();
    // coming back to the tab should not wait out the interval
    const onVisible = () => {
      if (document.visibilityState === "visible") { lastVisible.current = Date.now(); beat(); }
    };
    document.addEventListener("visibilitychange", onVisible);

    // SAY SO ON THE WAY OUT where we can. `keepalive` because the request has to
    // outlive the page that sent it. This is a courtesy on top of the timeout,
    // not the mechanism - a crash or a closed laptop never gets here.
    const leave = () => {
      // a watcher left no entry, so there is nothing to clear
      if (watchOnly) return;
      // `.catch` and not try/catch: the fetch is deliberately not awaited, so a
      // rejection arrives after this function has returned and a synchronous
      // catch never sees it. Unhandled, it surfaces as an unhandledRejection in
      // the console every time somebody navigates away while the connection is
      // gone - which is exactly when this fires.
      try {
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leaving: true }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        // and the synchronous case too, for a browser that refuses the call
        // outright rather than returning a promise
      }
    };
    window.addEventListener("pagehide", leave);

    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [batchId, router, watchOnly, alsoKey]);

  return (
    <PresenceContext.Provider value={here}>
      <ByBatchContext.Provider value={byBatch}>
        <ReportContext.Provider value={report}>{children}</ReportContext.Provider>
      </ByBatchContext.Provider>
    </PresenceContext.Provider>
  );
}

// WHO ELSE IS IN THIS BATCH, at the top of the screen.
//
// NOT just this page. Presence is mounted in the batch layout, so somebody on
// the checks screen or the stats is in the batch as much as somebody on this
// list - and the whole reason for the bar is that you should know they are here
// without having to catch their pointer on a card. The per-card faces stay for
// the precise answer: hovering a row, or having that person's own page open.
//
// It says WHICH screen, because "Gabe is here" and "Gabe is reading the checks"
// are different amounts of use.
const WHERE = {
  batch: "on the batch screen",
  people: "on this list",
  person: "on somebody's day-by-day",
  checks: "on the checks screen",
  stats: "on the stats",
  penalties: "on the penalties",
  corrections: "on the corrections",
  evidence: "on the evidence",
  report: "on the report",
  source: "on the source documents",
};

export function PresenceBar() {
  const here = usePresence();
  if (!here.length) return null;
  const say = (p) => {
    const where = WHERE[p.page] || "in this batch";
    return `${p.name || "Somebody"} ${p.hidden ? `has it open in another window, ${where}` : `is ${where}`}`;
  };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs dark:border-sky-800/70 dark:bg-sky-950/30">
      <span className="flex items-center">
        {here.slice(0, 8).map((p) => (
          <span
            key={p.userId}
            title={say(p)}
            className={`-ml-1.5 rounded-full ring-2 ring-surface first:ml-0 ${p.hidden ? "opacity-50" : ""}`}
          >
            <Avatar name={p.name} image={p.image} size={20} />
          </span>
        ))}
      </span>
      <span className="text-sky-800 dark:text-sky-300">
        {here.length === 1
          ? say(here[0])
          : `${here.length} other people are in this batch right now`}
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

// A CARD THAT REPORTS WHEN A POINTER RESTS ON IT, and shows who else is on it.
//
// Hover is a fair signal in a way scroll position is not: it is something a
// person did, rather than something inferred from where a list happens to sit.
// It needs two guards to be usable.
//
// DWELL, NOT ENTRY. A pointer crossing the list touches every card on the way
// past, and reporting each would be a write per card and a row of faces
// blinking on and off for everybody else. Reporting only once the pointer RESTS
// is the difference between passing over a card and reading it.
//
// LEAVING REPORTS IMMEDIATELY. Arriving can wait out the dwell; going should
// not, or a face lingers on a card nobody is looking at any more.
export function PresenceCard({ rowKey, className = "", children }) {
  const report = useReportRow();
  const { all: on, open, hovering } = useRowActivity(rowKey);
  const dwell = useRef(null);

  const enter = () => {
    clearTimeout(dwell.current);
    dwell.current = setTimeout(() => report(rowKey), DWELL_MS);
  };
  const leave = () => {
    clearTimeout(dwell.current);
    report(null);
  };

  // a timer that outlives the card would report a row no longer on screen
  useEffect(() => () => clearTimeout(dwell.current), []);

  return (
    <div
      onMouseEnter={enter}
      onMouseLeave={leave}
      // touch has no hover, and tapping is the same intent. Without this the
      // feature does not exist on a phone at all.
      onTouchStart={() => report(rowKey)}
      // SOMEBODY ELSE HOVERING GETS THE BORDER AND THE SHADOW, NOT THE LIFT.
      // `card-lift` also translates the card up four pixels, and a card moving
      // under your own cursor because a coworker's pointer landed on it is
      // genuinely unpleasant to read against. The blue border and the offset
      // shadow carry the same signal and hold still.
      className={`relative transition-shadow ${className} ${
        hovering.length ? "!border-[#29abe2] shadow-[6px_6px_0_0_rgba(79,195,240,0.55)]" : ""
      }`}
    >
      {/* HAS IT OPEN, which is a stronger thing than a pointer resting on it, so
          it gets a ring that breathes rather than a static one. Drawn as its own
          inset layer: pulsing the card itself would fade its text in and out,
          and this only ever animates a border. */}
      {open.length > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 animate-pulse rounded-lg ring-2 ring-sky-400"
        />
      )}

      {/* TOP RIGHT, OVER the card rather than inside it, so a face appearing
          never moves the row's own contents. */}
      {on.length > 0 && (
        <span className="pointer-events-none absolute -top-2 right-3 z-10 flex items-center">
          {on.slice(0, 4).map((p) => (
            <span
              key={p.userId}
              title={
                p.hover
                  ? `${p.name || "Somebody"} is looking at this`
                  : `${p.name || "Somebody"} has this open`
              }
              className={`-ml-2 rounded-full ring-2 first:ml-0 ${
                p.hover ? "ring-sky-300" : "ring-sky-500"
              }`}
            >
              <Avatar name={p.name} image={p.image} size={22} />
            </span>
          ))}
        </span>
      )}
      {children}
    </div>
  );
}
