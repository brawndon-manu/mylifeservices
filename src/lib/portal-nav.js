// WHICH WAY A PORTAL NAVIGATION GOES, AND HOW LONG IT TAKES.
//
// DEPENDENCY-FREE ON PURPOSE, for the same reason `break-answers.js` and
// `announcement-images.js` are: the browser needs these, `node --test` needs
// them, and the component that uses them is JSX behind "use client", which the
// test runner cannot import. Keeping the rules here is what stops them being
// copied into a test and quietly drifting from the code they describe.
//
// Nothing in this file may import React, Next, or Prisma.

// The four bottom-bar destinations plus Hub, which replaces Admin for anyone
// not elevated - see `PortalTabBar`. Landing on one of these is a SIDEWAYS move
// however many segments it has, and that is the whole reason this is not a
// plain depth comparison: `/portal` is one segment and `/portal/announcements`
// is two, so three of the four tab buttons would read as going deeper.
export const TAB_ROOTS = new Set([
  "/portal",
  "/portal/announcements",
  "/portal/settings",
  "/portal/admin",
  "/portal/hub",
]);

export const depthOf = (p) => (p || "").split("/").filter(Boolean).length;

// "forward" slides the next page over, "back" slides it off, null leaves the
// navigation exactly as it behaves today. Mánu 2026-08-17 chose deeper only.
export function directionFor(from, to) {
  if (!from || !to || from === to) return null;
  if (TAB_ROOTS.has(to)) return null;
  const a = depthOf(from);
  const b = depthOf(to);
  if (b > a) return "forward";
  if (b < a) return "back";
  return null;
}

// ONE NUMBER, AND IT HAS TO BE ONE NUMBER. The swipe scrubs the transition's own
// animations by setting `currentTime`, so the code doing the scrubbing needs the
// exact figure the CSS was written with. Two copies drift the day somebody
// retimes the animation, and the failure is a gesture that reaches the end of
// the finger's travel before or after the page does.
export const NAV_MS = 300;

// How far across the screen a drag has to get before letting go commits to it.
// Under this it springs back and no navigation happens, so brushing the edge
// while reading cannot lose somebody their page.
export const NAV_COMMIT_AT = 0.3;

// THE TRANSITION'S CSS, BUILT HERE SO IT CANNOT BE SEPARATED FROM `NAV_MS`.
//
// It is injected as a <style> block by the root layout rather than written in
// globals.css, and that is measured rather than preferred: put there on
// 2026-08-17 every rule and all four keyframes were dropped from the bundle
// while the rules on either side of them survived. The pipeline does not
// understand `::view-transition-old(root)`, drops those rules, then prunes the
// keyframes nothing references any more.
//
// The outgoing page moves 30% and the incoming one 100% - the parallax picked
// off the mock, so the page underneath follows rather than sitting still and
// reads as pushed aside rather than thrown away.
export function navTransitionCss(ms = NAV_MS) {
  const ease = "cubic-bezier(.22,.61,.36,1)";
  return `
@keyframes nav-in-from-right { from { transform: translateX(100%); } }
@keyframes nav-out-to-left { to { transform: translateX(-30%); opacity: .6; } }
@keyframes nav-in-from-left { from { transform: translateX(-30%); opacity: .6; } }
@keyframes nav-out-to-right { to { transform: translateX(100%); } }
html[data-nav]::view-transition-group(root) { animation-duration: ${ms}ms; }
html[data-nav]::view-transition-old(root),
html[data-nav]::view-transition-new(root) { mix-blend-mode: normal; }
html[data-nav="forward"]::view-transition-old(root) {
  animation: nav-out-to-left ${ms}ms ${ease} both; }
html[data-nav="forward"]::view-transition-new(root) {
  animation: nav-in-from-right ${ms}ms ${ease} both;
  box-shadow: -12px 0 26px rgb(0 0 0 / .28); }
html[data-nav="back"]::view-transition-old(root) {
  animation: nav-out-to-right ${ms}ms ${ease} both;
  box-shadow: -12px 0 26px rgb(0 0 0 / .28); }
html[data-nav="back"]::view-transition-new(root) {
  animation: nav-in-from-left ${ms}ms ${ease} both; }
@media (prefers-reduced-motion: reduce) {
  html[data-nav]::view-transition-old(root),
  html[data-nav]::view-transition-new(root) { animation: none; }
}`;
}

// ONE ATTRIBUTE, TWO TRANSITIONS THAT CAN OVERLAP.
//
// `data-nav` on <html> is what picks the keyframes, and every rule in
// `navTransitionCss` is selected by it. Both navigation paths set it and both
// clear it when their own transition finishes - which is wrong the moment two
// overlap, and they do: tap a card, then swipe back before the first one has
// settled. The FIRST transition finishes, its cleanup deletes the attribute,
// and the one still running loses every keyframe rule mid-flight. The
// pseudo-elements then draw with no animation at all: the old page and the new
// page stacked on top of each other, both fully visible.
//
// Mánu hit exactly that on his phone on 2026-08-17 - two pages superimposed,
// and a second shot with content at three different offsets where a scrub had
// moved things before the rules vanished.
//
// So the attribute belongs to whoever claimed it LAST, and an older claim
// cleans up nothing. Pure and separate from the component so the rule can be
// tested without a browser.
export function createNavOwner() {
  let seq = 0;
  return {
    // -> a function that answers "is this claim still the current one?"
    claim() {
      const id = ++seq;
      return () => seq === id;
    },
  };
}

// The animations a running view transition owns, and nothing else on the page.
// Split out because the scrub has to find them, pause them, and later let them
// go, and picking the wrong ones would freeze something unrelated mid-flight.
export function viewTransitionAnimations(doc) {
  if (!doc || typeof doc.getAnimations !== "function") return [];
  return doc
    .getAnimations()
    .filter((a) => String(a.effect?.pseudoElement || "").startsWith("::view-transition"));
}

// Where the finger is, as a fraction of one screen width, clamped. Exported so
// the test can pin the edges rather than trusting an inline expression.
export function dragProgress(dx, width) {
  if (!width || width <= 0) return 0;
  return Math.max(0, Math.min(1, dx / width));
}

// LETTING GO SHORT OF THE LINE springs the picture back and re-navigates
// forward - and the transition's snapshots are the only thing covering the
// page the history is still standing on. Drop them before the router has
// brought the page back and the screen blinks the wrong page at full size,
// which is what a slow peek-and-return showed on every release. So they hold
// until the path under them is the one they are drawing - or until the grace
// runs out, because a route that never comes back must not hold the page
// forever.
export const SPRING_HOLD_MS = 400;
export function mayDropSnapshots(pathNow, home, heldMs) {
  return pathNow === home || heldMs > SPRING_HOLD_MS;
}

// THE BROWSER'S OWN EDGE SWIPE WINS BY US STANDING DOWN.
//
// iOS Safari drives history from the screen edge itself - real page snapshots,
// finger tracking, the works - and it does it for pushState entries too. Run
// the custom drag as well and a SLOW swipe starts both: ours commits
// `router.back()` at 10px, Safari then takes the touch for its native gesture,
// and the two animations fight over one history until the page wedges - both
// pages stacked semi-transparent, frozen. Reproduced in the iOS Simulator
// 2026-08-25 on exactly the slow swipe Mánu reported.
//
// So where a native edge-back gesture exists, the custom one does not run.
// Installed to the home screen there is no native gesture (standalone mode),
// and there the custom drag carries the weight alone.
export function nativeEdgeBackGesture({ userAgent = "", maxTouchPoints = 0, standalone = false } = {}) {
  const ios =
    /iPad|iPhone|iPod/.test(userAgent) ||
    // iPadOS reports itself as a Mac; the touch points give it away
    (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  return ios && !standalone;
}

// THE SCRUB ONLY WORKS WHERE THE ANIMATIONS CAN BE DRIVEN BY HAND.
//
// The finger-tracked back gesture pauses the view transition's pseudo-element
// animations and sets their currentTime from the thumb - and that needs
// `document.getAnimations()` to hand them over, which WebKit does not do.
// Worse: starting a transition mid-touch and holding it open WEDGES WebKit -
// instrumented in the Simulator 2026-08-25, the commit logs, `ready` never
// resolves, no further touch events are processed, and both snapshots freeze
// stacked on screen. No failsafe can fire inside a wedged page.
//
// So on WebKit the gesture is RELEASE-DRIVEN instead: the drag is only
// measured, and crossing the line and letting go plays the ordinary back
// transition - the same safe path a tap on "Back" takes. Chromium keeps the
// finger-tracked scrub.
export function scrubbableViewTransitions(userAgent = "") {
  // on iOS every browser is WebKit no matter whose name is on the app -
  // Chrome and Edge there carry CriOS/EdgiOS tokens but run Apple's engine
  if (/iPad|iPhone|iPod/.test(userAgent)) return false;
  const webkitOnly =
    /AppleWebKit/.test(userAgent) &&
    !/Chrome|CriOS|EdgiOS|Edg\/|OPR|SamsungBrowser/.test(userAgent);
  return !webkitOnly;
}

// A TOUCH THE GLASS DROPPED AND GAVE BACK. At the very edge of the screen the
// digitizer can lose a resting finger - half of it is off the glass - and
// re-acquire it a beat later as a brand new touch. A drag that survives that
// adopts the new touch, and this answers where the adopted touch's origin has
// to sit so the progress already on screen carries on unbroken: the page must
// not jump the moment the finger is re-found.
export function originForProgress(clientX, p, width) {
  return clientX - (p || 0) * (width || 0);
}
