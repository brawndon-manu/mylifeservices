"use client";

import { useEffect } from "react";

// keeps the intro to once per session on soft (client-side) navigations back to
// the homepage. on a full page load the inline script in IntroReveal already
// handles it and sets window.__mlsIntroPlaying while it's playing; this only does
// anything when we arrived via a soft nav, where that script doesn't run.
export default function IntroRevealGuard() {
  useEffect(() => {
    const d = document.documentElement;
    // full-load play in progress, or already handled this session, leave it be.
    if (window.__mlsIntroPlaying || d.classList.contains("intro-done")) return;
    try {
      const reduce =
        (window.matchMedia &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches) ||
        d.classList.contains("a11y-reduce-motion");
      if (sessionStorage.getItem("introSeen")) {
        d.classList.add("intro-done");
        return;
      }
      sessionStorage.setItem("introSeen", "1");
      // reduced motion gets the motion-free fade instead of a full skip.
      if (reduce) d.classList.add("intro-reduced");
      // let it play, then mark done so bouncing back here doesn't replay it.
      const t = setTimeout(() => d.classList.add("intro-done"), reduce ? 1900 : 2700);
      return () => clearTimeout(t);
    } catch {
      d.classList.add("intro-done");
    }
  }, []);

  return null;
}
