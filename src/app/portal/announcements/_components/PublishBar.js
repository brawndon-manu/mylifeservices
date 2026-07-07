"use client";

// the preview banner + publish confirm dialog shown to the author on a DRAFT.
// the post itself renders below exactly as staff will see it; this bar sits on
// top with a "Publish" action that opens a confirm modal (recipient count +
// list + meeting reminder note), then submits the publish server action.
import { useState } from "react";
import Link from "next/link";
import AudiencePicker from "./AudiencePicker";

export default function PublishBar({ postId, publish, discard, info }) {
  const [open, setOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [doEmail, setDoEmail] = useState(false);
  const willEmail = info.hasAudience || info.allActiveCount > 0;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/45 bg-amber-400/10 p-3.5">
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-amber-950">
          i
        </span>
        <div className="flex-1 text-sm text-foreground">
          <span className="font-semibold">Preview - not published yet.</span>{" "}
          <span className="text-muted">
            This is how it will look when posted. Review, then publish.
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDiscardOpen(true)}
          className="rounded-lg border border-rose-400/50 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
        >
          Discard
        </button>
        <Link
          href={`/portal/announcements/${postId}/edit`}
          className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-foreground transition hover:border-brand hover:text-brand"
        >
          Back to editing
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-brand-light px-4 py-2 text-sm font-bold text-white transition hover:bg-brand"
        >
          Publish
        </button>
      </div>

      {discardOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setDiscardOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border-strong bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-foreground">Discard this draft?</h3>
            <p className="mt-1 text-sm text-muted">
              The draft will be deleted and nothing will be saved. This can&apos;t be
              undone.
            </p>
            <form action={discard.bind(null, postId)} className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDiscardOpen(false)}
                className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-muted transition hover:text-foreground"
              >
                Keep editing
              </button>
              <button
                type="submit"
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-700"
              >
                Discard draft
              </button>
            </form>
          </div>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border-strong bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-foreground">
              Publish this announcement?
            </h3>
            <p className="mt-1 text-sm text-muted">
              It goes live in the feed right away
              {willEmail ? ", and an email goes out immediately after." : "."}
            </p>

            <form action={publish.bind(null, postId)} className="mt-4">
              {info.hasAudience ? (
                <>
                  <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-3">
                    <input
                      type="checkbox"
                      name="doEmail"
                      defaultChecked
                      className="mt-0.5 h-4 w-4 accent-brand"
                    />
                    <span className="text-sm text-foreground">
                      Email{" "}
                      <span className="font-semibold text-brand-light">
                        {info.count} {info.count === 1 ? "person" : "people"}
                      </span>{" "}
                      {info.meeting ? "invited" : "expected to acknowledge"} right
                      after publishing.
                    </span>
                  </label>
                  {info.recipients.length > 0 && (
                    <details className="mt-2 rounded-lg border border-border">
                      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand-light">
                        See who gets the email ({info.count})
                      </summary>
                      <div className="max-h-52 overflow-y-auto border-t border-border">
                        {info.recipients.slice(0, 60).map((r) => (
                          <div
                            key={r.id}
                            className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-sm last:border-b-0"
                          >
                            <span className="text-foreground">{r.name}</span>
                            {r.title && (
                              <span className="ml-auto text-xs text-muted">{r.title}</span>
                            )}
                          </div>
                        ))}
                        {info.count > 60 && (
                          <div className="px-3 py-1.5 text-center text-xs text-muted">
                            …and {info.count - 60} more
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </>
              ) : (
                <>
                  <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-3">
                    <input
                      type="checkbox"
                      name="doEmail"
                      checked={doEmail}
                      onChange={(e) => setDoEmail(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-brand"
                    />
                    <span className="text-sm text-foreground">
                      Also email people now{" "}
                      <span className="text-xs text-muted">
                        (leave off to just post it to the feed)
                      </span>
                    </span>
                  </label>
                  {doEmail && (
                    <div className="mt-2">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                        Send to
                      </p>
                      <AudiencePicker
                        everyoneName="emailEveryone"
                        titlesName="emailTitles"
                        userIdsName="emailUserIds"
                        staffByTitle={info.staffByTitle || {}}
                        everyoneTotal={info.everyoneTotal}
                        defaultEveryone
                      />
                    </div>
                  )}
                </>
              )}

              {info.meeting && (
                <div className="mt-3 flex gap-2 rounded-lg border border-brand/30 bg-brand/10 p-3 text-[13px] leading-relaxed text-foreground">
                  <span className="flex-none">🔔</span>
                  <span>
                    Because this is a meeting, everyone invited also gets a reminder{" "}
                    {info.nightBefore && (
                      <>
                        <span className="font-semibold">the night before (8pm)</span> and{" "}
                      </>
                    )}
                    <span className="font-semibold">{info.reminderLeadMin} minutes before</span>{" "}
                    each session - automatically.
                  </span>
                </div>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-muted transition hover:text-foreground"
                >
                  Keep as draft
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-brand-light px-4 py-2 text-sm font-bold text-white transition hover:bg-brand"
                >
                  Publish now
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
