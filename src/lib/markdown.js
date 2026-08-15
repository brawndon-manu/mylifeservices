// render internal markdown to safe HTML. announcement authors are Supervisor+
// (internal staff, not the public), but we still sanitize so a markdown post
// cant slip in a <script>/<style>/<iframe> that would run for other staff
// viewing it. used by every announcement type now (plain + Changelog).
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "p", "ul", "ol", "li", "blockquote", "pre", "code",
  "strong", "em", "del", "a", "hr", "br", "img",
  "table", "thead", "tbody", "tr", "th", "td",
];

// a post can carry pictures and GIFs in the middle of its text now, and email
// has no stylesheet to size them with - so on the way into an email every image
// gets the width rule inline. the email card is 600px wide with 28px of padding,
// so max-width keeps a phone photo inside the column instead of stretching the
// message sideways.
//
// NOT display:block. an image the author put mid-sentence has to stay in that
// sentence, and one on its own line is already in its own <p> with a paragraph's
// spacing around it.
const EMAIL_IMG_STYLE =
  "max-width:100%;height:auto;border-radius:8px;vertical-align:middle;";

// `email: true` inlines that style. the portal does its sizing in CSS, so it
// leaves the tag alone.
export function renderMarkdown(md, { email = false } = {}) {
  if (!md) return "";
  const raw = marked.parse(md, { breaks: true });
  return sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "title"],
      img: email ? ["src", "alt", "title", "style"] : ["src", "alt", "title"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    // open links in a new tab, safely.
    transformTags: {
      a: (tagName, attribs) => ({
        tagName: "a",
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" },
      }),
      // authors can't write a style attribute (it isn't allowed above), so this
      // is setting one, not honouring one.
      ...(email
        ? {
            img: (tagName, attribs) => ({
              tagName: "img",
              attribs: { ...attribs, style: EMAIL_IMG_STYLE },
            }),
          }
        : {}),
    },
  });
}
