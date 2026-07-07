"use client";

// admin editor for a meeting's Zoom link(s). asks first whether the link +
// passcode are the same for every session; if not, opens a per-session editor
// (grouped by series) so each date can carry its own room. saves to the meeting
// default + the per-session meetingOptions, which the reminders already read.
import { useState } from "react";

const INPUT =
  "block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export default function ZoomLinksDialog({
  postId,
  defaultLink,
  defaultCode,
  sessions = [],
  action,
}) {
  const hasSessions = sessions.length > 0;
  const anyPerSession = sessions.some((s) => s.zoomLink || s.zoomCode);
  const [open, setOpen] = useState(false);
  const [same, setSame] = useState(!anyPerSession);

  // group sessions by series (falls back to one flat group for a plain multi list)
  const groups = [];
  for (const s of sessions) {
    const key = s.seriesId || "_flat";
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label: s.seriesLabel || null, sessions: [] };
      groups.push(g);
    }
    g.sessions.push(s);
  }

  const label = defaultLink ? "Edit Zoom link" + (hasSessions ? "s" : "") : "Add the Zoom link" + (hasSessions ? "s" : "");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-brand hover:text-brand"
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border-strong bg-surface p-5 shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-foreground">Zoom links</h3>

            <form action={action.bind(null, postId)} className="mt-4 space-y-4">
              {hasSessions && (
                <label className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 p-3">
                  <input
                    type="checkbox"
                    name="sameForAll"
                    checked={same}
                    onChange={(e) => setSame(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-brand"
                  />
                  <span className="text-sm text-foreground">
                    Same Zoom link + passcode for every session
                    <span className="mt-0.5 block text-xs text-muted">
                      uncheck if each date has its own room
                    </span>
                  </span>
                </label>
              )}

              {/* the default (or single) link + passcode */}
              <div className="space-y-2">
                {hasSessions && !same && (
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Default (used where a session has none)
                  </p>
                )}
                <input
                  name="zoomLink"
                  type="url"
                  defaultValue={defaultLink || ""}
                  placeholder="https://zoom.us/j/..."
                  className={INPUT}
                />
                <input
                  name="zoomCode"
                  type="text"
                  defaultValue={defaultCode || ""}
                  placeholder="Passcode (optional)"
                  className={INPUT}
                />
              </div>

              {/* per-session editor, grouped by series */}
              {hasSessions && !same && (
                <div className="space-y-3">
                  {groups.map((g) => (
                    <div key={g.key} className="rounded-lg border border-border p-3">
                      {g.label && (
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                          {g.label}
                        </p>
                      )}
                      <div className="space-y-3">
                        {g.sessions.map((s) => (
                          <div key={s.id}>
                            <p className="mb-1 text-sm font-medium text-foreground">{s.label}</p>
                            <div className="space-y-1.5">
                              <input
                                name={`optZoomLink_${s.id}`}
                                type="url"
                                defaultValue={s.zoomLink || ""}
                                placeholder="Link (blank = default)"
                                className={INPUT}
                              />
                              <input
                                name={`optZoomCode_${s.id}`}
                                type="text"
                                defaultValue={s.zoomCode || ""}
                                placeholder="Passcode (blank = default)"
                                className={INPUT}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-muted transition hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-brand-light px-4 py-2 text-sm font-bold text-white transition hover:bg-brand"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
