"use client";

// GOING DEEPER SLIDES THE NEXT PAGE OVER. COMING BACK SLIDES IT OFF.
//
// Mánu 2026-08-17, off `scratch/swipe-nav-mock.html`: tapping into a page should
// slide it in from the right, and dragging from the left edge should take it
// back. His call on scope was DEEPER ONLY - a tab bar switch stays instant,
// because left and right stop meaning anything if every navigation slides.
//
// THE BROWSER DOES THE HARD PART, NOT US. The obvious implementation is a stack
// that keeps the previous page mounted so there is something left to animate
// out, which is a rewrite of the portal layout. `document.startViewTransition`
// snapshots the outgoing page itself, so the work here is only deciding WHICH
// WAY and getting the snapshot taken at the right moment. The keyframes are in
// a <style> block in the root layout, NOT in globals.css - see the note there,
// the CSS pipeline eats them.
//
// THE BACK GESTURE TRACKS THE FINGER. The transition's pseudo-elements are
// animated by ordinary web animations, so they can be found through
// `getAnimations()`, paused, and driven by hand. See `commit` and `scrub`
// below, and the note on why letting go short of the line has to move the
// history as well as the picture.
//
// UNSUPPORTED BROWSERS NAVIGATE EXACTLY AS THEY DO TODAY. Every path through
// this falls back to letting the click happen, so there is no state where the
// page fails to change.
import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
// THE RULE LIVES IN `src/lib` AND NOT HERE, so the test can call the same one
// this does. This file is JSX behind "use client" and `node --test` cannot
// import it, and a rule copied into a test is a rule that drifts.
import {
  TAB_ROOTS,
  directionFor,
  dragProgress,
  viewTransitionAnimations,
  NAV_MS,
  NAV_COMMIT_AT,
} from "@/lib/portal-nav";

export default function PortalPushNav({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  // resolves the promise `startViewTransition` is waiting on, once React has
  // actually rendered the new route. Without it the snapshot is taken before
  // the new page exists and the transition animates nothing.
  const settle = useRef(null);
  const dragging = useRef(null);

  useEffect(() => {
    if (settle.current) {
      settle.current();
      settle.current = null;
    }
  }, [pathname]);

  const go = useCallback(
    (href, direction) => {
      const root = document.documentElement;
      // ONE ATTRIBUTE PICKS THE KEYFRAMES. Held on <html> rather than passed
      // around, because `::view-transition-*` pseudo-elements live on the
      // document and cannot be reached from a component's own styles.
      root.dataset.nav = direction;
      const done = document.startViewTransition(
        () =>
          new Promise((resolve) => {
            settle.current = resolve;
            router.push(href);
            // A NAVIGATION THAT NEVER ARRIVES MUST NOT FREEZE THE PAGE. A
            // refused route or a slow server would otherwise leave the document
            // held in a transition with nothing on screen able to move.
            setTimeout(() => {
              if (settle.current === resolve) {
                settle.current = null;
                resolve();
              }
            }, 1200);
          }),
      );
      done.finished.finally(() => {
        delete root.dataset.nav;
      });
    },
    [router],
  );

  // FORWARD: catch the click before the router does.
  useEffect(() => {
    if (typeof document === "undefined" || !document.startViewTransition) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onClick = (e) => {
      // every reason a browser would not treat this as a plain in-app navigation
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      if (a.origin !== window.location.origin) return;
      // a link to a hash on this page is not a navigation
      const to = a.pathname;
      if (to === pathname) return;
      const direction = directionFor(pathname, to);
      if (direction !== "forward") return;
      e.preventDefault();
      go(a.pathname + a.search + a.hash, "forward");
    };

    // CAPTURE, NOT BUBBLE, and this is the whole reason the first version did
    // nothing at all. React attaches its handlers to the root container, which
    // is INSIDE document, so on the way up Next's `Link` runs first - and it
    // calls `preventDefault()` on every internal link it owns. A bubble-phase
    // listener therefore saw `defaultPrevented` already true and bailed out on
    // every single navigation, silently.
    //
    // Going first instead: we preventDefault here, and `Link` bails when it
    // sees it, which is its own documented behaviour. No `stopPropagation` -
    // anything else listening for the click still hears it.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname, go]);

  // BACK: a drag that starts in the left edge strip.
  useEffect(() => {
    if (typeof document === "undefined" || !document.startViewTransition) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // nothing to go back to from a tab root, and the gesture would fight the
    // browser's own on the first page of a session
    if (TAB_ROOTS.has(pathname)) return;

    const EDGE = 32;
    // how far sideways before the drag counts as a back rather than a stray
    // touch. Small, because past this the transition is committed.
    const WAKE_PX = 10;

    // A DRAG THAT STARTS INSIDE SIDEWAYS-SCROLLING CONTENT BELONGS TO THAT
    // CONTENT. The review page has eight such regions and the day calendar is
    // its own drag surface; a greedy gesture would take all of them.
    const inScroller = (el) => {
      let n = el;
      while (n && n !== document.body) {
        if (n.scrollWidth > n.clientWidth + 1
            && getComputedStyle(n).overflowX !== "visible") return true;
        n = n.parentElement;
      }
      return false;
    };

    // THE PAGE FOLLOWS THE FINGER, WHICH IS THE WHOLE POINT AND THE HARD PART.
    //
    // A view transition normally runs itself: it starts, it takes its duration,
    // it ends. The trick is that the pseudo-elements it makes are animated by
    // ORDINARY WEB ANIMATIONS, so once `ready` has resolved they can be found
    // through `getAnimations()`, paused, and then driven by hand - setting
    // `currentTime` to wherever the thumb is. Nothing else about the transition
    // changes, which is why the keyframes stay declarative in the root layout.
    //
    // WHY IT COMMITS EARLY. `router.back()` has to run for there to BE a
    // transition to scrub, so the navigation happens on the first real sideways
    // movement rather than on release. Letting go short of the line therefore
    // cannot just do nothing - it plays the animation backwards and then goes
    // forward again, which is the same pair of moves a phone makes internally.
    const commit = (d) => {
      const root = document.documentElement;
      root.dataset.nav = "back";
      d.committed = true;
      const vt = document.startViewTransition(
        () =>
          new Promise((resolve) => {
            settle.current = resolve;
            // THE GESTURE IS HISTORY, NOT A LOOKALIKE. `router.back()` keeps
            // the browser's own back button and the Android gesture in step.
            router.back();
            setTimeout(() => {
              if (settle.current === resolve) {
                settle.current = null;
                resolve();
              }
            }, 1200);
          }),
      );
      d.vt = vt;
      vt.ready
        .then(() => {
          d.anims = viewTransitionAnimations(document);
          for (const a of d.anims) a.pause();
          // catch up to wherever the thumb got to while `ready` was pending
          scrub(d.p);
        })
        // a transition the browser decided to skip is not an error worth
        // shouting about - the navigation still happened, it just did not
        // animate, which is exactly the unsupported-browser path
        .catch(() => {});
      vt.finished.finally(() => {
        delete root.dataset.nav;
      });
    };

    const scrub = (p) => {
      const d = dragging.current;
      if (!d?.anims) return;
      for (const a of d.anims) {
        try { a.currentTime = p * NAV_MS; } catch { /* finished or dropped */ }
      }
    };

    const start = (e) => {
      const t = e.touches[0];
      if (t.clientX > EDGE) return;
      if (inScroller(e.target)) return;
      dragging.current = { x: t.clientX, y: t.clientY, p: 0, committed: false };
    };
    const move = (e) => {
      const d = dragging.current;
      if (!d) return;
      const t = e.touches[0];
      const dx = t.clientX - d.x;
      const dy = t.clientY - d.y;
      // a mostly-vertical drag is a scroll, and taking it would make the page
      // impossible to scroll near the left edge. Only judged before the
      // transition is running - after that the finger owns the page.
      if (!d.committed && Math.abs(dy) > Math.abs(dx)) {
        dragging.current = null;
        return;
      }
      if (e.cancelable) e.preventDefault();
      d.p = dragProgress(dx, window.innerWidth);
      if (!d.committed && dx > WAKE_PX) commit(d);
      else scrub(d.p);
    };
    const end = () => {
      const d = dragging.current;
      dragging.current = null;
      if (!d || !d.committed) return;
      const anims = d.anims || [];
      // THE BROWSER SKIPPED THE TRANSITION, AND THE NAVIGATION STILL HAPPENED.
      //
      // A hidden document refuses one outright - `ready` rejects with
      // InvalidStateError, which is exactly what this hit while being tested -
      // and there is no reason to assume that is the only case. The commit has
      // already run either way, so a drag that never reached the line has to be
      // put back by hand or a 10px twitch at the edge silently navigates. There
      // is no animation to run backwards first, so it just goes.
      if (!anims.length) {
        if (d.p < NAV_COMMIT_AT) router.forward();
        return;
      }

      if (d.p >= NAV_COMMIT_AT) {
        // carry on from where the thumb let go, at normal speed
        for (const a of anims) {
          a.playbackRate = 1;
          a.play();
        }
        return;
      }

      // UNDER THE LINE: RUN IT BACKWARDS AND PUT THE HISTORY BACK.
      //
      // The page they were reading is the one we already navigated away from,
      // so springing back visually is only half of it - the address has to
      // return too, or the next Back press goes somewhere they never chose.
      for (const a of anims) {
        a.playbackRate = -1;
        a.play();
      }
      Promise.all(anims.map((a) => a.finished.catch(() => {})))
        .then(() => router.forward())
        // even if the animation bookkeeping fails, the history must go back to
        // where the person actually was
        .catch(() => router.forward());
    };

    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", end);
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", end);
    };
  }, [pathname, router]);

  return children;
}
