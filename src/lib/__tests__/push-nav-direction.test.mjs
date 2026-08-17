// WHICH WAY A PORTAL NAVIGATION GOES.
//
// The rule decides whether a click slides the next page over or changes it the
// way it always has. Getting it wrong is not cosmetic: a tab switch that
// animates as "deeper" teaches people that left and right mean nothing, and a
// genuinely deeper click that does not animate makes the feature look broken on
// the screens it was built for.
//
// REAL PORTAL PATHS, THROUGH THE REAL FUNCTION. No source is read as text here -
// that has bitten this repo three times, failing on a rename rather than on a
// defect.
import test from "node:test";
import assert from "node:assert/strict";

// THE REAL FUNCTION, NOT A COPY OF IT. `PortalPushNav.js` is JSX behind
// "use client" and `node --test` cannot import that, so the rule lives in a
// dependency-free module the component and this both pull from - the same shape
// as `break-answers.js` and `storable.js`.
import {
  directionFor, depthOf, TAB_ROOTS,
  dragProgress, viewTransitionAnimations, navTransitionCss, NAV_MS, NAV_COMMIT_AT,
  createNavOwner, mayDropSnapshots, SPRING_HOLD_MS,
} from "../portal-nav.js";

// TWO TRANSITIONS, ONE ATTRIBUTE. `data-nav` on <html> is what every keyframe
// rule in `navTransitionCss` is selected by, and both navigation paths clear it
// when their own transition finishes. Overlap them - tap a card, then swipe
// back before it settles - and the FIRST to finish strips the rules from the
// one still RUNNING, which then draws the old page and the new page stacked on
// top of each other with no animation at all. Mánu hit exactly that on his
// phone on 2026-08-17.
test("only the newest claim may clear the nav attribute", () => {
  const owner = createNavOwner();
  const first = owner.claim();
  assert.equal(first(), true, "with nothing after it, the first claim owns it");

  const second = owner.claim();
  assert.equal(first(), false, "the older transition must clean up nothing");
  assert.equal(second(), true, "the newer one owns the attribute");
});

test("a claim stays valid however many times it is asked", () => {
  const owner = createNavOwner();
  const only = owner.claim();
  assert.equal(only(), true);
  assert.equal(only(), true, "a finally handler can fire more than once");
});

test("each owner counts on its own", () => {
  const a = createNavOwner();
  const b = createNavOwner();
  const ca = a.claim();
  b.claim();
  assert.equal(ca(), true, "another component's navigation cannot revoke this one");
});

// the rules the attribute carries, so the link between the two is not just a
// comment: lose `data-nav` and every one of these stops matching.
test("every transition rule hangs off the attribute", () => {
  const css = navTransitionCss();
  const rules = css.split("\n").filter((l) => l.includes("::view-transition"));
  assert.ok(rules.length >= 4, "there are transition rules to protect");
  for (const r of rules) {
    assert.match(r, /html\[data-nav/, `rule not gated on the attribute: ${r.trim()}`);
  }
});

test("tapping from the dashboard into a pay period goes deeper", () => {
  assert.equal(
    directionFor("/portal", "/portal/admin/timesheets/cmsprsdiw000004kvmd84voow"),
    "forward",
  );
});

test("a pay period into one person's day by day goes deeper", () => {
  assert.equal(
    directionFor(
      "/portal/admin/timesheets/cmsprsdiw000004kvmd84voow",
      "/portal/admin/timesheets/cmsprsdiw000004kvmd84voow/person/cmsprsrwx001i04kv94wihgaf",
    ),
    "forward",
  );
});

test("coming back up from a person to the pay period reads as back", () => {
  assert.equal(
    directionFor(
      "/portal/admin/timesheets/cmsprsdiw000004kvmd84voow/person/cmsprsrwx001i04kv94wihgaf",
      "/portal/admin/timesheets/cmsprsdiw000004kvmd84voow",
    ),
    "back",
  );
});

// THE ONE THE WHOLE RULE EXISTS FOR. Mánu's call was deeper only, and every tab
// root except the dashboard has MORE segments than the dashboard, so a plain
// depth count reads the bottom bar as going deeper on three of its four buttons.
test("every tab bar switch is left alone, in both directions", () => {
  // walked from TAB_ROOTS itself, so adding a sixth tab is covered the day it
  // is added rather than the day somebody remembers to widen this list
  const roots = [...TAB_ROOTS];
  for (const from of roots) {
    for (const to of roots) {
      assert.equal(
        directionFor(from, to),
        null,
        `${from} -> ${to} should not animate`,
      );
    }
  }
});

test("a deep page back out to its tab root does not animate on a click", () => {
  // the swipe gesture still animates this one - it is an explicit back - but a
  // link to a tab root is the bottom bar's job and stays instant
  assert.equal(directionFor("/portal/admin/timesheets", "/portal/admin"), null);
});

test("two screens at the same depth are a sideways move, not a push", () => {
  assert.equal(
    directionFor("/portal/contacts/abc", "/portal/contacts/def"),
    null,
  );
});

test("the same page is never a navigation", () => {
  assert.equal(directionFor("/portal/settings", "/portal/settings"), null);
  assert.equal(directionFor("/portal/admin/users", "/portal/admin/users"), null);
});

test("a missing path answers null rather than throwing", () => {
  assert.equal(directionFor(null, "/portal/admin/users"), null);
  assert.equal(directionFor("/portal", null), null);
  assert.equal(directionFor(undefined, undefined), null);
});

// A trailing slash is a different string and the same page. Left as a known
// limit rather than silently handled: Next normalises these away before
// `usePathname` ever sees one, so a fix here would be a branch that cannot run.
test("depth counts segments, not slashes", () => {
  assert.equal(depthOf("/portal/admin/users"), 3);
  assert.equal(depthOf("/portal/admin/users/"), 3);
  assert.equal(depthOf("/portal"), 1);
  assert.equal(depthOf(""), 0);
});

// ---------------------------------------------------------------------------
// THE SWIPE ITSELF. These are the pieces the gesture cannot be tested without:
// a touch handler needs a thumb, but the arithmetic and the wiring do not.

test("the finger's position is a clamped fraction of one screen", () => {
  assert.equal(dragProgress(0, 375), 0);
  assert.equal(dragProgress(187.5, 375), 0.5);
  assert.equal(dragProgress(375, 375), 1);
  // past the far edge is still the end, not more than the end
  assert.equal(dragProgress(900, 375), 1);
  // dragging the wrong way is not negative progress, it is no progress
  assert.equal(dragProgress(-120, 375), 0);
});

// A ZERO WIDTH IS NOT A HYPOTHETICAL: it is what `window.innerWidth` reads as
// in a background tab on some browsers, and a division by it would put the
// animation at NaN, which throws when assigned to `currentTime`.
test("a zero or missing width answers 0 rather than NaN", () => {
  assert.equal(dragProgress(100, 0), 0);
  assert.equal(dragProgress(100, undefined), 0);
  assert.equal(dragProgress(100, -5), 0);
});

test("the commit line is a real fraction of the screen", () => {
  assert.ok(NAV_COMMIT_AT > 0 && NAV_COMMIT_AT < 1);
  // a drag shorter than the line springs back, one past it completes
  assert.ok(dragProgress(40, 375) < NAV_COMMIT_AT);
  assert.ok(dragProgress(200, 375) >= NAV_COMMIT_AT);
});

// THE ONE THAT STOPS THE GESTURE AND THE PICTURE DRIFTING APART. The swipe sets
// `currentTime` in milliseconds against NAV_MS, so if the CSS were ever written
// with a different figure the page would arrive before or after the thumb did.
// Building the CSS from the constant is what makes that impossible, and this
// fails the moment somebody types a duration in by hand instead.
test("every duration in the transition CSS comes from NAV_MS", () => {
  const css = navTransitionCss();
  const durations = [...css.matchAll(/(\d+)ms/g)].map((m) => Number(m[1]));
  assert.ok(durations.length >= 5, "expected the animation shorthands and the group rule");
  for (const d of durations) assert.equal(d, NAV_MS);
});

test("the CSS carries both directions and the reduced-motion escape", () => {
  const css = navTransitionCss();
  for (const needle of [
    'html[data-nav="forward"]::view-transition-old(root)',
    'html[data-nav="forward"]::view-transition-new(root)',
    'html[data-nav="back"]::view-transition-old(root)',
    'html[data-nav="back"]::view-transition-new(root)',
    "prefers-reduced-motion",
  ]) {
    assert.ok(css.includes(needle), `missing ${needle}`);
  }
});

test("a different duration rebuilds the CSS rather than being ignored", () => {
  assert.ok(navTransitionCss(500).includes("500ms"));
  assert.ok(!navTransitionCss(500).includes(`${NAV_MS}ms`));
});

// PICKING THE RIGHT ANIMATIONS TO FREEZE. Pausing something the transition does
// not own would stop an unrelated spinner mid-flight and never restart it.
test("only the transition's own animations are picked up", () => {
  const fake = {
    getAnimations: () => [
      { effect: { pseudoElement: "::view-transition-old(root)" }, id: "old" },
      { effect: { pseudoElement: "::view-transition-new(root)" }, id: "new" },
      { effect: { pseudoElement: "::view-transition-group(root)" }, id: "group" },
      { effect: { pseudoElement: "::before" }, id: "someone-elses" },
      { effect: { pseudoElement: null }, id: "a-plain-element" },
      { effect: null, id: "no-effect-at-all" },
    ],
  };
  assert.deepEqual(viewTransitionAnimations(fake).map((a) => a.id), ["old", "new", "group"]);
});

test("a document that cannot list animations answers empty, not undefined", () => {
  assert.deepEqual(viewTransitionAnimations(null), []);
  assert.deepEqual(viewTransitionAnimations({}), []);
});

// THE SPRING-BACK MAY NOT DROP ITS SNAPSHOTS OVER THE WRONG PAGE. Letting go
// short of the line springs the picture back and re-navigates forward, and
// until that navigation lands, the snapshots are the only thing covering the
// page the history is still standing on. Dropping them early is a full-screen
// blink of that page - which is what every slow peek-and-return showed.
test("the snapshots hold until the page under them is the one they draw", () => {
  const home = "/portal/admin/applications";
  assert.equal(mayDropSnapshots("/portal/admin", home, 0), false,
    "the router has not brought the page back yet");
  assert.equal(mayDropSnapshots(home, home, 0), true,
    "the page is back, the drop is invisible");
});

test("a route that never comes back releases the page after the grace", () => {
  const home = "/portal/admin/applications";
  assert.equal(mayDropSnapshots("/portal/admin", home, SPRING_HOLD_MS + 1), true,
    "held past the grace, the page must be let go frozen or not");
  assert.equal(mayDropSnapshots("/portal/admin", home, SPRING_HOLD_MS - 1), false,
    "inside the grace it keeps waiting");
});
