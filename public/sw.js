// THE SMALLEST SERVICE WORKER THAT MAKES CHROME OFFER TO INSTALL, AND NOTHING
// MORE.
//
// WHY IT EXISTS. Chrome dropped the service-worker requirement for installing
// from its menu in version 108 on mobile, but the automatic install prompt -
// the one that actually appears in front of somebody without being hunted for -
// still requires a fetch() handler, and Chrome ignores handlers that do nothing.
// A Pixel visiting the portal was getting no offer.
//
// WHAT IT DELIBERATELY DOES NOT DO: CACHE ANYTHING.
//
// The usual template precaches pages so the app "works offline". On this app
// that means somebody opens their timesheet on the train and reads HOURS THAT
// ARE NO LONGER TRUE, with nothing on the screen saying so - a signed sheet is
// built from these figures. There is no cache here at all. Every request goes
// to the network exactly as it would with no service worker installed.
//
// The only thing it adds is an honest page when the network is gone, which is
// also what satisfies Chrome's offline check. It is generated in here rather
// than fetched, so there is no stored copy of anything to go stale, and nothing
// for the maintenance splash to be cached as by mistake.
//
// TO REMOVE IT: replace this file's body with `self.registration.unregister()`.
// A service worker survives a deploy, so deleting the file alone leaves the old
// one installed on every phone that already has it.

const VERSION = "mls-sw-1";

const OFFLINE_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>No connection - My Life Services</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    background:#0b0b0d; color:#e7e8ec; font:16px/1.6 Arial, Helvetica, sans-serif; padding:24px }
  .box { max-width:32rem; text-align:center }
  h1 { font-size:22px; margin:0 0 12px; font-weight:600 }
  p { margin:0 0 8px; color:#a3a8b3 }
  b { color:#e7e8ec }
</style></head>
<body><div class="box">
  <h1>No connection</h1>
  <p>The portal needs to be online. Nothing is stored on this phone.</p>
  <p><b>That is on purpose:</b> your hours change when a reviewer or you answer
     something, and a saved copy could show you figures that are no longer true.</p>
  <p>Try again once you have signal.</p>
</div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  // clear anything a previous version of this file may have stored, so the
  // no-cache promise holds even if this worker is ever changed and changed back
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  // PAGE LOADS ONLY. Data, images and everything else are left completely
  // alone - not intercepted, not cached, not touched.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_PAGE, {
        status: 503,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    ),
  );
});
