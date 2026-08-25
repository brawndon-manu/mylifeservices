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
  createNavOwner,
  mayDropSnapshots,
  originForProgress,
  nativeEdgeBackGesture,
  SPRING_HOLD_MS,
} from "@/lib/portal-nav";

export default function PortalPushNav({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  // resolves the promise `startViewTransition` is waiting on, once React has
  // actually rendered the new route. Without it the snapshot is taken before
  // the new page exists and the transition animates nothing.
  const settle = useRef(null);
  const dragging = useRef(null);
  // WHO OWNS `data-nav` RIGHT NOW - see createNavOwner. Two transitions can be
  // in flight at once (tap a card, then swipe back before it settles), and the
  // older one finishing must not strip the attribute the newer one's keyframes
  // are selected by. That is what left two pages stacked on screen.
  //
  // Built once at mount rather than lazily on first render: reading a ref
  // during render is what the hooks rule forbids, and the counter has to
  // survive every re-render or two navigations could both think they own it.
  const navOwner = useRef(createNavOwner());
  // THE PATH, READABLE MID-GESTURE. The back gesture commits its navigation on
  // the first real sideways movement, so `pathname` changes while the finger is
  // still down. The touch handlers live for the life of the component - see the
  // note on the back effect - and read the current path from here rather than
  // closing over the one they were registered under.
  const pathRef = useRef(pathname);

  useEffect(() => {
    pathRef.current = pathname;
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
      const mine = navOwner.current.claim();
      root.dataset.nav = direction;
      // assigned before the callback's timeout can ever fire - the callback
      // runs synchronously inside startViewTransition, the timeout later
      let done;
      done = document.startViewTransition(
        () =>
          new Promise((resolve) => {
            settle.current = resolve;
            router.push(href);
            // A NAVIGATION THAT NEVER ARRIVES MUST NOT FREEZE THE PAGE. A
            // refused route or a slow server would otherwise leave the document
            // held in a transition with nothing on screen able to move.
            //
            // AND IT MUST NOT ANIMATE A LIE EITHER. Giving up used to resolve
            // the promise and let the slide play anyway - but the route hasn't
            // rendered, so the "new" snapshot is the OLD page, and the slide
            // shows you arriving... back where you already were. Then the real
            // render lands seconds later with a third jump. Mánu 2026-08-24:
            // "it glitches by showing the page then goes back to where you
            // were then again to the page you clicked." A slow navigation now
            // skips the animation entirely and appears plainly when it
            // arrives, which is what every navigation did before the slide
            // existed.
            setTimeout(() => {
              if (settle.current === resolve) {
                settle.current = null;
                try {
                  done?.skipTransition();
                } catch {
                  // an already-finished transition has nothing to skip
                }
                resolve();
              }
            }, 1200);
          }),
      );
      // A SKIPPED TRANSITION REJECTS `ready` WITH AN AbortError - that is the
      // spec's way of saying "no animation", not a failure, and with nobody
      // listening it surfaced as "Runtime AbortError: Transition was skipped"
      // in the overlay. Swallowed on purpose: the skip is the plan.
      done.ready.catch(() => {});
      done.finished
        .then(() => {
          // only if a later navigation has not taken the attribute over
          if (mine()) delete root.dataset.nav;
        })
        .catch(() => {
          if (mine()) delete root.dataset.nav;
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
  //
  // REGISTERED ONCE, NOT PER PATH - and that is the fix for the stacked pages
  // that survived the ownership counter. `commit` runs `router.back()` while
  // the finger is still down, so with `pathname` in the deps this effect tore
  // itself down MID-GESTURE: the cleanup removed the touch listeners, and when
  // the destination was a tab root - which it is for the exact swipe in the
  // screenshots, Applications back to the Admin index - the early return put
  // nothing back. `end` then never fired, the animations `ready` had paused
  // stayed paused forever, and a transition whose animations never finish
  // never tears down its snapshots: both pages left standing, frozen wherever
  // the scrub got to. The counter was never the problem here - nothing stripped
  // the attribute, the transition was simply never told to play. So the
  // listeners live as long as the component, and the tab-root rule moved into
  // `start`, reading the path the gesture actually begins on.
  useEffect(() => {
    if (typeof document === "undefined" || !document.startViewTransition) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // iOS Safari's own edge swipe already does this - see the note on
    // `nativeEdgeBackGesture`. Two gestures on one edge wedge the page.
    if (
      nativeEdgeBackGesture({
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints || 0,
        standalone:
          navigator.standalone === true ||
          window.matchMedia("(display-mode: standalone)").matches,
      })
    ) return;

    const EDGE = 32;
    // how far sideways before the drag counts as a back rather than a stray
    // touch. Small, because past this the transition is committed.
    const WAKE_PX = 10;
    // how long a committed drag waits for a dropped touch to come back before
    // treating the cancel as a release - see the touchcancel note in `end`.
    // Digitizer blips are shorter than this; a system gesture that takes the
    // touch for real just springs back a beat later than it used to.
    const TOUCH_LOST_GRACE = 200;

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
      const mine = navOwner.current.claim();
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
          // THE FINGER CAN BE GONE BEFORE THE TRANSITION IS READY. A quick
          // twitch past WAKE_PX commits and lets go inside the time `ready`
          // takes, and `end` has already decided what happens. Pausing the
          // animations now would leave nobody to ever play them - the other
          // way a swipe froze two pages on screen. Not this drag's transition
          // any more: let it run, or `end` already skipped it.
          if (dragging.current !== d) return;
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
        if (mine()) delete root.dataset.nav;
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
      const held = dragging.current;
      if (held) {
        // THE FINGER CAME BACK. At the very edge of the glass the digitizer
        // can drop a resting touch - half the finger is off the screen - and
        // re-acquire it a beat later as a brand new one. That used to read as
        // release-then-new-gesture: the peek sprang shut, the wobble of the
        // re-found contact re-committed, and holding a peek at the edge became
        // a loop of transitions fighting each other. The drag adopts the new
        // touch instead: same gesture, same transition, origin remapped so the
        // page does not jump when the finger is re-found.
        if (held.committed && held.lost) {
          clearTimeout(held.lostTimer);
          held.lost = false;
          const t = e.changedTouches[0];
          held.x = originForProgress(t.clientX, held.p, window.innerWidth);
          held.y = t.clientY;
        }
        // and a second finger landing while one is dragging is not a new
        // gesture - it used to overwrite the drag mid-flight
        return;
      }
      // nothing to go back to from a tab root, and the gesture would fight the
      // browser's own on the first page of a session. Judged per touch rather
      // than by which paths register listeners - see the note on this effect.
      if (TAB_ROOTS.has(pathRef.current)) return;
      const t = e.touches[0];
      if (t.clientX > EDGE) return;
      if (inScroller(e.target)) return;
      dragging.current = {
        x: t.clientX, y: t.clientY, p: 0, committed: false, lost: false,
        // where the spring-back has to get the address back to - read at
        // touch time, because `commit` moves the history while the finger is
        // still down
        fromPath: pathRef.current,
      };
    };
    const move = (e) => {
      const d = dragging.current;
      if (!d) return;
      // while our touch is lost, whatever is moving is not the finger this
      // drag belongs to
      if (d.lost) return;
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
    // what letting go does, shared by a lifted finger and a touch that was
    // lost and never came back
    const release = (d) => {
      // NOTHING BELOW MAY HOLD THE SNAPSHOTS FOREVER. The spring walks them
      // back on requestAnimationFrame - and the frozen two-page state in the
      // Simulator was a release whose rAF loop never got to run again, so the
      // skip it was walking toward never came. A plain timer does not depend
      // on the compositor being happy: past every legitimate path's worst
      // case, skip the transition no matter what. Skipping one that already
      // finished is a no-op.
      setTimeout(() => {
        try { d.vt?.skipTransition?.(); } catch { /* already gone */ }
      }, NAV_MS + SPRING_HOLD_MS + 300);
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
        if (d.p < NAV_COMMIT_AT) {
          // the transition may only be warming up rather than refused - see
          // the guard on `ready`. Skip it so a back animation cannot play
          // after the history has been put back.
          d.vt?.skipTransition?.();
          router.forward();
        }
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

      // UNDER THE LINE: SPRING BACK, AND PUT THE HISTORY BACK - IN THAT
      // ORDER, REVERSED FROM WHAT IT WAS. This used to play the animation
      // backwards, let the transition FINISH, and only then call
      // `router.forward()` - and a finished transition tears its snapshots
      // down. For however long the router took to bring the page back, the
      // screen showed where the history was actually standing: the page
      // BELOW. A fast swipe never lets go under the line, so it never saw
      // this; a slow peek-and-return hit it on every release, as a
      // full-screen blink of the wrong page.
      //
      // So the navigation starts NOW, and the snapshots are walked back by
      // hand - still paused, so the transition cannot finish under us - and
      // dropped only once the address has come back. At that moment the
      // pixels on both sides of the drop are the same page, which is what
      // makes it invisible. `mayDropSnapshots` holds the door, and gives up
      // after a grace so a refused route cannot hold the page frozen.
      router.forward();
      const from = d.p * NAV_MS;
      const t0 = performance.now();
      const spring = (now) => {
        const left = Math.max(0, from - (now - t0));
        for (const a of anims) {
          try { a.currentTime = left; } catch { /* skipped under us */ }
        }
        if (left > 0 || !mayDropSnapshots(pathRef.current, d.fromPath, now - t0 - from)) {
          requestAnimationFrame(spring);
          return;
        }
        if (d.vt && typeof d.vt.skipTransition === "function") d.vt.skipTransition();
        // a browser without skip still must not hold paused snapshots forever
        else for (const a of anims) { try { a.finish(); } catch { /* gone */ } }
      };
      requestAnimationFrame(spring);
    };

    const end = (e) => {
      const d = dragging.current;
      if (!d) return;
      // A CANCEL IS NOT A LIFT. `touchcancel` is the browser saying it lost
      // track of the touch, and at the very edge of the screen that happens to
      // a finger that is still there - see the adoption note in `start`. So a
      // committed drag holds its ground for a grace period instead of
      // springing shut: if the finger is re-found, `start` adopts it and
      // nothing on screen so much as flickers; if nobody comes back, this was
      // a real cancel and it releases where it stood.
      if (e.type === "touchcancel" && d.committed && !d.lost) {
        d.lost = true;
        d.lostTimer = setTimeout(() => {
          if (dragging.current !== d) return;
          dragging.current = null;
          release(d);
        }, TOUCH_LOST_GRACE);
        return;
      }
      // a lost drag belongs to its timer now - a different finger lifting
      // must not release it
      if (d.lost) return;
      dragging.current = null;
      if (!d.committed) return;
      release(d);
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
      if (dragging.current?.lostTimer) clearTimeout(dragging.current.lostTimer);
    };
  }, [router]);

  return children;
}
