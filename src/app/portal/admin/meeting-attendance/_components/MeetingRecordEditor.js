"use client";

// WHAT A MEETING WAS ABOUT, EDITED WHERE THE MEETING IS READ.
//
// Mánu 2026-09-14: "there should be an option to add in the topics and add in
// pdfs". A record typed up from an old email gets entered before anybody has
// dug out what was covered or which deck was shown, so it has to be possible
// to come back to it - and the attendance page is where somebody already is
// when they think of it.
//
// It posts only the topics, the documents, and on a record its title and
// source. Nothing else. An edit form that does not post a field back is an
// edit form that clears it, so the safest form is the one that never sees the
// fields it has no business in.
import { useState } from "react";
import { FileText, Pencil, Plus, X } from "lucide-react";
import { ATTACH_ACCEPT, ATTACH_MAX_BYTES, ATTACH_MAX_COUNT } from "@/lib/announcements";
import { updateMeetingRecord } from "../past-meeting-actions";

const INPUT =
  "mt-1 w-full rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const LABEL = "block text-xs font-semibold text-foreground";

// ONE DOCUMENTS BLOCK, used for a series and for the meeting.
//
// `fieldKey` is the series it belongs to, and it appends itself to all three
// field names so one form can carry several independent lists. No key is the
// meeting-wide block every series without its own falls back to.
//
// AND IT SAYS IT WAS DRAWN. A file input posts even when empty, so the action
// cannot tell "this series has no documents" from "this series was never on the
// page" - and the second one would wipe what it has. The hidden field is how
// the form tells it which is which.
function DocumentsBlock({ fieldKey = "", kept, setKept, docs, emptyNote = "" }) {
  // NOT `f`: the library picker below maps over `(f) => ...` and would shadow
  // it, so `name={fieldName("attachFormIds")}` would call the form row instead.
  const fieldName = (n) => (fieldKey ? `${n}:${fieldKey}` : n);
  return (
    <>
      {fieldKey && <input type="hidden" name="docsFor" value={fieldKey} />}
        {/* WHAT IS ALREADY ON IT. Each one posts itself back as a hidden
            field, because resolveAttachments builds the whole list from
            what it is given - anything not posted is removed, which is
            what makes Remove work and what would silently drop the lot if
            these were left out. */}
        {kept.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {kept.map((a) => (
              <li
                key={a.url}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                  <FileText size={14} aria-hidden="true" className="shrink-0 text-faint" />
                  <span className="truncate">{a.name}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {a.formId ? "from the forms library" : "uploaded here"}
                  </span>
                </span>
                <input type="hidden" name={fieldName("keepAttachments")} value={JSON.stringify(a)} />
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
        ) : emptyNote ? (
          <p className="mt-2 text-xs text-faint">{emptyNote}</p>
        ) : null}

        {docs.length > 0 && (
          <details className="mt-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              <Plus size={13} aria-hidden="true" className="mr-1 inline" />
              Attach from the forms library
            </summary>
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {docs
                .filter((f) => !kept.some((k) => k.formId === f.id))
                .map((f) => (
                  <label key={f.id} className="flex items-start gap-2 text-sm text-muted">
                    <input
                      type="checkbox"
                      name={fieldName("attachFormIds")}
                      value={f.id}
                      className="mt-0.5 h-4 w-4 accent-brand"
                    />
                    <span>
                      {f.title}
                      {f.category && (
                        <span className="ml-2 text-xs text-faint">{f.category}</span>
                      )}
                    </span>
                  </label>
                ))}
            </div>
          </details>
        )}

        <input
          name={fieldName("attachments")}
          type="file"
          multiple
          accept={ATTACH_ACCEPT.join(",")}
          className="mt-2 block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-brand-light file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-brand"
        />
        <p className="mt-1 text-xs text-muted">
          PDF only, up to {Math.round(ATTACH_MAX_BYTES / (1024 * 1024))} MB each
          and {ATTACH_MAX_COUNT} in total. They are carried inside the
          attendance report, not just linked from it.
        </p>
    </>
  );
}

export default function MeetingRecordEditor({
  postId,
  title,
  topics = [],
  // [{ key, label, dateLabel, topics }] - one per SERIES, because a series is
  // one training offered twice and both dates covered the same ground. Empty on
  // a single-date record, which keeps using the meeting's own list.
  sessions = [],
  attachments = [],
  recordSource = "",
  backfilled = false,
  docs = [],
}) {
  const [open, setOpen] = useState(false);
  const [kept, setKept] = useState(attachments);
  // one list per series, keyed the way the fields are. Seeded from what each
  // series actually carries rather than from the fallback, or saving would
  // write the meeting's documents onto every series that was only inheriting.
  const [seriesDocs, setSeriesDocs] = useState(() =>
    Object.fromEntries(sessions.map((x) => [x.docsKey, x.attachments || []])));
  const setDocsFor = (k) => (fn) =>
    setSeriesDocs((m) => ({ ...m, [k]: fn(m[k] || []) }));

  const perSession = sessions.length > 1;
  const anyTopics = perSession ? sessions.some((x) => (x.topics || []).length) : topics.length;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
      >
        <Pencil size={14} aria-hidden="true" />
        {anyTopics || attachments.length ? "Edit topics & documents" : "Add topics & documents"}
      </button>
    );
  }

  return (
    <div className="mt-4 w-full rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex items-start gap-4 border-b border-border p-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold tracking-tight text-foreground">
            Topics and documents
          </h2>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">
            What was covered and what it was run from. Both print on the
            attendance report, and the documents are carried inside it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="rounded-md p-1 text-muted transition hover:bg-surface-2 hover:text-foreground"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <form action={updateMeetingRecord.bind(null, postId)}>
        <div className="space-y-5 p-5">
          {/* A LIVE MEETING'S TITLE IS NOT EDITABLE HERE. It belongs to the post
              staff were invited to, and renaming it from a roster screen would
              rename what they were sent. A record has no such audience. */}
          {backfilled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="mr-title" className={LABEL}>
                  What it was called
                </label>
                <input
                  id="mr-title"
                  name="title"
                  type="text"
                  defaultValue={title || ""}
                  maxLength={200}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="mr-source" className={LABEL}>
                  Where the attendance was kept{" "}
                  <span className="font-normal text-faint">(optional)</span>
                </label>
                <input
                  id="mr-source"
                  name="meetingRecordSource"
                  type="text"
                  defaultValue={recordSource || ""}
                  maxLength={120}
                  placeholder="Google Doc, sign-in sheet"
                  className={INPUT}
                />
              </div>
            </div>
          )}

          {/* ONE BOX PER DATE once a meeting has more than one. The sessions of
              a series do not cover the same ground - July 9 was Special Incident
              Reports and workers' compensation while the rest of that series was
              not - and one list on the meeting cannot say which belonged to
              which. */}
          {perSession ? (
            <div>
              <span className={LABEL}>
                Topics covered <span className="font-normal text-faint">(one per series)</span>
              </span>
              <div className="mt-2 space-y-3">
                {sessions.map((x) => (
                  <div key={x.key} className="rounded-xl border border-border bg-surface-2 p-3">
                    <label htmlFor={`mr-t-${x.key}`} className="block text-[13px] font-semibold text-foreground">
                      {x.label}
                      <span className="ml-2 font-normal text-muted">{x.dateLabel}</span>
                    </label>
                    <textarea
                      id={`mr-t-${x.key}`}
                      name={x.key}
                      rows={3}
                      defaultValue={(x.topics || []).join("\n")}
                      placeholder="What this series covered, one per line"
                      className="mt-1.5 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                    />

                    {/* A HAIRLINE RATHER THAN A SECOND CARD. The series is
                        already a card, and a box inside it would be the
                        card-in-card the gate warns off - spacing and a rule do
                        the grouping instead. */}
                    <div className="mt-3.5 border-t border-sep pt-3">
                      <span className="block text-xs font-semibold text-muted">
                        Documents for this series
                      </span>
                      <DocumentsBlock
                        fieldKey={x.docsKey}
                        kept={seriesDocs[x.docsKey] || []}
                        setKept={setDocsFor(x.docsKey)}
                        docs={docs}
                        emptyNote="None yet. This series prints the meeting's documents below."
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted">
                One topic per line. Every date in a series prints the same list
                under what was covered on the attendance report.
              </p>
            </div>
          ) : (
            <div>
              <label htmlFor="mr-topics" className={LABEL}>
                Topics covered <span className="font-normal text-faint">(optional)</span>
              </label>
              <textarea
                id="mr-topics"
                name="meetingTopics"
                rows={5}
                defaultValue={topics.join("\n")}
                placeholder={"Call-outs and missed sessions\nDocumenting a visit in QSP"}
                className={INPUT}
              />
              <p className="mt-1 text-xs text-muted">
                One topic per line. They print on the attendance report under what
                was covered.
              </p>
            </div>
          )}

          <div>
            <span className={LABEL}>
              Documents for the whole meeting{" "}
              <span className="font-normal text-faint">(optional)</span>
            </span>
            <p className="mt-1 text-xs text-muted">
              Used by any series that has none of its own.
            </p>
            <DocumentsBlock kept={kept} setKept={setKept} docs={docs} />
            <p className="mt-1 text-xs text-muted">
              PDF only, up to {Math.round(ATTACH_MAX_BYTES / (1024 * 1024))} MB each
              and {ATTACH_MAX_COUNT} in total. They are carried inside the
              attendance report, not just linked from it.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface-2 px-5 py-3.5">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted transition hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
