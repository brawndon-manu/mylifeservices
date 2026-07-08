"use client";

import { useState } from "react";
import { submitRsvpPicks } from "../actions";

// the whole-meeting RSVP picker on the /a/rsvp landing. one page, no login. the
// reader picks their date(s), and a single "can't attend" button expands to the
// right thing for the meeting shape:
//   - series  -> a checklist of which series they can't attend + a reason
//   - single / one-series-many-sessions -> just "I can't attend" + a reason
// the visible rows drive state; a block of hidden inputs posts the selection so
// submission never fights the controlled UI.

function Marker({ tone, on, box }) {
  const ring = on
    ? tone === "cant"
      ? "border-rose-500"
      : "border-brand-light"
    : "border-border-strong";
  const fill = tone === "cant" ? "bg-rose-500" : "bg-brand-light";
  if (box) {
    return (
      <span
        className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border-2 ${ring} ${on ? fill : ""}`}
      >
        {on && (
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
    );
  }
  return (
    <span className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border-2 ${ring}`}>
      {on && <span className={`h-2.5 w-2.5 rounded-full ${fill}`} />}
    </span>
  );
}

// a clickable selection row (not a form input - state is posted via hidden inputs).
function Choice({ label, tone, on, box, onClick }) {
  const state = on
    ? tone === "cant"
      ? "border-rose-500 bg-rose-500/10 text-rose-200"
      : "border-brand-light bg-brand-light/10 text-foreground"
    : tone === "cant"
      ? "border-border bg-background text-rose-300/90 hover:border-rose-500/60"
      : "border-border bg-background text-brand-light hover:border-brand-light/60";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm font-semibold transition ${state}`}
    >
      <Marker tone={tone} on={on} box={box} />
      <span>{label}</span>
    </button>
  );
}

export default function RsvpForm({
  token,
  title,
  firstName,
  kind, // "series" | "flat" | "single"
  series = [],
  flat = null,
  singleLocked = false,
  initial = {},
}) {
  const isSeries = kind === "series";
  const isSingle = kind === "single";
  const isMulti = kind === "flat" && !!flat?.multi;

  const [seriesPick, setSeriesPick] = useState(initial.seriesPick || {});
  const [cantSeries, setCantSeries] = useState(() => new Set(initial.cantSeries || []));
  const [flatVal, setFlatVal] = useState(initial.flatVal || "");
  const [flatChecks, setFlatChecks] = useState(() => new Set(initial.flatChecks || []));
  const [singleGoing, setSingleGoing] = useState(!!initial.singleGoing);
  const [fullCant, setFullCant] = useState(!!initial.flatCant || !!initial.singleCant);
  const [cantOpen, setCantOpen] = useState(
    isSeries ? (initial.cantSeries || []).length > 0 : !!initial.flatCant || !!initial.singleCant,
  );
  const [reason, setReason] = useState(initial.reason || "");

  // --- series interactions ---
  const pickSeriesDate = (sid, optId) => {
    setSeriesPick((p) => ({ ...p, [sid]: optId }));
    setCantSeries((prev) => {
      if (!prev.has(sid)) return prev;
      const n = new Set(prev);
      n.delete(sid);
      return n;
    });
  };
  const toggleCantSeries = (sid) => {
    setCantSeries((prev) => {
      const n = new Set(prev);
      if (n.has(sid)) n.delete(sid);
      else {
        n.add(sid);
        setSeriesPick((p) => {
          if (!(sid in p)) return p;
          const np = { ...p };
          delete np[sid];
          return np;
        });
      }
      return n;
    });
  };

  // --- flat / single "attend" interactions clear any full can't-attend ---
  const pickFlat = (optId) => {
    setFlatVal(optId);
    setFullCant(false);
    setCantOpen(false);
  };
  const toggleFlatMulti = (optId) => {
    setFullCant(false);
    setCantOpen(false);
    setFlatChecks((prev) => {
      const n = new Set(prev);
      n.has(optId) ? n.delete(optId) : n.add(optId);
      return n;
    });
  };
  const pickSingleGoing = () => {
    setSingleGoing(true);
    setFullCant(false);
    setCantOpen(false);
  };

  // --- the single can't-attend button ---
  const toggleCant = () => {
    if (isSeries) {
      setCantOpen((o) => !o);
      return;
    }
    // simple shapes: opening = "I can't attend", which clears the attend picks
    setCantOpen((o) => {
      const next = !o;
      setFullCant(next);
      if (next) {
        setFlatVal("");
        setFlatChecks(new Set());
        setSingleGoing(false);
      }
      return next;
    });
  };

  // --- derived ---
  const attendingCount = isSeries
    ? Object.keys(seriesPick).filter((sid) => !cantSeries.has(sid)).length
    : isSingle
      ? singleGoing && !fullCant
        ? 1
        : 0
      : isMulti
        ? flatChecks.size
        : flatVal && !fullCant
          ? 1
          : 0;
  const cantCount = isSeries ? cantSeries.size : fullCant ? 1 : 0;
  const anyCant = isSeries ? cantSeries.size > 0 : fullCant;
  const canSubmit = attendingCount > 0 || cantCount > 0;

  const heading = isSeries
    ? `Pick your dates, ${firstName}`
    : isSingle
      ? `Can you make it, ${firstName}?`
      : `Pick your date, ${firstName}`;
  const instruct = isSeries
    ? "Choose one date for each series. You can change this anytime in the portal."
    : isSingle
      ? "Let us know if you can make it. You can change this anytime in the portal."
      : "Choose the date that works for you. You can change this anytime in the portal.";
  const cantLabel = isSeries ? "Can't attend one or more of these series" : "I can't attend";

  return (
    <form
      action={submitRsvpPicks.bind(null, token)}
      className="w-full max-w-md rounded-2xl border border-border-strong bg-surface p-6 text-left shadow-sm"
    >
      {/* hidden inputs = the posted selection, derived from state */}
      {isSeries &&
        series.map((s) =>
          cantSeries.has(s.id) ? (
            <input key={s.id} type="hidden" name="cantSeries" value={s.id} />
          ) : seriesPick[s.id] ? (
            <input key={s.id} type="hidden" name={`series:${s.id}`} value={seriesPick[s.id]} />
          ) : null,
        )}
      {kind === "flat" && !isMulti && flatVal && !fullCant && (
        <input type="hidden" name="flat" value={flatVal} />
      )}
      {kind === "flat" &&
        isMulti &&
        !fullCant &&
        [...flatChecks].map((id) => <input key={id} type="hidden" name="flatPick" value={id} />)}
      {kind === "flat" && fullCant && <input type="hidden" name="flatCant" value="on" />}
      {isSingle && singleGoing && !fullCant && <input type="hidden" name="single" value="going" />}
      {isSingle && fullCant && <input type="hidden" name="singleCant" value="on" />}

      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand">Company meeting</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{heading}</h1>
      <p className="mt-1.5 text-sm text-muted">
        <span className="font-medium text-foreground">&ldquo;{title}&rdquo;</span>
      </p>
      <p className="mt-4 text-sm text-muted">{instruct}</p>

      {/* attend picks */}
      {isSingle ? (
        <div className="mt-4">
          {singleLocked ? (
            <p className="rounded-xl border border-border bg-background px-3.5 py-3 text-sm text-muted">
              This meeting has already started, so it can&apos;t be changed here.
            </p>
          ) : (
            <Choice
              label="✓ I'll be there"
              on={singleGoing && !fullCant}
              onClick={pickSingleGoing}
            />
          )}
        </div>
      ) : isSeries ? (
        series.map((s) => (
          <div key={s.id} className="mt-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">{s.label}</span>
              <span
                className={`rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${s.locked ? "text-amber-400" : "text-faint"}`}
              >
                {s.locked ? "Locked" : "pick one"}
              </span>
            </div>
            {s.locked ? (
              <p className="rounded-xl border border-border bg-background px-3.5 py-3 text-sm text-muted">
                This series has already started, so it can&apos;t be changed here.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {s.options.map((o) => (
                  <Choice
                    key={o.id}
                    label={o.dateLabel}
                    on={seriesPick[s.id] === o.id && !cantSeries.has(s.id)}
                    onClick={() => pickSeriesDate(s.id, o.id)}
                  />
                ))}
              </div>
            )}
          </div>
        ))
      ) : (
        <div className="mt-4">
          {flat?.locked ? (
            <p className="rounded-xl border border-border bg-background px-3.5 py-3 text-sm text-muted">
              This meeting has already started, so it can&apos;t be changed here.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {flat.options.map((o) =>
                isMulti ? (
                  <Choice
                    key={o.id}
                    label={o.dateLabel}
                    box
                    on={flatChecks.has(o.id) && !fullCant}
                    onClick={() => toggleFlatMulti(o.id)}
                  />
                ) : (
                  <Choice
                    key={o.id}
                    label={o.dateLabel}
                    on={flatVal === o.id && !fullCant}
                    onClick={() => pickFlat(o.id)}
                  />
                ),
              )}
            </div>
          )}
        </div>
      )}

      {/* the single can't-attend control */}
      {!(isSingle ? singleLocked : isSeries ? false : flat?.locked) && (
        <div className="mt-4">
          <button
            type="button"
            onClick={toggleCant}
            className={`flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3.5 py-3 text-sm font-semibold transition ${
              cantOpen
                ? "border-rose-500/70 text-rose-300"
                : "border-rose-500/30 text-rose-300/80 hover:border-rose-500/60"
            }`}
          >
            <span aria-hidden>✕</span> {cantLabel}
          </button>

          {cantOpen && (
            <div className="mt-3 rounded-2xl border border-rose-500/25 bg-rose-500/[0.06] p-4">
              {isSeries ? (
                <>
                  <h3 className="text-sm font-bold text-rose-100">Which can&apos;t you attend?</h3>
                  <p className="mt-0.5 text-xs text-rose-200/70">
                    Check any series you can&apos;t make. Choose more than one if you need to.
                  </p>
                  <div className="mt-2.5 flex flex-col gap-2">
                    {series
                      .filter((s) => !s.locked)
                      .map((s) => (
                        <Choice
                          key={s.id}
                          label={s.label}
                          tone="cant"
                          box
                          on={cantSeries.has(s.id)}
                          onClick={() => toggleCantSeries(s.id)}
                        />
                      ))}
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-sm font-bold text-rose-100">Sorry you can&apos;t make it</h3>
                  <p className="mt-0.5 text-xs text-rose-200/70">
                    A quick note helps us plan. Only admins can see it.
                  </p>
                </>
              )}
              <textarea
                name="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Reason (optional). Only admins can see this."
                className="mt-3 w-full rounded-xl border border-border-strong bg-background px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-brand focus:outline-none"
              />
            </div>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-5 w-full rounded-xl bg-brand-dark px-4 py-3 text-sm font-bold text-white transition hover:bg-brand disabled:opacity-50"
      >
        Save my response
      </button>
      {(attendingCount > 0 || cantCount > 0) && (
        <p className="mt-3 text-center text-xs text-muted">
          {attendingCount > 0 && (
            <>
              <span className="text-emerald-400">&#10003;</span> Attending{" "}
              <b className="text-foreground">
                {attendingCount} {isSeries ? "series" : attendingCount === 1 ? "date" : "dates"}
              </b>
            </>
          )}
          {attendingCount > 0 && cantCount > 0 && " · "}
          {cantCount > 0 && (
            <>
              can&apos;t attend{" "}
              <b className="text-foreground">
                {isSeries ? `${cantCount} series` : "this"}
              </b>
            </>
          )}
        </p>
      )}
      <p className="mt-3 text-center text-xs text-faint">No login needed.</p>
    </form>
  );
}
