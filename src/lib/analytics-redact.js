// WHAT ANALYTICS MAY RECORD OF AN ADDRESS. an emailed link carries its key in
// the path - /t/<token>, /ca/<token>, /a/sign/<token> - and a page view would
// hand that key to Vercel's dashboard, where it would keep working for anyone
// who read it there. the key comes out, the kind of page stays, and the query
// string goes too (a callbackUrl can carry a file's path).
//
// dependency-free so the node tests can pin it.
const RULES = [
  [/^\/t\/[^/]+/, "/t/[link]"],
  [/^\/ca\/[^/]+/, "/ca/[link]"],
  [/^\/s\/[^/]+/, "/s/[code]"],
  [/^\/a\/([a-z-]+)\/[^/]+/, "/a/$1/[link]"],
  [/^\/f\/file\/[^/]+/, "/f/file/[form]"],
  [/^\/f\/[^/]+/, "/f/[form]"],
  [/^\/c\/[^/]+/, "/c/[card]"],
  [/^\/portal\/files\/.+/, "/portal/files/[file]"],
];

export function redactPath(pathname) {
  const p = String(pathname || "/");
  for (const [re, to] of RULES) {
    if (re.test(p)) return p.replace(re, to);
  }
  return p;
}

export function redactUrl(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${redactPath(u.pathname)}`;
  } catch {
    return "";
  }
}
