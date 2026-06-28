"use client";

// shared add/edit form for an announcement. the "type" (tag) is picked first,
// at the top, and the rest of the form adapts to it - mirrors the resource form
// pattern. the Changelog type (IT/Super only) swaps in a title + markdown body
// that renders Discord-style; every other type is a plain post.
import { useState, useMemo } from "react";
import Link from "next/link";
import { marked } from "marked";
import {
  ANNOUNCEMENT_TAG_STYLES,
  ANNOUNCEMENT_TITLE_MAX,
  CHANGELOG_CONTENT_MAX,
  isChangelog,
  isCompanyMeeting,
} from "@/lib/announcements";
import { POST_CONTENT_MAX, IMAGE_MAX_BYTES, IMAGE_ACCEPT } from "@/lib/hub";
import AudiencePicker from "./AudiencePicker";
import MeetingFields from "./MeetingFields";

const INPUT =
  "mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const LABEL = "block text-sm font-medium text-muted";

const PREVIEW_PROSE =
  "min-h-[8rem] max-h-[28rem] overflow-y-auto rounded-md border border-border-strong bg-surface px-3 py-2 text-[15px] leading-relaxed text-foreground [&_h1]:mt-4 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_a]:text-brand [&_a]:underline [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_em]:italic [&_hr]:my-4 [&_hr]:border-border";

// markdown textarea with a GitHub-style Write / Preview toggle so authors can
// see how their post renders before publishing. controlled so preview is live.
function MarkdownField({ value, onChange, rows, maxLength, placeholder }) {
  const [tab, setTab] = useState("write");
  const html = useMemo(
    () => marked.parse(value || "_Nothing to preview yet._", { breaks: true }),
    [value],
  );
  const tabClass = (active) =>
    `rounded-t-md px-3 py-1.5 text-sm font-medium transition ${
      active
        ? "border border-b-0 border-border-strong bg-surface text-foreground"
        : "text-muted hover:text-foreground"
    }`;
  return (
    <div>
      <div className="flex gap-1 border-b border-border-strong">
        <button type="button" onClick={() => setTab("write")} className={tabClass(tab === "write")}>
          Write
        </button>
        <button type="button" onClick={() => setTab("preview")} className={tabClass(tab === "preview")}>
          Preview
        </button>
      </div>
      {tab === "write" ? (
        <textarea
          id="content"
          name="content"
          required
          rows={rows}
          maxLength={maxLength}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`${INPUT} mt-0 rounded-t-none font-mono text-sm`}
        />
      ) : (
        <>
          {/* keep the value submittable while previewing */}
          <input type="hidden" name="content" value={value} />
          <div
            className={`${PREVIEW_PROSE} mt-0 rounded-t-none`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </>
      )}
    </div>
  );
}

export default function AnnouncementForm({
  action,
  mode = "create",
  defaults = {},
  tags,
  canProxy = false,
  people = [],
  showRoles = false,
  meId,
  meName,
  staffByTitle = {},
  cancelHref = "/portal/announcements",
  submitLabel = "Post",
}) {
  const d = defaults;
  const [tag, setTag] = useState(d.tag || tags[0] || "Announcement");
  const changelog = isChangelog(tag);
  const meeting = isCompanyMeeting(tag);
  const [requireAck, setRequireAck] = useState(!!d.requireAck);
  const [sendEmail, setSendEmail] = useState(false);
  const [content, setContent] = useState(d.content || "");
  const onContent = (e) => setContent(e.target.value);

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

      {/* proxy "post as" - elevated only, create only */}
      {canProxy && mode === "create" && (
        <div>
          <label htmlFor="postAs" className={LABEL}>
            Post as <span className="text-faint">(IT / admin)</span>
          </label>
          <select id="postAs" name="postAs" defaultValue={meId} className={INPUT}>
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
          placeholder={
            changelog ? "e.g. Portal Update: June 27, 2026" : "e.g. New meal break waiver"
          }
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
            onChange={onContent}
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
            read as the intro.
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
              onChange={onContent}
              rows={8}
              maxLength={POST_CONTENT_MAX}
              placeholder={
                "Write your announcement. Markdown works:\n\n## What you need to do\n- **Step one**\n- Step two\n\n[Link](https://...)"
              }
            />
            <p className="mt-1 text-xs text-muted">
              Markdown supported: <code>## Section</code>, <code>- bullets</code>,{" "}
              <code>**bold**</code>, <code>[links](https://...)</code>. Up to{" "}
              {POST_CONTENT_MAX} characters.
            </p>
          </div>

          {meeting && <MeetingFields defaults={d} />}

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

          <div>
            <label htmlFor="expiresAt" className={LABEL}>
              Due date <span className="text-faint">(optional)</span>
            </label>
            <input
              id="expiresAt"
              name="expiresAt"
              type="date"
              defaultValue={d.expiresAt ? new Date(d.expiresAt).toISOString().split("T")[0] : ""}
              className={INPUT}
            />
            <p className="mt-1 text-xs text-muted">
              Got a deadline? It stays visible but gets a &quot;Past due&quot;
              badge after this date.
            </p>
          </div>
        </>
      )}

      {/* acknowledgment opt-in - works for any type */}
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
              Adds an &quot;I read this&quot; box and a who-has/hasn&apos;t
              roster. You can also email it for one-click acknowledgment.
            </span>
          </span>
        </label>

        {(requireAck || meeting) && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              {meeting ? "Who's invited?" : "Who needs to acknowledge?"}
            </p>
            <AudiencePicker
              everyoneName="ackEveryone"
              titlesName="ackTitles"
              userIdsName="ackUserIds"
              staffByTitle={staffByTitle}
              defaultEveryone={d.ackEveryone !== false}
              defaultTitles={Array.isArray(d.ackTitles) ? d.ackTitles : []}
              defaultUserIds={Array.isArray(d.ackUserIds) ? d.ackUserIds : []}
            />
          </div>
        )}

        {mode === "create" && (
          <label className="mt-3 flex items-start gap-3 border-t border-border pt-3">
            <input
              type="checkbox"
              name="sendEmail"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand"
            />
            <span>
              <span className="block text-sm font-medium text-foreground">
                Also send as an email now
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                Emails this announcement (from announcements@mylifeservicesinc.com)
                when you post it.
              </span>
            </span>
          </label>
        )}

        {mode === "create" && sendEmail && (
          <div className="mt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Who gets the email?
            </p>
            <AudiencePicker
              everyoneName="emailEveryone"
              titlesName="emailTitles"
              userIdsName="emailUserIds"
              staffByTitle={staffByTitle}
              defaultEveryone
              defaultTitles={[]}
              defaultUserIds={[]}
            />
          </div>
        )}
      </div>

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
