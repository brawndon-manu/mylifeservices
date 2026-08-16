"use client";

import { useEffect } from "react";

// Registers /sw.js, which exists for one reason: Chrome will not offer to
// install the app automatically without a fetch handler. See the long note in
// public/sw.js for what it deliberately does not do, which is cache anything.
//
// DEV IS EXCLUDED. A service worker sitting in front of a hot-reloading dev
// server is a good way to spend an hour on a stale page that is not stale, and
// there is nothing to test here that production does not do identically.
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    // after load, so registering never competes with the page it is on
    const on = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") on();
    else {
      window.addEventListener("load", on);
      return () => window.removeEventListener("load", on);
    }
  }, []);

  return null;
}
