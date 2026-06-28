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

export function renderMarkdown(md) {
  if (!md) return "";
  const raw = marked.parse(md, { breaks: true });
  return sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt", "title"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    // open links in a new tab, safely.
    transformTags: {
      a: (tagName, attribs) => ({
        tagName: "a",
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" },
      }),
    },
  });
}
