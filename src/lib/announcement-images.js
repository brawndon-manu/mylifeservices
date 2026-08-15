// Pictures and GIFs dropped into the middle of an announcement.
//
// The body was already markdown and the sanitizer already allowed <img>, so an
// inline picture is just `![alt](url)` sitting in the text. The only thing
// missing was somewhere to put the file and something to type the syntax, which
// is what this is: the rules for what may be uploaded, the key it lands under,
// and where the markdown goes relative to the cursor.
//
// DEPENDENCY-FREE ON PURPOSE, same reason as announcement-attachments.js. What
// comes out of here ends up in a post every staff member reads and in the email
// all of them get, so the rules are testable without booting next - and the
// browser and the upload route get to check the same ones.
import { IMAGE_ACCEPT } from "./hub.js";

// what the editor offers and what the token endpoint allows. one list, so the
// file picker can't suggest something the server is going to turn away.
export const INLINE_IMAGE_ACCEPT = IMAGE_ACCEPT;

// 25MB, and deliberately NOT the 4MB the hero image gets.
//
// the hero image rides in on a server action, so it's stuck under the 4.5MB
// vercel caps a request body at. these go from the browser straight to the blob
// store and never touch our lambda, so that ceiling doesn't apply - which is the
// whole reason a long GIF works here and wouldn't there.
//
// what's left to worry about is the reader, not the request: an inline picture
// is emailed as a remote <img> rather than an attachment, so a big one doesn't
// fatten the message, it just makes somebody's phone sit there loading it. 25MB
// is a generous reaction GIF and still nowhere near a video.
export const INLINE_IMAGE_MAX_BYTES = 25 * 1024 * 1024;

// inline images live under their own prefix so they're tellable apart in the
// bucket from the hero image and the attached PDFs.
export const INLINE_IMAGE_PREFIX = "announcements/inline";

const EXT_BY_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function mb(bytes) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

// is this file usable? returns a sentence to show the author, or null when it's
// fine. the browser asks first so a 40MB video fails instantly instead of after
// a minute of uploading, and the route asks again because nothing stops someone
// posting straight at it.
export function imageFileProblem(file) {
  if (!file || typeof file !== "object" || typeof file.size !== "number") {
    return "Pick an image file.";
  }
  const type = typeof file.type === "string" ? file.type.toLowerCase() : "";
  if (!INLINE_IMAGE_ACCEPT.includes(type)) {
    return "Images have to be a JPG, PNG, WebP, or GIF.";
  }
  if (!(file.size > 0)) return "That file is empty.";
  if (file.size > INLINE_IMAGE_MAX_BYTES) {
    return `Images have to be under ${mb(INLINE_IMAGE_MAX_BYTES)} MB. That one is ${mb(file.size)} MB.`;
  }
  return null;
}

// the blob key. the extension comes off the mime type rather than the filename,
// because the filename is whatever the author's phone called it and we already
// know what we accepted. `token` and `now` are passed in so this is a pure
// function and the test can pin the key it expects.
export function inlineImageKey(type, token, now) {
  const ext = EXT_BY_TYPE[String(type).toLowerCase()] || "bin";
  const stamp = Number.isFinite(now) ? now : 0;
  const safeToken = String(token || "").replace(/[^a-z0-9]/gi, "").slice(0, 12) || "x";
  return `${INLINE_IMAGE_PREFIX}/${stamp}-${safeToken}.${ext}`;
}

// THE BROWSER NAMES THE FILE NOW.
//
// with the upload going straight from the editor to the blob store, the key is
// whatever the page asked for, and the page is something anybody signed in can
// re-write. so the token endpoint checks the shape before it hands out
// permission to write: our prefix, our key format, one of our extensions. an
// author who wants to put a file somewhere else in the bucket gets told no.
const INLINE_KEY_RE = new RegExp(
  `^${INLINE_IMAGE_PREFIX}/\\d{1,20}-[a-z0-9]{1,12}\\.(?:${Object.values(EXT_BY_TYPE).join("|")})$`,
);

export function isInlineImageKey(pathname) {
  return typeof pathname === "string" && INLINE_KEY_RE.test(pathname);
}

// alt text sits inside `![ ]`, so a bracket in it closes the image early and
// leaves the rest of the name sitting in the post as loose characters. newlines
// break it just as badly.
export function cleanAlt(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

// a readable alt from the filename, for when the author doesn't write one.
// "summer party (final).GIF" reads as "summer party final".
export function altFromFilename(name) {
  if (typeof name !== "string") return "";
  const base = name.split(/[\\/]/).pop() || "";
  return cleanAlt(base.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " "));
}

// `![alt](url)`. a url with a space or a paren in it would end the link early,
// so those get the angle-bracket form markdown keeps for exactly this.
export function imageMarkdown(url, alt) {
  const href = String(url || "").trim();
  if (!href) return "";
  const wrapped = /[\s()]/.test(href) ? `<${href}>` : href;
  return `![${cleanAlt(alt)}](${wrapped})`;
}

function clamp(n, max) {
  const v = Number.isFinite(n) ? Math.trunc(n) : max;
  return Math.min(Math.max(v, 0), max);
}

// Drop the image where the cursor is.
//
// THE POINT OF THE WHOLE FEATURE IS THAT IT LANDS WHERE THEY LEFT OFF: an
// author who wants a GIF mid-sentence puts the caret mid-sentence, one who wants
// it between two paragraphs puts the caret on the blank line between them. The
// only fiddling done here is a single space so the image isn't glued onto the
// word before it, and whatever the author had selected becomes the alt text
// (the same trade every editor makes when you paste a link over a selection).
export function insertImageMarkdown(text, start, end, { url, alt } = {}) {
  const body = typeof text === "string" ? text : "";
  const from = clamp(start, body.length);
  const to = Math.max(from, clamp(end, body.length));

  const selected = body.slice(from, to);
  const snippet = imageMarkdown(url, cleanAlt(alt) || cleanAlt(selected));
  if (!snippet) return { text: body, cursor: to };

  const before = body.slice(0, from);
  const after = body.slice(to);
  const padBefore = before && !/\s$/.test(before) ? " " : "";
  const padAfter = after && !/^\s/.test(after) ? " " : "";
  const head = `${before}${padBefore}${snippet}`;
  return { text: `${head}${padAfter}${after}`, cursor: head.length };
}

// every inline image url in a body. used when a post is deleted so the files it
// carried don't sit in the bucket forever. only our own prefix comes back - a
// url pointing anywhere else isn't ours to delete.
export function inlineImageUrlsIn(md) {
  if (typeof md !== "string" || !md) return [];
  const out = [];
  const re = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?\s*(?:"[^"]*")?\)/g;
  let m;
  while ((m = re.exec(md))) {
    const url = m[1];
    if (url.includes(`/${INLINE_IMAGE_PREFIX}/`)) out.push(url);
  }
  return [...new Set(out)];
}
