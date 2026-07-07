"use client";

// the attendee's response controls for a Company Meeting. for multi-session
// meetings you pick session(s), see them highlight instantly, then hit Confirm;
// once confirmed it shows a summary (with the join link) + a Change button to
// re-pick. single-session meetings get an "I'll be there" / "can't make it"
// version of the same confirmed/change pattern.
import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import MeetingTime from "./MeetingTime";
import CopyButton from "./CopyButton";
import { formatDuration } from "@/lib/meeting-time";

// submit button that shows a pending state while the action runs, so a slow db
// round-trip doesn't feel dead + can't be double-submitted.
function SubmitButton({ children, className, disabled, onClick, pendingLabel = "Saving…" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      onClick={onClick}
      className={className}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

function Check({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10l4 4 8-9" />
    </svg>
  );
}
function VideoIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3" />
    </svg>
  );
}

// the join link + passcode for a session (its own, or the meeting default).
function JoinRow({ link, code }) {
  if (!link) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md bg-brand-light px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand"
      >
        <VideoIcon className="h-3.5 w-3.5" /> Join meeting
      </a>
      <CopyButton
        text={link}
        label="Copy link"
        className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-muted transition hover:text-foreground"
      />
      {code && (
        <span className="flex items-center gap-1.5">
          <span className="text-xs text-muted">Passcode</span>
          <span className="rounded bg-surface-2 px-2 py-0.5 font-mono text-xs tracking-widest text-foreground">
            {code}
          </span>
        </span>
      )}
    </div>
  );
}

export default function MeetingResponse({
  postId,
  options = [],
  multiPick = false,
  online = false,
  isAdmin = false,
  defaultLink = null,
  defaultCode = null,
  myPicks = [],
  myResponse = null,
  setChoices,
  attend,
  cantMake,
}) {
  const hasSessions = options.length > 0;
  const cantMakeIt = !!myResponse?.cantMakeIt;
  // a "cant:<seriesId>" pick = can't attend that series. real picks = actual dates.
  const isCantPick = (id) => String(id).startsWith("cant:");
  const myRealPicks = myPicks.filter((id) => !isCantPick(id));
  const goingPicks = hasSessions ? myRealPicks : myResponse && !cantMakeIt ? ["_single"] : [];
  const isGoing = goingPicks.length > 0 && !cantMakeIt;

  // series mode: options grouped by seriesId; the attendee picks one per series.
  const isSeries = options.some((o) => o.seriesId);
  const seriesGroups = [];
  if (isSeries) {
    for (const o of options) {
      let g = seriesGroups.find((x) => x.id === o.seriesId);
      if (!g) {
        g = { id: o.seriesId, label: o.seriesLabel || "Series", options: [] };
        seriesGroups.push(g);
      }
      g.options.push(o);
    }
  }

  const [selected, setSelected] = useState(new Set(myPicks));
  // start in edit mode only when there's no response yet.
  const [editing, setEditing] = useState(!isGoing && !cantMakeIt);
  const [reason, setReason] = useState(myResponse?.reason || "");
  // optimistic single-session "I'll be there" so the bubble reacts instantly
  // instead of waiting on the server round-trip + redirect.
  const [isPending, startTransition] = useTransition();
  const [optGoing, setOptGoing] = useState(isGoing);
  const goingNow = isPending ? optGoing : isGoing;
  // single-session "I can't make it" fills its bubble the moment it's clicked
  // (client state), before the reason is submitted.
  const [cantSelected, setCantSelected] = useState(cantMakeIt);

  const linkFor = (opt) => opt?.zoomLink || defaultLink;
  const codeFor = (opt) => opt?.zoomCode || defaultCode;

  const cantId = (sid) => `cant:${sid}`;
  const seriesOf = (id) =>
    isCantPick(id) ? id.slice(5) : options.find((o) => o.id === id)?.seriesId;

  // each series holds ONE value - a date optionId or its cant:<seriesId>. picking
  // replaces any other selection in that series (so you can attend some series and
  // mark others can't-attend).
  const pickInSeries = (seriesId, value) => {
    setSelected((prev) => {
      const next = new Set();
      for (const id of prev) if (seriesOf(id) !== seriesId) next.add(id);
      next.add(value);
      return next;
    });
  };

  const toggle = (id) => {
    setSelected((prev) => {
      if (multiPick) {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      }
      return new Set([id]);
    });
  };

  // the chosen value within a series (date id, cant: id, or null).
  const seriesValue = (g) =>
    g.options.find((o) => selected.has(o.id))?.id ||
    (selected.has(cantId(g.id)) ? cantId(g.id) : null);

  // toggle "can't attend" for a series from the consolidated dropdown.
  const toggleCant = (seriesId) => {
    setSelected((prev) => {
      const cid = cantId(seriesId);
      const had = prev.has(cid);
      const next = new Set();
      for (const id of prev) if (seriesOf(id) !== seriesId) next.add(id);
      if (!had) next.add(cid);
      return next;
    });
  };
  const anyCant = isSeries && seriesGroups.some((g) => selected.has(cantId(g.id)));

  // a series is "decided" once a date OR can't-attend is chosen for it.
  const seriesPicked = isSeries ? seriesGroups.filter((g) => seriesValue(g)).length : 0;
  const allSeriesPicked = isSeries && seriesPicked === seriesGroups.length;
  const confirmDisabled = isSeries ? !allSeriesPicked : selected.size === 0;
  // the "can't make any of these" bubble shows filled only while it's actually the
  // active choice - the moment you pick a session/series option it clears.
  const cantActive = cantMakeIt && selected.size === 0;

  // one selectable option button (radio for single/series, checkbox for multi).
  // `onPick` overrides the default toggle (series rows pick within their series).
  const optBtn = (opt, onPick) => {
    const on = selected.has(opt.id);
    const square = multiPick && !isSeries;
    return (
      <button
        key={opt.id}
        type="button"
        onClick={onPick || (() => toggle(opt.id))}
        className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
          on ? "border-brand bg-sky-50 dark:bg-sky-950/30" : "border-border hover:border-brand-light"
        }`}
      >
        <span
          className={`flex h-5 w-5 flex-none items-center justify-center border-2 ${
            square ? "rounded" : "rounded-full"
          } ${on ? "border-brand bg-brand text-white" : "border-border-strong"}`}
        >
          {on && <Check className="h-3 w-3" />}
        </span>
        <span className="flex-1">
          <span className="block text-sm font-medium text-foreground">{opt.label}</span>
          {(opt.at || formatDuration(opt.durationFromMin, opt.durationToMin)) && (
            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
              {opt.at && <MeetingTime iso={opt.at} setTz={opt.tz} />}
              {formatDuration(opt.durationFromMin, opt.durationToMin) && (
                <span>{opt.at ? "· " : ""}{formatDuration(opt.durationFromMin, opt.durationToMin)}</span>
              )}
            </span>
          )}
        </span>
      </button>
    );
  };

  // ---- confirmed summary (going) ----
  if (isGoing && !editing) {
    const picked = options.filter((o) => myPicks.includes(o.id));
    return (
      <div className="mt-5">
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          {/* single session is one short line, so center the row; multi/series
              content is tall, keep the check pinned to the top there */}
          <div className={`flex gap-3 ${hasSessions ? "items-start" : "items-center"}`}>
            <span
              className={`flex h-6 w-6 flex-none items-center justify-center rounded-full bg-emerald-500 text-white ${
                hasSessions ? "mt-0.5" : ""
              }`}
            >
              <Check className="h-3.5 w-3.5" />
            </span>
            <div className="flex-1">
              {!hasSessions ? (
                <>
                  <p className="text-sm font-semibold text-foreground">
                    You&apos;re attending
                  </p>
                  {online &&
                    (isAdmin ? (
                      <JoinRow link={defaultLink} code={defaultCode} />
                    ) : (
                      <p className="mt-2 text-xs font-medium text-muted">
                        Link will be provided soon!
                      </p>
                    ))}
                </>
              ) : isSeries ? (
                <>
                  <p className="text-sm font-semibold text-foreground">Your response</p>
                  {seriesGroups.map((g) => {
                    const o = g.options.find((x) => myPicks.includes(x.id));
                    return (
                      <div key={g.id} className="mt-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                          {g.label}
                        </p>
                        {o ? (
                          <>
                            <p className="text-sm font-medium text-foreground">{o.label}</p>
                            {o.at && (
                              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                                <MeetingTime iso={o.at} setTz={o.tz} />
                                {formatDuration(o.durationFromMin, o.durationToMin) && (
                                  <span>· {formatDuration(o.durationFromMin, o.durationToMin)}</span>
                                )}
                              </p>
                            )}
                            {online &&
                              (isAdmin ? (
                                <JoinRow link={linkFor(o)} code={codeFor(o)} />
                              ) : (
                                <p className="mt-2 text-xs font-medium text-muted">
                                  Link will be provided soon!
                                </p>
                              ))}
                          </>
                        ) : (
                          <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
                            Can&apos;t attend
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {myResponse?.reason && (
                    <p className="mt-2 text-xs text-muted">“{myResponse.reason}”</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-foreground">
                    You&apos;re attending{picked.length > 1 ? ` ${picked.length} sessions` : ""}
                  </p>
                  {picked.map((o) => (
                    <div key={o.id} className="mt-2">
                      <p className="text-sm font-medium text-foreground">{o.label}</p>
                      {o.at && (
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                          <MeetingTime iso={o.at} setTz={o.tz} />
                          {formatDuration(o.durationFromMin, o.durationToMin) && (
                            <span>· {formatDuration(o.durationFromMin, o.durationToMin)}</span>
                          )}
                        </p>
                      )}
                      {online &&
                        (isAdmin ? (
                          <JoinRow link={linkFor(o)} code={codeFor(o)} />
                        ) : (
                          <p className="mt-2 text-xs font-medium text-muted">
                            Link will be provided soon!
                          </p>
                        ))}
                    </div>
                  ))}
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex-none rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-brand hover:text-brand"
            >
              Change
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-faint">
          Responding counts as your acknowledgment. Only admins can see who responded.
        </p>
      </div>
    );
  }

  // ---- can't-make-it summary ----
  if (cantMakeIt && !editing) {
    return (
      <div className="mt-5">
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-rose-500 text-white">
              ✕
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">
                You said you can&apos;t make it
              </p>
              {myResponse?.reason && (
                <p className="mt-1 text-sm text-muted">“{myResponse.reason}”</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex-none rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-brand hover:text-brand"
            >
              Change
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- editing: the picker ----
  return (
    <div className="mt-5">
      <p className="text-sm font-semibold text-foreground">
        {!hasSessions
          ? "Will you attend?"
          : isSeries
            ? "Will you attend? Pick one date from each series."
            : multiPick
              ? "Will you attend? Pick the sessions you'll come to."
              : "Will you attend? Pick a session."}
      </p>

      <div className="mt-2 space-y-2">
        {hasSessions ? (
          <>
            {isSeries ? (
              <div className="space-y-3">
                {seriesGroups.map((g) => {
                  const val = seriesValue(g);
                  const cantSel = val === cantId(g.id);
                  return (
                    <div key={g.id} className="rounded-lg border border-border p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                        {g.label}
                        {!val && (
                          <span className="ml-2 font-normal normal-case text-amber-600 dark:text-amber-400">
                            pick one
                          </span>
                        )}
                        {cantSel && (
                          <span className="ml-2 font-normal normal-case text-rose-600 dark:text-rose-400">
                            can&apos;t attend
                          </span>
                        )}
                      </p>
                      <div className="space-y-2">
                        {g.options.map((opt) => optBtn(opt, () => pickInSeries(g.id, opt.id)))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              options.map((opt) => optBtn(opt))
            )}

            {/* series: one "can't attend one or more" control - check the series you
                can't make, plus a reason. (replaces a per-series button.) */}
            {isSeries && (
              <details className="rounded-lg border border-border" open={anyCant || undefined}>
                <summary className="flex cursor-pointer list-none items-center gap-3 p-3 text-sm [&::-webkit-details-marker]:hidden">
                  <span
                    className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${
                      anyCant ? "border-rose-500 bg-rose-500 text-white" : "border-border-strong"
                    }`}
                  >
                    {anyCant && <Check className="h-3 w-3" />}
                  </span>
                  <span className="font-medium text-foreground">
                    I can&apos;t attend one or more of these
                  </span>
                </summary>
                <div className="space-y-2 px-3 pb-3">
                  <p className="text-xs text-muted">Check the series you can&apos;t attend.</p>
                  {seriesGroups.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={selected.has(cantId(g.id))}
                        onChange={() => toggleCant(g.id)}
                        className="h-4 w-4 accent-rose-500"
                      />
                      {g.label}
                    </label>
                  ))}
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="Reason (optional) - e.g. I'm on PTO that week"
                    className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                  <p className="text-xs text-muted">Only admins can see this reason.</p>
                </div>
              </details>
            )}

            <form action={setChoices.bind(null, postId)} className="flex flex-wrap items-center gap-3 pt-1">
              {[...selected].map((id) => (
                <input key={id} type="hidden" name="optionId" value={id} />
              ))}
              {isSeries && <input type="hidden" name="reason" value={reason} />}
              <SubmitButton
                disabled={confirmDisabled}
                className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint"
              >
                {isGoing ? "Update" : "Confirm attendance"}
              </SubmitButton>
              {(isSeries ? seriesPicked > 0 : selected.size > 0) && (
                <span className="text-xs text-faint">
                  {isSeries
                    ? `${seriesPicked} of ${seriesGroups.length} series picked`
                    : multiPick
                      ? `${selected.size} selected`
                      : `${options.find((o) => selected.has(o.id))?.label} selected`}
                </span>
              )}
              {(isGoing || cantMakeIt) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelected(new Set(myPicks));
                    setReason(myResponse?.reason || "");
                    setEditing(false);
                  }}
                  className="text-xs font-medium text-muted transition hover:text-foreground"
                >
                  Cancel
                </button>
              )}
            </form>
          </>
        ) : (
          // single-session: "I'll be there" (optimistic one-click) or "I can't make
          // it" (fills instantly on click, then asks for a required reason).
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setCantSelected(false);
                setOptGoing(true);
                setEditing(false);
                startTransition(() => attend(postId));
              }}
              className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition disabled:cursor-wait ${
                goingNow && !cantSelected
                  ? "border-brand bg-sky-50 dark:bg-sky-950/30"
                  : "border-border hover:border-brand-light"
              }`}
            >
              <span
                className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${
                  goingNow && !cantSelected ? "border-brand bg-brand text-white" : "border-border-strong"
                }`}
              >
                {goingNow && !cantSelected && <Check className="h-3 w-3" />}
              </span>
              <span className="flex-1 text-sm font-medium text-foreground">I&apos;ll be there</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCantSelected(true);
                setOptGoing(false);
              }}
              className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
                cantSelected
                  ? "border-rose-500 bg-rose-50 dark:bg-rose-950/30"
                  : "border-border hover:border-brand-light"
              }`}
            >
              <span
                className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${
                  cantSelected ? "border-rose-500 bg-rose-500 text-white" : "border-border-strong"
                }`}
              >
                {cantSelected && <Check className="h-3 w-3" />}
              </span>
              <span className="flex-1 text-sm font-medium text-foreground">I can&apos;t make it</span>
            </button>

            {cantSelected && (
              <form action={cantMake.bind(null, postId)} className="rounded-lg border border-border p-3">
                <label htmlFor="cant-reason" className="block text-sm font-medium text-foreground">
                  Why can&apos;t you make it?
                </label>
                <textarea
                  id="cant-reason"
                  name="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  rows={2}
                  placeholder="e.g. I'm on PTO that week"
                  className="mt-1.5 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
                <p className="mt-1.5 text-xs text-muted">
                  A reason is required. Only admins can see it.
                </p>
                <SubmitButton
                  disabled={!reason.trim()}
                  onClick={() => setEditing(false)}
                  className="mt-2.5 rounded-md bg-rose-600 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint"
                >
                  Submit
                </SubmitButton>
              </form>
            )}
          </>
        )}

        {/* "can't make any" for FLAT multi-session lists (single-session has its own
            above; series uses the "can't attend one or more" control). */}
        {hasSessions && !isSeries && (
        <details className="rounded-lg border border-border" open={cantMakeIt || undefined}>
          <summary className="flex cursor-pointer list-none items-center gap-3 p-3 text-sm [&::-webkit-details-marker]:hidden">
            <span
              className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${
                cantActive ? "border-rose-500 bg-rose-500 text-white" : "border-border-strong"
              }`}
            >
              {cantActive && <Check className="h-3 w-3" />}
            </span>
            <span className="font-medium text-foreground">I can&apos;t make any of these</span>
          </summary>
          <form action={cantMake.bind(null, postId)} className="px-3 pb-3">
            <textarea
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={2}
              placeholder="e.g. I'm on PTO that week"
              className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1.5 text-xs text-muted">
              A reason is required. Only admins can see it.
            </p>
            <SubmitButton
              disabled={!reason.trim()}
              onClick={() => setEditing(false)}
              className="mt-2 rounded-md bg-rose-600 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint"
            >
              Submit
            </SubmitButton>
          </form>
        </details>
        )}
      </div>

      <p className="mt-2 text-xs text-faint">
        Responding counts as your acknowledgment - no separate &quot;I read this&quot;
        needed. Only admins can see who responded.
      </p>
    </div>
  );
}
