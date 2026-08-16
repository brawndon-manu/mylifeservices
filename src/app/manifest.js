// THE PORTAL AS A HOME-SCREEN APP.
//
// Next serves this at /manifest.webmanifest and links it on every page. Saving
// the site to a home screen then opens it in its own window with no browser
// chrome, which is the whole point: staff open this to do one thing - read an
// announcement, answer a question about their breaks, sign a timesheet - and a
// tab they have to go and find is a tab they do not open.
//
// IT IS NOT GATED BY MAINTENANCE, and that is on purpose rather than luck: the
// proxy's matcher skips any path carrying a dot, so this file and the icons
// stay reachable while the public site is behind the splash. An install that
// only works on some days would be worse than none.
export default function manifest() {
  return {
    name: "My Life Services Employee Portal",
    // what fits under an icon on a home screen. anything longer is truncated
    // by the phone, and it chooses where to cut rather than us.
    short_name: "MLS Portal",
    description:
      "Announcements, timesheets, contacts and forms for My Life Services staff.",
    // OPENS ON THE PORTAL, not the marketing site. Somebody who put this on
    // their home screen did it to get to their own things.
    start_url: "/portal",
    // everything under the site stays inside the app window; an outside link
    // opens in the browser, which is the behaviour we want - a standalone
    // window has no address bar and no way back.
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // the splash and the status bar while it launches. Brand blue rather than
    // one of the three portal themes, because this is chrome around the app
    // rather than part of it, and it cannot follow a theme the user picks
    // inside.
    background_color: "#ffffff",
    theme_color: "#196e93",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android may crop a circle out of this one, so its artwork sits inside
      // the middle 60% with the gradient running to the edge.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
