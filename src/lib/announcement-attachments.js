// Documents attached to an announcement.
//
// Mánu 2026-08-10, after Britny could not get the workers' comp training out:
// a post has to carry its PDFs, from the forms library or uploaded straight
// onto it, and staff get them in the email as well as on the page.
//
// DEPENDENCY-FREE ON PURPOSE. This is a trust boundary - whatever reaches
// `attachments` is rendered as a link on a page staff read and emailed to every
// one of them - so it is testable on its own, the same reason the live-send
// guard sits in timesheet-mode.js rather than inside the sender.

export const ATTACH_ACCEPT = ["application/pdf"];
// Resend caps a message at 40MB and every recipient gets their own copy, so a
// fat deck is 59 fat messages. Britny's 14 slides are 559KB; this leaves room
// without letting somebody attach a video.
export const ATTACH_MAX_BYTES = 8 * 1024 * 1024;
export const ATTACH_MAX_COUNT = 5;

// one attachment, cleaned. Returns null for anything that is not usable, so a
// bad entry is dropped rather than stored and rendered as a broken link.
export function cleanAttachment(a) {
  if (!a || typeof a !== "object") return null;
  const url = typeof a.url === "string" ? a.url.trim() : "";
  if (!url) return null;
  // Same-origin path or an https blob url - never a link somebody pasted to
  // another site, which is how an attachment becomes a phishing link with the
  // company's name on it.
  //
  // "//evil.example/x.pdf" STARTS WITH A SLASH and is not same-origin: the
  // browser reads it as protocol-relative and goes off-site. Caught by the test
  // that exists for exactly this.
  const sameOrigin = url.startsWith("/") && !url.startsWith("//");
  if (!sameOrigin && !/^https:\/\//i.test(url)) return null;
  const name = (typeof a.name === "string" ? a.name.trim() : "") || "Document";
  return {
    name: name.slice(0, 120),
    url,
    // set when it came from the forms library, so the post can link back to it
    formId: typeof a.formId === "string" && a.formId ? a.formId : null,
    bytes: Number.isFinite(a.bytes) ? a.bytes : null,
  };
}

// the stored list, cleaned and capped. Always an array, so callers never have to
// think about null.
export function attachmentsOf(post) {
  const raw = Array.isArray(post?.attachments) ? post.attachments : [];
  return raw.map(cleanAttachment).filter(Boolean).slice(0, ATTACH_MAX_COUNT);
}

// THE FORM THEY HAVE TO SIGN IS A DOCUMENT TOO. Mánu 2026-08-10: "i want the
// forms included ... to be a part of the email."
//
// A post's signable form (`formId`) and its attachment list are separate
// fields, so picking a form to be signed did NOT put that form in the email -
// staff got the reading material and not the thing they were being asked to
// sign. This folds it in, deduped, so choosing it once is enough.
//
// It goes FIRST: it is the document the message is actually about.
export function emailAttachmentsOf(post, form) {
  const list = attachmentsOf(post);
  const f = cleanAttachment(
    form?.fileUrl ? { url: form.fileUrl, name: form.title, formId: form.id } : null,
  );
  if (!f) return list;
  // already carried, either by url or because the same library form was picked
  const already = list.some(
    (a) => a.url === f.url || (f.formId && a.formId && a.formId === f.formId),
  );
  if (already) return list;
  return [f, ...list].slice(0, ATTACH_MAX_COUNT);
}
