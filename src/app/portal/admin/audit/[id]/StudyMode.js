"use client";

// ONE SHIFT AT A TIME, APPROVED OR FLAGGED.
//
// Mánu 2026-08-26, with a screenshot of Quizlet's study mode: "then we can pick
// flag for review or approved then logs when and who approved what. kinda like
// quizlet flashcards."
//
// So: the counters at the top are the two piles, the card is the whole shift,
// and the two buttons under it are the decision. Keyboard first, because the
// point is to get through a few hundred of these - left and right are the
// decision, space opens the note, and backspace takes the last one back.
//
// A DECISION IS NOT A JUDGEMENT OF THE PERSON. Approve means the shift looks
// right to bill. The card shows what the three documents say and why it
// surfaced, and never tells the reviewer what to conclude.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reviewShift, undoReview } from "../actions";

const clock = (min) => {
  if (min == null) return null;
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`;
};
const span = (a, b) => (a == null || b == null ? null : `${clock(a)}-${clock(b)}`);
const hrs = (m) => (m == null ? null : `${(m / 60).toFixed(2)}h`);

export default function StudyMode({ rows, onExit }) {
  const [at, setAt] = useState(0);
  const [decided, setDecided] = useState(() => {
    const m = {};
    for (const r of rows) if (r.review) m[r.shiftKey] = r.review.decision;
    return m;
  });
  const [flagging, setFlagging] = useState(false);
  const [reason, setReason] = useState("");
  const [openNote, setOpenNote] = useState(false);
  const [busy, setBusy] = useState(false);
  // A REF AS WELL AS THE STATE. `busy` is what greys the buttons out, but state
  // does not settle until the next render, so two events in the same tick both
  // see `busy === false` and both send. The ref flips synchronously.
  const inFlight = useRef(false);
  // STATE RATHER THAN A REF, because the Undo button's disabled attribute reads
  // it during render, and a ref read during render does not re-render when it
  // changes - the button would stay greyed out after the first decision.
  const [history, setHistory] = useState([]);
  const reasonBox = useRef(null);
  const cardBox = useRef(null);

  const counts = useMemo(() => {
    let approved = 0, flagged = 0;
    for (const v of Object.values(decided)) {
      if (v === "approved") approved++;
      else if (v === "flagged") flagged++;
    }
    return { approved, flagged };
  }, [decided]);

  const row = rows[at] || null;
  const done = at >= rows.length;

  const send = useCallback(async (decision, why) => {
    if (!row || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const body = new FormData();
    body.set("decision", decision);
    body.set("shiftKey", row.shiftKey);
    body.set("employeeKey", row.employeeKey || "");
    body.set("date", row.date || "");
    body.set("startMin", row.startMin ?? "");
    body.set("client", row.client || "");
    body.set("service", row.service || "");
    body.set("billedMin", row.billedMin ?? "");
    body.set("clockedMin", row.clockedMin ?? "");
    body.set("documentedMin", row.documentedMin ?? "");
    if (why) body.set("reason", why);
    const res = await reviewShift(body);
    inFlight.current = false;
    setBusy(false);
    if (!res?.ok) return;
    setDecided((d) => ({ ...d, [row.shiftKey]: decision }));
    setHistory((h) => [...h, row.shiftKey]);
    setFlagging(false);
    setReason("");
    setOpenNote(false);
    setAt((i) => i + 1);
  }, [row]);

  // MOVING WITHOUT DECIDING. Mánu 2026-08-26: "give me option to cycle through
  // these without picking a choice."
  //
  // Reading a shift and leaving it alone is a real thing to want - most of a
  // first pass is looking rather than deciding - and it must not be spelled the
  // same way as approving it. So the arrows MOVE and never decide, and the
  // decision keys are the letters.
  //
  // It wraps. Skipping off the end of the list returns to the start rather than
  // hitting the finished screen, because that screen means "you decided these",
  // and arriving at it having decided nothing would say something untrue.
  const step = useCallback((by) => {
    if (!rows.length) return;
    setFlagging(false);
    setReason("");
    setOpenNote(false);
    setAt((i) => (i + by + rows.length) % rows.length);
  }, [rows.length]);

  const back = useCallback(async () => {
    if (inFlight.current || !history.length) return;
    inFlight.current = true;
    const key = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    const i = rows.findIndex((r) => r.shiftKey === key);
    setBusy(true);
    const body = new FormData();
    body.set("shiftKey", key);
    await undoReview(body);
    inFlight.current = false;
    setBusy(false);
    setDecided((d) => { const next = { ...d }; delete next[key]; return next; });
    setFlagging(false);
    setReason("");
    setOpenNote(false);
    if (i >= 0) setAt(i);
  }, [rows, history]);

  // THE SHORTCUTS BELONG TO THE CARD, NOT TO THE WINDOW.
  //
  // Bound to `window`, a bare "a" approves whatever is on screen from anywhere
  // on the page - and A KEY THAT REPEATS APPROVES A RUN OF SHIFTS. That is not
  // hypothetical: four consecutive shifts were approved two seconds apart during
  // testing, by a key nobody meant to hold. On a screen whose whole output is a
  // record of who signed off what, a decision nobody made is the worst thing it
  // can produce.
  //
  // So: the listener sits on the card, which has to hold focus for a key to do
  // anything, auto-repeat is dropped, and a keystroke that lands while a send is
  // still in flight is dropped with it.
  const onKey = (e) => {
    if (e.repeat) return;
    if (flagging) {
      if (e.key === "Escape") { setFlagging(false); setReason(""); }
      return;
    }
    if (e.key.toLowerCase() === "a") { e.preventDefault(); send("approved"); }
    else if (e.key.toLowerCase() === "f") { e.preventDefault(); setFlagging(true); }
    // the arrows move and decide nothing. They used to BE the decision, which
    // put "next" and "approve" on adjacent keys on a screen that records who
    // signed off what.
    else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    else if (e.key === " ") { e.preventDefault(); setOpenNote((v) => !v); }
    else if (e.key === "Backspace") { e.preventDefault(); back(); }
    else if (e.key === "Escape") onExit();
  };

  useEffect(() => { if (flagging) reasonBox.current?.focus(); }, [flagging]);
  useEffect(() => { if (!flagging) cardBox.current?.focus(); }, [at, flagging]);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-bold text-amber-500">
          <span className="rounded-full border-2 border-amber-500 px-3 py-0.5 tabular-nums">
            {counts.flagged}
          </span>
          Flagged
        </span>
        <button
          type="button"
          onClick={onExit}
          className="text-sm font-medium text-muted underline underline-offset-4 hover:text-brand"
        >
          Back to the list
        </button>
        <span className="flex items-center gap-2 text-sm font-bold text-emerald-500">
          Approved
          <span className="rounded-full border-2 border-emerald-500 px-3 py-0.5 tabular-nums">
            {counts.approved}
          </span>
        </span>
      </div>

      {done ? (
        <div className="mt-4 rounded-2xl border border-border bg-surface-2 p-12 text-center">
          <p className="text-lg font-semibold text-foreground">
            That is every shift in this list.
          </p>
          <p className="mt-1 text-sm text-muted">
            {counts.approved} approved, {counts.flagged} flagged.
          </p>
          <button
            type="button"
            onClick={onExit}
            className="mt-6 rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand"
          >
            Back to the list
          </button>
        </div>
      ) : (
        <>
          <article
            ref={cardBox}
            tabIndex={-1}
            onKeyDown={onKey}
            className="mt-4 min-h-[26rem] rounded-2xl border border-border bg-surface-2 p-8 outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span>
                <span className="block text-2xl font-semibold text-foreground">{row.who}</span>
                <span className="mt-0.5 block text-sm text-muted">
                  {row.service}
                  {row.client ? ` · ${row.client}` : ""}
                </span>
              </span>
              <span className="text-sm tabular-nums text-muted">
                {row.date} · {at + 1} of {rows.length}
              </span>
            </div>

            {/* FOUR RECORDS, IN THE ORDER THEY HAPPEN. Mánu 2026-08-27: "it
                should show original schdueled time, billed time, clock in and
                clock out."
                
                Scheduled is what the booking was BEFORE anyone touched it -
                QSP's Original End Time, which the clock export keeps in its own
                schedule columns. Billed is what the Simple Timesheet pays,
                which is the rostered block: 704 of 704 service blocks in
                08/16-08/31 match a punch pair on the timesheet exactly. Clocked
                is what actually happened, and documented is the note.
                
                Showing the original beside the billed figure is what makes a
                trimmed booking legible without working it out: 1p-5p scheduled,
                1p-3:54p billed, 1p-3:54p clocked is a session that ended early
                and was corrected. 1p-5p scheduled, 1p-5p billed, 1p-3:54p
                clocked is the thing this screen looks for. */}
            <dl className="mt-6 grid gap-4 sm:grid-cols-5">
              <Figure
                label="Scheduled"
                value={row.originalFrom != null ? hrs(row.originalTo - row.originalFrom) : "-"}
                sub={span(row.originalFrom, row.originalTo)}
                tone="text-muted"
              />
              <Figure label="Billed" value={hrs(row.billedMin)} sub={span(row.schedFrom, row.schedTo)} />
              {/* a shift nobody clocked and a fortnight with no clock export
                  look the same on a card and mean opposite things */}
              <Figure
                label="Clocked"
                value={hrs(row.clockedMin) || (row.clockAvailable ? "not clocked" : "no clock export")}
                sub={span(row.actualFrom, row.actualTo)}
                tone={
                  row.clockedMin != null ? null : row.clockAvailable ? "text-rose-500" : "text-faint"
                }
              />
              <Figure
                label="Documented"
                value={hrs(row.documentedMin) || "no note"}
                sub={row.note ? `${row.note.start}-${row.note.end}` : null}
                tone={row.note ? null : "text-rose-500"}
              />
              <Gps row={row} />
            </dl>

            {row.reasons.length > 0 && (
              <ul className="mt-6 space-y-1 border-l-2 border-amber-400 pl-4">
                {row.reasons.map((x, i) => (
                  <li key={i} className="text-sm leading-snug text-amber-700 dark:text-amber-300">
                    <span className="font-semibold">{x.label}.</span> {x.text}
                  </li>
                ))}
              </ul>
            )}

            {row.note ? (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => setOpenNote((v) => !v)}
                  className="text-sm font-semibold text-brand underline underline-offset-4"
                >
                  {openNote ? "Hide the note" : `Read the note (${row.note.words} words)`}
                </button>
                {openNote && (
                  <div className="mt-3 rounded-lg border border-border bg-surface p-4">
                    <p className="text-sm leading-relaxed text-foreground">{row.note.summary}</p>
                    {row.note.categories.length > 0 && (
                      <p className="mt-2 text-xs text-faint">{row.note.categories.join(" · ")}</p>
                    )}
                    {row.note.comments.map((c, i) => (
                      <p key={i} className="mt-2 text-sm leading-relaxed text-muted">{c}</p>
                    ))}
                    <p className="mt-3 text-xs text-faint">
                      Signed {row.note.signedDate} {row.note.signedAt}
                      {row.note.miles ? " · miles claimed" : ""}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-6 text-sm text-faint">No service note was filed against this shift.</p>
            )}

            {/* WHAT THIS SHIFT ALREADY CARRIES, reading the decision made in
                this session before the one the page was loaded with. Arrowing
                back to a shift just approved would otherwise show the state it
                had before, and say nothing about what was just done to it. */}
            {(decided[row.shiftKey] || row.review) && (
              <p
                className={`mt-6 text-xs font-semibold ${
                  (decided[row.shiftKey] || row.review.decision) === "approved"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {(decided[row.shiftKey] || row.review.decision) === "approved"
                  ? "Approved"
                  : "Flagged"}
                {row.review?.by ? ` by ${row.review.by}` : ""}
                {row.review?.reason ? ` - ${row.review.reason}` : ""}. Deciding again replaces it.
              </p>
            )}
          </article>

          {flagging ? (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
              <label htmlFor="reason" className="block text-sm font-semibold text-foreground">
                What should be looked at?
              </label>
              <textarea
                id="reason"
                ref={reasonBox}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={!reason.trim() || busy}
                  onClick={() => send("flagged", reason.trim())}
                  className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
                >
                  Flag it
                </button>
                <button
                  type="button"
                  onClick={() => { setFlagging(false); setReason(""); }}
                  className="rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => step(-1)}
                title="Previous shift, deciding nothing (left arrow)"
                className="rounded-xl border border-border-strong px-4 py-4 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
              >
                ← Previous
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setFlagging(true)}
                title="Flag for review (F)"
                className="rounded-xl border-2 border-amber-400 px-10 py-4 text-lg font-bold text-amber-500 transition hover:bg-amber-50 disabled:opacity-50 dark:hover:bg-amber-950/30"
              >
                Flag
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => send("approved")}
                title="Approve (A)"
                className="rounded-xl border-2 border-emerald-400 px-10 py-4 text-lg font-bold text-emerald-500 transition hover:bg-emerald-50 disabled:opacity-50 dark:hover:bg-emerald-950/30"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                title="Next shift, deciding nothing (right arrow)"
                className="rounded-xl border border-border-strong px-4 py-4 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
              >
                Skip →
              </button>
              <button
                type="button"
                disabled={busy || history.length === 0}
                onClick={back}
                title="Undo the last decision (Backspace)"
                className="rounded-xl border border-border-strong px-4 py-4 text-sm font-medium text-muted transition hover:border-brand hover:text-brand disabled:opacity-40"
              >
                Undo
              </button>
            </div>
          )}

          <p className="mt-4 text-center text-xs text-faint">
            A to approve, F to flag. The arrows move between shifts and decide nothing, and the
            list wraps round. Space opens the note, Backspace takes the last decision back.
            Approve means the shift looks right to bill.
          </p>
        </>
      )}
    </div>
  );
}

function Figure({ label, value, sub, tone }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</dt>
      <dd className={`mt-0.5 text-xl font-bold tabular-nums ${tone || "text-foreground"}`}>
        {value || "-"}
      </dd>
      {sub && <dd className="text-xs tabular-nums text-muted">{sub}</dd>}
    </div>
  );
}

// BOTH ENDS, ALWAYS SHOWN. Mánu 2026-08-26: "location geofence should have both
// indicators for in and out shown." A single summary hid which end failed, and
// they are two separate device failures on one shift.
//
// Three-valued, like everywhere else the clock export is read: a shift nobody
// clocked into never had a location to capture, so it has nothing to say rather
// than a failure to report.
function Gps({ row }) {
  const one = (v, end) => {
    const text = v === "yes" ? "captured" : v === "no" ? "none" : "nothing to capture";
    const tone = v === "yes"
      ? "text-emerald-600 dark:text-emerald-400"
      : v === "no" ? "text-sky-600 dark:text-sky-400" : "text-faint";
    return (
      <dd className={`text-xs font-semibold ${tone}`}>
        clock-{end}: {text}
      </dd>
    );
  };
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-faint">Location</dt>
      <div className="mt-1 space-y-0.5">
        {one(row.gpsIn, "in")}
        {one(row.gpsOut, "out")}
      </div>
    </div>
  );
}
