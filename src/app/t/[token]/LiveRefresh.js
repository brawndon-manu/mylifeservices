"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// THE PAGE MOVES WHEN SOMEBODY CHANGES IT, WITHOUT ANYBODY SAYING RELOAD.
//
// The case: an employee rings to say they did take a break and the control on
// their own page will not let them say so. The fix gets made from All employees
// while they are still on the call, and they should watch it happen rather than
// be talked through refreshing.
//
// SAME MECHANISM AS THE ADMIN SCREENS. A counter in redis, bumped by every write
// that touches this sheet, polled here, and `router.refresh()` when the number
// moves. See `Presence.js`, which has been doing exactly this on the reviewer
// side since 2026-08-13, and the note above `bumpBatchVersion`.
//
// `router.refresh()` RE-RUNS THE SERVER COMPONENTS AND SWAPS THE RESULT IN. It
// keeps scroll position and anything typed into a box, which a reload would not
// - and a half-typed reason on this page is exactly the thing that must survive.

// SLOWER THAN THE REVIEWER'S 3 SECONDS, ON PURPOSE. That screen is somebody
// working a list of sixty and wanting a face to appear as they hover. This is
// one person reading their own timesheet, and the thing it is waiting for
// happens once, in the middle of a phone call. Five seconds is under the length
// of the sentence that follows the change.
const POLL_MS = 5_000;
// A TAB BEHIND ANOTHER WINDOW IS USUALLY SOMEBODY WHO HAS GONE. It keeps
// looking, slowly, so coming back to it finds it current.
const POLL_HIDDEN_MS = 30_000;
// ...but not for ever. A phone left on this page overnight would otherwise poll
// until the battery went.
const HIDDEN_GRACE_MS = 10 * 60_000;

export default function LiveRefresh({ token, renderedVersion = null }) {
  const router = useRouter();
  // the version we have already rendered. Null until the first answer, so the
  // page never refreshes on the poll that merely learns the number.
  const seen = useRef(null);
  const hiddenSince = useRef(null);

  // THE PAGE SAYS WHICH VERSION IT WAS BUILT FROM, every time it renders. An
  // employee's OWN answer bumps the counter and ALSO re-renders the page
  // through the action's response - so the poll used to see the new number and
  // re-render the whole tree a second time for a change already on screen.
  // Twice per answer, and on an iPhone the second one lands mid-keyboard and
  // throws the scroll (the 2026-08-24 staff report: "the screen would auto
  // scroll to the bottom of the page and vice versa"). Syncing `seen` to what
  // is actually rendered means the poll only ever refreshes for changes made
  // SOMEWHERE ELSE, which is the one job it exists to do.
  useEffect(() => {
    if (renderedVersion !== null && (seen.current === null || renderedVersion > seen.current)) {
      seen.current = Number(renderedVersion) || 0;
    }
  }, [renderedVersion]);

  useEffect(() => {
    let alive = true;
    let timer = null;

    const tick = async () => {
      const hidden = document.visibilityState === "hidden";
      if (hidden) {
        if (hiddenSince.current === null) hiddenSince.current = Date.now();
      } else {
        hiddenSince.current = null;
      }
      const goneTooLong = hiddenSince.current !== null
        && Date.now() - hiddenSince.current > HIDDEN_GRACE_MS;

      if (!goneTooLong) {
        try {
          const res = await fetch(`/t/${token}/version`, { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            const v = Number(data?.v) || 0;
            if (seen.current === null) {
              // the first poll only learns the number. Refreshing here would
              // re-render every page once, five seconds after it opened, for
              // nothing.
              seen.current = v;
            } else if (v !== seen.current) {
              // NOT WHILE THEY ARE TYPING. A refresh keeps what is in a box, but
              // re-rendering the tree under somebody mid-sentence is a flicker
              // they did not ask for, and the change is still there a moment
              // later. `seen` is deliberately NOT advanced here, so the next
              // tick tries again the moment they stop.
              const el = document.activeElement;
              const typing = !!el && (el.tagName === "TEXTAREA"
                || (el.tagName === "INPUT" && el.type !== "button" && el.type !== "submit"));
              if (!typing) {
                seen.current = v;
                router.refresh();
              }
            }
          }
        } catch {
          // a missed poll is a page that updates a few seconds later, never a
          // broken one. The next tick fixes it.
        }
      }
      if (!alive) return;
      timer = setTimeout(tick, hidden ? POLL_HIDDEN_MS : POLL_MS);
    };

    timer = setTimeout(tick, POLL_MS);

    // COMING BACK TO THE TAB CHECKS STRAIGHT AWAY.
    //
    // A hidden tab is on the slow interval, so switching back to it could sit on
    // a stale page for up to another half minute - which is the exact moment
    // somebody looks, because they have just been told to look. The timer is
    // replaced rather than added to, or every switch would leave one running.
    const onShow = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, 0);
    };
    document.addEventListener("visibilitychange", onShow);

    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onShow);
      if (timer) clearTimeout(timer);
    };
  }, [token, router]);

  return null;
}
