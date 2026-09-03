"use client";

// shared add/edit form for an announcement. the "type" (tag) is picked first,
// at the top, and the rest of the form adapts to it - mirrors the resource form
// pattern. the Changelog type (IT/Super only) swaps in a title + markdown body
// that renders Discord-style; every other type is a plain post.
import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { marked } from "marked";
import {
  ANNOUNCEMENT_TAG_STYLES,
  ANNOUNCEMENT_TITLE_MAX,
  ANNOUNCEMENT_CONTENT_MAX,
  CHANGELOG_CONTENT_MAX,
  isChangelog,
  isCompanyMeeting,
  isEvent,
} from "@/lib/announcements";
import { IMAGE_MAX_BYTES, IMAGE_ACCEPT } from "@/lib/hub";
import { upload } from "@vercel/blob/client";
import {
  INLINE_IMAGE_ACCEPT,
  INLINE_IMAGE_MAX_BYTES,
  altFromFilename,
  imageFileProblem,
  inlineImageKey,
  insertImageMarkdown,
} from "@/lib/announcement-images";
import { ATTACH_ACCEPT, ATTACH_MAX_BYTES, ATTACH_MAX_COUNT, attachmentsOf } from "@/lib/announcements";
import DatePicker from "@/components/DatePicker";
import AudiencePicker from "./AudiencePicker";
import MeetingFields from "./MeetingFields";
import EventFields from "./EventFields";

const INPUT =
  "mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const LABEL = "block text-sm font-medium text-muted";

// placeholders tuned to the selected type, so the examples match the category
// you're posting in (an Event title reads different from a Changelog title).
const TITLE_PLACEHOLDERS = {
  Announcement: "e.g. New meal break waiver",
  Changelog: "e.g. Portal Update: June 27, 2026",
  Event: "e.g. Summer Staff Mixer",
  "Company Meeting": "e.g. Q3 Training Series",
  Other: "e.g. Parking lot closed this Friday",
};
const BODY_PLACEHOLDERS = {
  Announcement:
    "Write your announcement. Markdown works:\n\n## What you need to do\n- **Step one**\n- Step two\n\n[Link](https://...)",
  Event:
    "What's happening? Who's invited, what to expect, and anything to bring.\n\n**Food, games, and music** - hope to see you there!",
  "Company Meeting":
    "What's this meeting about? Add an agenda and anything to prepare.\n\n## Agenda\n- First item\n- Second item",
  Other: "Write your update. Markdown works: ## headers, - bullets, **bold**, [links](https://...).",
};

// images get the same treatment here as on the real post, so Preview is worth
// trusting: never wider than the column, and never stretched.
const PREVIEW_IMG =
  "[&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-border";

const PREVIEW_PROSE =
  "min-h-[8rem] rounded-md border border-border-strong bg-surface px-3 py-2 text-[15px] leading-relaxed text-foreground [&_h1]:mt-4 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_a]:text-brand [&_a]:underline [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_em]:italic [&_hr]:my-4 [&_hr]:border-border";

// WHICH CHARACTER WAS UNDER THE POINTER WHEN THEY LET GO.
//
// a textarea has no api for this, so it goes through the document: firefox has
// caretPositionFromPoint, chrome and safari have caretRangeFromPoint, and both
// answer with an offset into the text. if neither is there we fall back to the
// caret the box already had, which is where a drop would have landed anyway.
function caretAtPoint(ta, x, y) {
  if (!ta) return 0;
  const doc = ta.ownerDocument;
  try {
    if (doc.caretPositionFromPoint) {
      const pos = doc.caretPositionFromPoint(x, y);
      if (pos && (pos.offsetNode === ta || ta.contains(pos.offsetNode))) {
        return pos.offset;
      }
    }
    if (doc.caretRangeFromPoint) {
      const range = doc.caretRangeFromPoint(x, y);
      if (range) return range.startOffset;
    }
  } catch {
    // fall through to the caret below
  }
  return ta.selectionStart ?? ta.value.length;
}

// markdown textarea with a GitHub-style Write / Preview toggle so authors can
// see how their post renders before publishing. controlled so preview is live.
// the box grows with the content instead of scrolling inside a fixed height -
// a changelog runs long and typing into a little porthole is miserable.
//
// the Add image / GIF button uploads the file first and then drops the markdown
// for it wherever the caret was, so a picture can land in the middle of a
// sentence and not only at the bottom of the post.
function MarkdownField({ value, onChange, rows, maxLength, placeholder }) {
  const [tab, setTab] = useState("write");
  const [uploading, setUploading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [ofLabel, setOfLabel] = useState("");
  const [dragging, setDragging] = useState(false);
  const [imgError, setImgError] = useState(null);
  const taRef = useRef(null);
  const fileRef = useRef(null);
  const html = useMemo(
    () => marked.parse(value || "_Nothing to preview yet._", { breaks: true }),
    [value],
  );

  const grow = (el) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  // re-measure when the value changes or we switch back to the write tab (a
  // hidden textarea has no scrollHeight, so it can't size itself while away)
  useEffect(() => {
    if (tab === "write") grow(taRef.current);
  }, [value, tab]);

  // A MISS MUST NOT COST THEM THE POST.
  //
  // now that dragging a GIF in is the suggested way to do it, some of those
  // drags land next to the box rather than in it - and a file dropped anywhere
  // else sends the browser off to open it, taking the half-written announcement
  // with it. so stray file drops are swallowed. the textarea and the real file
  // inputs (documents, flyer) are left alone, or this would break them too.
  useEffect(() => {
    const swallow = (e) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      const t = e.target;
      if (t === taRef.current || (t?.tagName === "INPUT" && t.type === "file")) return;
      e.preventDefault();
    };
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  }, []);
  const tabClass = (active) =>
    `rounded-t-md px-3 py-1.5 text-sm font-medium transition ${
      active
        ? "border border-b-0 border-border-strong bg-surface text-foreground"
        : "text-muted hover:text-foreground"
    }`;

  // upload each file and drop the markdown for it in at `start`..`end`, one
  // after the next. shared by the button and by a drop onto the box, so the two
  // routes in cannot drift apart.
  const addImages = async (files, start, end) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setImgError(null);

    // check them all before uploading any: finding out the third file is a PDF
    // after two have gone up is worse than being told before anything moves.
    const problem = list.map(imageFileProblem).find(Boolean);
    if (problem) {
      setImgError(problem);
      return;
    }

    // `value` is the prop and doesn't change while this runs, so the running
    // text is tracked here and handed back once at the end.
    let text = value;
    let from = start;
    let to = end;
    let failed = null;

    setUploading(true);
    setPercent(0);
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      setOfLabel(list.length > 1 ? ` (${i + 1} of ${list.length})` : "");
      try {
        // STRAIGHT TO THE BLOB STORE, NOT THROUGH US. a request body through our
        // own server is capped at 4.5MB, which is no size at all for a GIF. the
        // route only hands out permission; the file never passes through it.
        const blob = await upload(
          inlineImageKey(file.type, Math.random().toString(36).slice(2, 10), Date.now()),
          file,
          {
            access: "public",
            contentType: file.type,
            handleUploadUrl: "/api/announcements/image",
            // big ones go up in parallel pieces and retry a piece that fails,
            // rather than starting a 20MB GIF over from the top
            multipart: file.size > 5 * 1024 * 1024,
            onUploadProgress: ({ percentage }) => setPercent(Math.round(percentage)),
          },
        );
        const next = insertImageMarkdown(text, from, to, {
          url: blob.url,
          alt: altFromFilename(file.name),
        });
        if (maxLength && next.text.length > maxLength) {
          failed = "That would push the post past its character limit. Trim it first.";
          break;
        }
        text = next.text;
        // the next one lands after this one, so a dropped pair keeps its order
        from = next.cursor;
        to = next.cursor;
      } catch (err) {
        // the sdk says "failed to retrieve the client token" when our route
        // turned the upload down, which tells the author nothing. the two
        // reasons they can act on (too big, wrong type) were caught above.
        failed = /token/i.test(String(err?.message || ""))
          ? "Couldnt start that upload. Refresh the page and try again."
          : "That upload didnt go through. Try again.";
        break;
      }
    }
    setUploading(false);
    setPercent(0);
    setOfLabel("");

    // COMMIT WHATEVER LANDED, even when a later one failed. the alternative is
    // throwing away pictures that are already uploaded and already paid for.
    if (text !== value) {
      setTab("write");
      onChange(text);
      requestAnimationFrame(() => {
        const el = taRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(from, from);
      });
    }
    if (failed) setImgError(failed);
  };

  const pickImage = (e) => {
    const files = e.target.files;
    // let the same file be picked twice in a row (a retry after an error picks
    // the identical file, and change wouldn't fire without this)
    const ta = taRef.current;
    // the caret is read BEFORE the upload. clicking the button blurred the
    // textarea, but a blurred textarea keeps its selection, and by the time the
    // upload finishes the author may well have clicked somewhere else.
    const start = ta ? ta.selectionStart : value.length;
    const end = ta ? ta.selectionEnd : value.length;
    const picked = files ? Array.from(files) : [];
    e.target.value = "";
    addImages(picked, start, end);
  };

  const onDrop = (e) => {
    if (!e.dataTransfer?.files?.length) return; // a text drag, leave it alone
    e.preventDefault();
    setDragging(false);
    // WHERE THEY DROPPED IT, not where the caret happened to be. dropping a GIF
    // onto the third paragraph has to put it in the third paragraph.
    const at = caretAtPoint(taRef.current, e.clientX, e.clientY);
    addImages(e.dataTransfer.files, at, at);
  };

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-border-strong">
        <button type="button" onClick={() => setTab("write")} className={tabClass(tab === "write")}>
          Write
        </button>
        <button type="button" onClick={() => setTab("preview")} className={tabClass(tab === "preview")}>
          Preview
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="ml-auto mb-1 flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted transition hover:border-brand-light hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
            <rect x="2.5" y="3.5" width="15" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="7" cy="8" r="1.4" fill="currentColor" />
            <path d="M3.5 14l3.8-3.8a1.5 1.5 0 012.1 0l2.3 2.3m0 0l1.4-1.4a1.5 1.5 0 012.1 0l1.3 1.3m-4.8.1l2.6 2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {uploading ? `Uploading ${percent}%${ofLabel}` : "Add image / GIF"}
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={INLINE_IMAGE_ACCEPT.join(",")}
          onChange={pickImage}
          className="hidden"
        />
      </div>
      {tab === "write" ? (
        <div className="relative">
          <textarea
            id="content"
            ref={taRef}
            name="content"
            required
            rows={rows}
            maxLength={maxLength}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            // without preventDefault on BOTH of these the browser just navigates
            // away to the dropped file, which loses the whole half-written post
            onDragOver={(e) => {
              if (!e.dataTransfer?.types?.includes("Files")) return;
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`${INPUT} mt-0 resize-y overflow-hidden rounded-t-none font-mono text-sm ${
              dragging ? "border-brand ring-2 ring-brand" : ""
            }`}
          />
          {dragging && (
            <span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-brand px-2 py-1 text-xs font-semibold text-white shadow-sm">
              Drop it where you want it
            </span>
          )}
        </div>
      ) : (
        <>
          {/* keep the value submittable while previewing */}
          <input type="hidden" name="content" value={value} />
          <div
            className={`${PREVIEW_PROSE} ${PREVIEW_IMG} mt-0 rounded-t-none`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </>
      )}
      {imgError && (
        <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
          {imgError}
        </p>
      )}
    </div>
  );
}

export default function AnnouncementForm({
  action,
  mode = "create",
  isDraft = false,
  defaults = {},
  tags,
  canProxy = false,
  people = [],
  showRoles = false,
  meId,
  meName,
  ackStaffByTitle = {},
  ackEveryoneTotal = null,
  forms = [],
  // every fillable form, not just the ack-eligible ones - see MeetingFields.
  attestationForms = [],
  docs = [],
  cancelHref = "/portal/announcements",
  submitLabel = "Preview",
}) {
  const d = defaults;
  // documents already on the post: shown with a remove control, and posted back
  // as hidden fields so an edit that touches nothing else keeps them. An
  // uploaded PDF exists only here, so dropping it silently would lose the file.
  const [kept, setKept] = useState(() => attachmentsOf(d));
  const [tag, setTag] = useState(d.tag || tags[0] || "Announcement");
  // the ordinary post's optional Zoom link - controlled so the passcode box
  // can appear the moment a link is typed
  const [plainZoomLink, setPlainZoomLink] = useState(d.zoomLink || "");
  const changelog = isChangelog(tag);
  const meeting = isCompanyMeeting(tag);
  const event = isEvent(tag);
  const [requireAck, setRequireAck] = useState(!!d.requireAck);
  const [formId, setFormId] = useState(d.formId || "");
  const [content, setContent] = useState(d.content || "");

  return (
    <form action={action} className="space-y-6">
      {/* 1. Type picker (drives the rest of the form) */}
      <fieldset>
        <legend className={LABEL}>
          Type <span className="text-rose-600">*</span>
        </legend>
        <p className="mt-1 text-xs text-muted">
          Pick what this is. Changelog posts get a title and render like a
          release note.
        </p>
        <input type="hidden" name="tag" value={tag} />
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(t)}
              className={`flex items-center justify-between gap-2 rounded-md border p-2.5 text-left text-sm transition ${
                tag === t
                  ? "border-brand bg-sky-50 text-brand ring-1 ring-brand dark:bg-sky-950/40"
                  : "border-border bg-surface-2 text-foreground hover:border-brand-light"
              }`}
            >
              <span>{t}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ANNOUNCEMENT_TAG_STYLES[t] ?? ""}`}>
                {t === "Changelog" ? "IT" : ""}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {/* proxy "post as" - elevated only; on create or while still a draft */}
      {canProxy && (mode === "create" || isDraft) && (
        <div>
          <label htmlFor="postAs" className={LABEL}>
            Post as <span className="text-faint">(IT / admin)</span>
          </label>
          <select id="postAs" name="postAs" defaultValue={d.authorId || meId} className={INPUT}>
            <option value={meId}>Myself ({meName})</option>
            {people
              .filter((p) => p.id !== meId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
          </select>
          <p className="mt-1 text-xs text-muted">
            Posting on behalf of someone? Pick them here and the post is
            credited to their name. A record of who actually posted it is kept.
          </p>
        </div>
      )}

      {/* Title - shown on every type now (the layout is built around it) */}
      <div>
        <label htmlFor="title" className={LABEL}>
          Title <span className="text-rose-600">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={ANNOUNCEMENT_TITLE_MAX}
          defaultValue={d.title || ""}
          placeholder={TITLE_PLACEHOLDERS[tag] || TITLE_PLACEHOLDERS.Announcement}
          className={INPUT}
        />
      </div>

      {changelog ? (
        /* -------- Changelog body -------- */
        <div>
          <label htmlFor="content" className={LABEL}>
            Changelog <span className="text-rose-600">*</span>
          </label>
          <MarkdownField
            value={content}
            onChange={setContent}
            rows={14}
            maxLength={CHANGELOG_CONTENT_MAX}
            placeholder={
              "Intro line about this release.\n\n## 📣 What's new\n- **Big thing** - what it does\n- Another improvement\n\n## 🔧 Fixes\n- Fixed the thing that was broken"
            }
          />
          <p className="mt-1 text-xs text-muted">
            Markdown supported: <code>## Section</code> for headers (add an
            emoji), <code>- item</code> for bullets, <code>**bold**</code>, and{" "}
            <code>[links](https://...)</code>. The first lines before a header
            read as the intro. Drag a picture into the box to drop it in place,
            or use <strong className="font-medium">Add image / GIF</strong> to
            put one where your cursor is.
          </p>
        </div>
      ) : (
        /* -------- Plain announcement fields (markdown) -------- */
        <>
          <div>
            <label htmlFor="content" className={LABEL}>
              What do you want to announce? <span className="text-rose-600">*</span>
            </label>
            <MarkdownField
              value={content}
              onChange={setContent}
              rows={8}
              maxLength={ANNOUNCEMENT_CONTENT_MAX}
              placeholder={BODY_PLACEHOLDERS[tag] || BODY_PLACEHOLDERS.Announcement}
            />
            <p className="mt-1 text-xs text-muted">
              Markdown supported: <code>## Section</code>, <code>- bullets</code>,{" "}
              <code>**bold**</code>, <code>[links](https://...)</code>. Drag a
              picture straight into the box and it lands where you drop it, or
              use <strong className="font-medium">Add image / GIF</strong> to put
              one where your cursor is. JPG, PNG, WebP, or GIF up to{" "}
              {Math.round(INLINE_IMAGE_MAX_BYTES / (1024 * 1024))} MB each.
            </p>
          </div>

          {/* THE PART THAT NEVER LEAVES THE PORTAL. Britny's CPR
              re-certification, 2026-08-31: a training link and a payment code
              that have to reach the audience and must not sit in anyone's
              inbox. The email says this section exists; only the post shows
              it. */}
          <div>
            <label htmlFor="portalOnly" className={LABEL}>
              Only visible in the portal <span className="text-faint">(optional)</span>
            </label>
            <textarea
              id="portalOnly"
              name="portalOnly"
              rows={3}
              maxLength={5000}
              defaultValue={d.portalOnly || ""}
              placeholder={"A link, a code, anything that should stay behind a sign-in."}
              className={`${INPUT} resize-y font-mono text-sm`}
            />
            <p className="mt-1 text-xs text-muted">
              Shown on the post under its own heading. Never included in the
              email - the email says the portal has more.
            </p>
          </div>

          {/* AN ORDINARY POST CAN CARRY A ZOOM LINK, Mánu 2026-09-03. The
              meeting tags have their own link fields inside MeetingFields, so
              this block is exactly for everything else. The passcode box only
              appears once a link is typed - a passcode with no link is
              nothing. */}
          {!meeting && (
            <div>
              <label htmlFor="zoomLink" className={LABEL}>
                Zoom link <span className="text-faint">(optional)</span>
              </label>
              <input
                id="zoomLink"
                name="zoomLink"
                type="url"
                maxLength={500}
                value={plainZoomLink}
                onChange={(e) => setPlainZoomLink(e.target.value)}
                placeholder="https://zoom.us/j/..."
                className={INPUT}
              />
              <p className="mt-1 text-xs text-muted">
                Shown as a Join meeting button on the post and in the email.
              </p>
              {plainZoomLink.trim() && (
                <div className="mt-3">
                  <label htmlFor="zoomCode" className={LABEL}>
                    Passcode <span className="text-faint">(optional)</span>
                  </label>
                  <input
                    id="zoomCode"
                    name="zoomCode"
                    type="text"
                    maxLength={60}
                    defaultValue={d.zoomCode || ""}
                    className={`${INPUT} font-mono`}
                  />
                </div>
              )}
            </div>
          )}

          {meeting && (
            <MeetingFields
              defaults={d}
              showTimeNotify={mode === "edit" && !isDraft}
              attestationForms={attestationForms}
            />
          )}

          {event && <EventFields defaults={d} />}

          {meeting && (
            <div className="rounded-md border border-border bg-surface-2 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Who&apos;s invited?
              </p>
              <AudiencePicker
                everyoneName="ackEveryone"
                titlesName="ackTitles"
                userIdsName="ackUserIds"
                staffByTitle={ackStaffByTitle}
                everyoneTotal={ackEveryoneTotal}
                defaultEveryone={d.ackEveryone === true}
                defaultTitles={Array.isArray(d.ackTitles) ? d.ackTitles : []}
                defaultUserIds={Array.isArray(d.ackUserIds) ? d.ackUserIds : []}
                showAllRoles
              />
            </div>
          )}

          {/* DOCUMENTS THAT RIDE ALONG WITH THE POST. Two sources on purpose:
              something already in the forms library is stored once and stays
              browsable there, while an upload lets HR attach a one-off without
              waiting on a deploy - the gap that stopped the workers' comp
              training going out on 2026-08-10. */}
          <div>
            <span className={LABEL}>
              Attached documents <span className="text-faint">(optional)</span>
            </span>

            {kept.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {kept.map((a) => (
                  <li
                    key={a.url}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2"
                  >
                    <span className="min-w-0 text-sm text-foreground">
                      <span className="truncate">{a.name}</span>
                      <span className="ml-2 text-xs text-muted">
                        {a.formId ? "from the forms library" : "uploaded to this post"}
                      </span>
                    </span>
                    <input type="hidden" name="keepAttachments" value={JSON.stringify(a)} />
                    <button
                      type="button"
                      onClick={() => setKept((k) => k.filter((x) => x.url !== a.url))}
                      className="shrink-0 text-xs font-medium text-rose-600 hover:underline dark:text-rose-400"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {docs.length > 0 && (
              <details className="mt-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  Attach from the forms library
                </summary>
                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                  {docs
                    .filter((f) => !kept.some((k) => k.formId === f.id))
                    .map((f) => (
                      <label key={f.id} className="flex items-start gap-2 text-sm text-muted">
                        <input
                          type="checkbox"
                          name="attachFormIds"
                          value={f.id}
                          className="mt-0.5 h-4 w-4 accent-brand"
                        />
                        <span>
                          {f.title}
                          <span className="ml-2 text-xs text-faint">
                            {f.category}{f.fillable ? " · fillable" : ""}
                          </span>
                        </span>
                      </label>
                    ))}
                </div>
              </details>
            )}

            <input
              id="attachments"
              name="attachments"
              type="file"
              multiple
              accept={ATTACH_ACCEPT.join(",")}
              className="mt-2 block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-brand-light file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-brand"
            />
            <p className="mt-1 text-xs text-muted">
              PDF only, up to {Math.round(ATTACH_MAX_BYTES / (1024 * 1024))} MB each and{" "}
              {ATTACH_MAX_COUNT} in total. Staff get them in the email and on the post.
            </p>
          </div>

          {mode === "create" && (
            <div>
              <label htmlFor="image" className={LABEL}>
                Image / flyer <span className="text-faint">(optional)</span>
              </label>
              <input
                id="image"
                name="image"
                type="file"
                accept={IMAGE_ACCEPT.join(",")}
                className="mt-1 block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-brand-light file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-brand"
              />
              <p className="mt-1 text-xs text-muted">
                JPG, PNG, WebP, or GIF. Up to {Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB.
              </p>
            </div>
          )}
        </>
      )}

      {/* acknowledgment - non-meeting types only. a meeting uses its RSVP response
          as the record, so there's no separate acknowledgment step for meetings. */}
      {!meeting && (
        <div className="rounded-md border border-border bg-surface-2 p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="requireAck"
              checked={requireAck}
              onChange={(e) => setRequireAck(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand"
            />
            <span>
              <span className="block text-sm font-medium text-foreground">
                Require staff to acknowledge they&apos;ve read this
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                Adds an &quot;Acknowledge that I&apos;ve read this&quot; box and a
                who-has / who-hasn&apos;t roster. You can also email it for one-click
                acknowledgment.
              </span>
            </span>
          </label>

          {requireAck && (
            <div className="mt-3 space-y-4 border-t border-border pt-3">
              <div>
                <label htmlFor="expiresAt" className={LABEL}>
                  Acknowledge by <span className="text-faint">(optional)</span>
                </label>
                <DatePicker
                  id="expiresAt"
                  name="expiresAt"
                  defaultValue={d.expiresAt ? new Date(d.expiresAt).toISOString().split("T")[0] : ""}
                  inputClassName={`${INPUT} pr-10`}
                />
                <p className="mt-1 text-xs text-muted">
                  The date staff should acknowledge by. Anyone who hasn&apos;t by
                  then gets a reminder.
                </p>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  Who needs to acknowledge?
                </p>
                <AudiencePicker
                  everyoneName="ackEveryone"
                  titlesName="ackTitles"
                  userIdsName="ackUserIds"
                  staffByTitle={ackStaffByTitle}
                  everyoneTotal={ackEveryoneTotal}
                  defaultEveryone={d.ackEveryone === true}
                  defaultTitles={Array.isArray(d.ackTitles) ? d.ackTitles : []}
                  defaultUserIds={Array.isArray(d.ackUserIds) ? d.ackUserIds : []}
                  showAllRoles
                />
              </div>

              {forms.length > 0 && (
                <div>
                  <label htmlFor="formId" className={LABEL}>
                    Attach a form <span className="text-faint">(optional)</span>
                  </label>
                  <select
                    id="formId"
                    name="formId"
                    value={formId}
                    onChange={(e) => setFormId(e.target.value)}
                    className={INPUT}
                  >
                    <option value="">None - just the checkbox</option>
                    {forms.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.title}
                      </option>
                    ))}
                  </select>
                  {/* OPENED AND SIGNED ARE TWO STATES, and the person choosing
                      the form has to know that before they choose it. */}
                  <p className="mt-1 text-xs text-muted">
                    When set, acknowledging only records that they opened it -
                    submitting the form is what finishes it. The roster tracks
                    both.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {mode === "create" && (
        <p className="rounded-md border border-border bg-surface-2 p-4 text-xs text-muted">
          You&apos;ll choose who gets emailed when you publish - the next screen
          previews the post first, then lets you publish and send.
        </p>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
        <Link href={cancelHref} className="text-sm font-medium text-muted transition hover:text-foreground">
          Cancel
        </Link>
        <button
          type="submit"
          className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
