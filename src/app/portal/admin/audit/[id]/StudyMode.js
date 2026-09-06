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
import { ampmLabel, clientFirstLast } from "./figures";
import ShiftEvidence from "./ShiftEvidence";
import styles from "../audit.module.css";
import BillableAdjust from "./BillableAdjust";

export default function StudyMode({ rows: dealt, onExit, titles = null, onReview }) {
  // THE DECK IS DEALT ONCE, when study mode opens.
  //
  // Mánu 2026-08-28: "sometimes when i click approve it skips over 2 cards
  // over and i see the one that gets skipped." Reproduced: approve card 1,
  // land on card 2, and seconds later the server's re-render arrives - this
  // page takes several seconds to build - and the approved card leaves the
  // "Not decided" list the deck was dealt from. Everything shifts left under
  // an index that already advanced, and the card being READ jumps to the one
  // after it. The decision was recorded correctly; the deck moved underneath.
  //
  // So a run works through the rows as they stood when it began. Decisions
  // land in `decided` and on the server, and the list view re-reads the world
  // the moment the run is left. This is also what lets Undo return to the
  // exact card it is undoing: the card is still where it was.
  const [allRows] = useState(dealt);
  const [at, setAt] = useState(0);
  // NARROWING THE RUN WITHOUT LEAVING IT. Mánu 2026-08-27: "when youre going by
  // it one by one we should have a way to change to diffferent employee or
  // client or day with ease."
  //
  // Reviewing is done a person at a time or a client at a time - you hold one
  // person's week in your head and work down it - and going back to the list to
  // re-filter loses that. These narrow the run in place.
  const [only, setOnly] = useState({ who: "", client: "", date: "" });
  const [decided, setDecided] = useState(() => {
    const m = {};
    for (const r of allRows) if (r.review) m[r.shiftKey] = r.review.decision;
    return m;
  });
  const [reviewOverrides, setReviewOverrides] = useState({});
  const [error, setError] = useState("");
  const [flagging, setFlagging] = useState(false);
  const [reason, setReason] = useState("");
  // the corrected billable time, in minutes, typed or quick-filled in the flag
  // panel. Empty string means no adjustment: the billed figure stands.
  const [billable, setBillable] = useState("");
  // the clock window the figure was typed as - rides beside billable and
  // lands on the review as billableFrom/ToMin
  const [billableWin, setBillableWin] = useState(null);
  const [openNote, setOpenNote] = useState(false);
  const [openSched, setOpenSched] = useState(false);
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

  const rows = useMemo(() => allRows.filter((r) =>
    (!only.who || r.who === only.who)
    && (!only.client || (r.client || "") === only.client)
    && (!only.date || r.date === only.date)), [allRows, only]);

  // the choices, each counted over what the OTHER two are already showing, so a
  // combination that holds nothing is not offered
  const choices = useMemo(() => {
    const pick = (key, keep) => {
      const m = new Map();
      for (const r of allRows) {
        if (!keep(r)) continue;
        const v = key === "client" ? (r.client || "") : r[key];
        if (v == null || v === "") continue;
        m.set(v, (m.get(v) || 0) + 1);
      }
      return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    };
    return {
      who: pick("who", (r) => (!only.client || (r.client || "") === only.client) && (!only.date || r.date === only.date)),
      client: pick("client", (r) => (!only.who || r.who === only.who) && (!only.date || r.date === only.date)),
      date: pick("date", (r) => (!only.who || r.who === only.who) && (!only.client || (r.client || "") === only.client)),
    };
  }, [allRows, only]);

  const narrow = (field, value) => {
    setOnly((o) => ({ ...o, [field]: value }));
    setAt(0);
    setFlagging(false);
    setReason("");
    setBillable("");
    setOpenNote(false);
  };

  const counts = useMemo(() => {
    let approved = 0, flagged = 0;
    for (const v of Object.values(decided)) {
      if (v === "approved") approved++;
      else if (v === "flagged") flagged++;
    }
    return { approved, flagged };
  }, [decided]);

  const baseRow = rows[at] || null;
  const row = useMemo(
    () => baseRow && reviewOverrides[baseRow.shiftKey] !== undefined
      ? { ...baseRow, review: reviewOverrides[baseRow.shiftKey] }
      : baseRow,
    [baseRow, reviewOverrides],
  );
  const done = at >= rows.length;

  const send = useCallback(async (decision, why, billableMin = null, win = null) => {
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
    if (billableMin != null) body.set("billableMin", billableMin);
    if (billableMin != null && win) {
      body.set("billableFromMin", win.from);
      body.set("billableToMin", win.to);
    }
    if (why) body.set("reason", why);
    setError("");
    let res;
    try { res = await reviewShift(body); }
    catch { setError("Could not save the decision. Please try again."); return; }
    finally { inFlight.current = false; setBusy(false); }
    if (!res?.ok) { setError("Could not save the decision. Please try again."); return; }
    const review = {
      decision, reason: why || "",
      billableMin: billableMin == null ? null : Number(billableMin),
      billableFrom: billableMin != null && win ? win.from : null,
      billableTo: billableMin != null && win ? win.to : null,
      by: "you",
    };
    setReviewOverrides((v) => ({ ...v, [row.shiftKey]: review }));
    onReview?.(row.shiftKey, review);
    setDecided((d) => ({ ...d, [row.shiftKey]: decision }));
    setHistory((h) => [...h, row.shiftKey]);
    setFlagging(false);
    setReason("");
    setBillable("");
    setOpenNote(false);
    setOpenSched(false);
    setAt((i) => i + 1);
  }, [row, onReview]);

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
    setBillable("");
    setOpenNote(false);
    setOpenSched(false);
    setAt((i) => (i + by + rows.length) % rows.length);
  }, [rows.length]);

  const back = useCallback(async () => {
    if (inFlight.current || !history.length) return;
    inFlight.current = true;
    const key = history[history.length - 1];
    const i = rows.findIndex((r) => r.shiftKey === key);
    setBusy(true);
    const body = new FormData();
    body.set("shiftKey", key);
    setError("");
    let res;
    try { res = await undoReview(body); }
    catch { setError("Could not undo the decision. Please try again."); return; }
    finally { inFlight.current = false; setBusy(false); }
    if (!res?.ok) { setError("Could not undo the decision. Please try again."); return; }
    setHistory((h) => h.slice(0, -1));
    setReviewOverrides((v) => ({ ...v, [key]: null }));
    onReview?.(key, null);
    setDecided((d) => { const next = { ...d }; delete next[key]; return next; });
    setFlagging(false);
    setReason("");
    setBillable("");
    setOpenNote(false);
    if (i >= 0) setAt(i);
  }, [rows, history, onReview]);

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
    if (e.repeat || inFlight.current || e.target !== e.currentTarget) return;
    if (flagging) {
      if (e.key === "Escape") { setFlagging(false); setReason(""); setBillable(""); }
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
      {error && <p role="alert" className={styles.notice}>{error}</p>}
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
          <span className="rounded-full border border-border px-3 py-0.5 tabular-nums">
            {counts.approved}
          </span>
        </span>
      </div>

      {/* ONE ROW, EVEN ON A PHONE. Stacked with a label over each, the three
          pickers cost 340px before the card came into view - on the screen
          where the whole point is to look at the card. The empty option names
          the picker instead, so no label line is needed. */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Picker value={only.who} all="All employees" options={choices.who} onPick={(v) => narrow("who", v)} />
        <Picker value={only.client} all="All clients" options={choices.client} onPick={(v) => narrow("client", v)} />
        <Picker value={only.date} all="All days" options={choices.date} onPick={(v) => narrow("date", v)} />
      </div>
      {(only.who || only.client || only.date) && (
        <p className="mt-2 text-xs text-faint">
          {rows.length} {rows.length === 1 ? "shift" : "shifts"} in this run.{" "}
          <button
            type="button"
            onClick={() => { setOnly({ who: "", client: "", date: "" }); setAt(0); }}
            className="font-semibold text-brand underline underline-offset-4"
          >
            Show all {allRows.length} again
          </button>
        </p>
      )}

      {rows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border p-12 text-center text-sm text-faint">
          Nothing matches that combination.
        </div>
      ) : done ? (
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
            className={`${styles.card} ${styles.focusCard}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span>
                <span className="block text-xl font-semibold text-foreground sm:text-2xl">
                  {row.who}
                  {titles?.[row.employeeKey] && (
                    <span className="ml-2.5 text-sm font-medium text-muted">
                      {titles[row.employeeKey]}
                    </span>
                  )}
                </span>
                {/* client first, then the service, no dots - the flagged
                    report's heading, Mánu 2026-09-04 */}
                <span className="mt-0.5 block text-base text-foreground">
                  <span className="font-semibold">
                    {row.client ? clientFirstLast(row.client) : "no client on the booking"}
                  </span>
                  {row.service && <span className="ml-3 text-muted">{row.service}</span>}
                </span>
                <span className="mt-0.5 block text-sm tabular-nums text-muted">
                  {row.date}
                  {row.schedFrom != null && row.schedTo != null
                    ? `\u00A0\u00A0\u00A0${ampmLabel(row.schedFrom)} - ${ampmLabel(row.schedTo)}`
                    : ""}
                </span>
              </span>
              <span className="text-sm tabular-nums text-muted">
                {at + 1} of {rows.length}
              </span>
            </div>

            <ShiftEvidence row={row} />

            {row.changed && (
              <p className="mt-4 text-sm font-semibold text-sky-700 dark:text-sky-300">
                Changed since the previous copy:{" "}
                {row.changed.map((k) => ({ new: "new shift", hours: "hours moved", note: "note added" })[k] || k).join(", ")}.
              </p>
            )}

            {row.reasons.length > 0 && (
              <ul className="mt-6 space-y-1 border-l-2 border-amber-400 pl-4">
                {row.reasons.map((x, i) => (
                  <li
                    key={i}
                    className={`text-sm leading-snug ${
                      x.kind === "no-note"
                        ? "font-medium text-rose-600 dark:text-rose-400"
                        : "text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    <span className="font-semibold">{x.label}.</span> {x.text}
                  </li>
                ))}
              </ul>
            )}


      {/* WHAT STAFF SAID, BESIDE THE FINDING RATHER THAN BEHIND A CLICK.
          
          Mánu 2026-08-27 asked whether these words reach the explanations. They
          do now, as a quote and never as a verdict: 43 of the 442 schedule notes
          say the session ended early and 34 say somebody forgot to clock, which
          is the answer to a great many of these findings.
          
          NO RULE READS THEM. "Client ended session early" explains why the CLOCK
          is short; it does not explain why the booking still bills the full
          time, and that gap is the thing this screen exists to find. A rule that
          treated the note as an excuse would dismiss exactly the cases it was
          built for. So the words are shown and the reader decides. */}
      {row.reasons.length > 0 && row.scheduleNote && (
        <p className="mt-3 border-l-2 border-border-strong pl-4 text-sm leading-relaxed text-muted">
          Staff wrote: “{row.scheduleNote.text}”
        </p>
      )}

            {/* BOTH NOTES, EACH BEHIND ITS OWN TOGGLE. Mánu 2026-08-27: "we
                need the schdule notes and the service notes included with drop
                downs."
                
                They answer different questions. The schedule note is the reason
                typed on the shift - usually the explanation for the finding
                itself, "Client ended early due to being tired". The service note
                is the account of what was delivered. Neither is opened by
                default: the figures decide whether a card needs reading, and
                two paragraphs on every card is how a queue of 1,700 stops being
                read at all. */}
            <div className="mt-6 space-y-2">
              {row.scheduleNote && (
                <div>
                  <button
                    type="button"
                    aria-expanded={openSched}
                    onClick={() => setOpenSched((v) => !v)}
                    className="text-sm font-semibold text-brand underline underline-offset-4"
                  >
                    {openSched ? "Hide the schedule note" : "Read the schedule note"}
                  </button>
                  {openSched && (
                    <div className="mt-2 rounded-lg border border-border bg-surface p-4">
                      {row.scheduleNote.from && (
                        <p className="text-xs tabular-nums text-faint">
                          {row.scheduleNote.from}-{row.scheduleNote.to}
                        </p>
                      )}
                      <p className="mt-1 text-sm leading-relaxed text-foreground">
                        {row.scheduleNote.text}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {row.note ? (
                <div>
                  <button
                    type="button"
                    aria-expanded={openNote}
                    onClick={() => setOpenNote((v) => !v)}
                    className="text-sm font-semibold text-brand underline underline-offset-4"
                  >
                    {openNote
                      ? `Hide the ${row.note.source === "dsn" ? "DSN" : "service note"}`
                      : `Read the ${row.note.source === "dsn" ? "DSN" : "service note"} (${row.note.words} words)`}
                  </button>
                  {openNote && (
                    <div className="mt-2 rounded-lg border border-border bg-surface p-4">
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
                <p className="text-sm text-faint">No DSN or service note was filed against this shift.</p>
              )}
            </div>

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
                {row.review?.reason ? ` - ${row.review.reason.replace(/\.$/, "")}` : ""}
. Deciding again replaces it.
              </p>
            )}
          </article>

          {flagging ? (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
              <label htmlFor="reason" className="block text-sm font-semibold text-foreground">
                What should be looked at?{" "}
                <span className="font-normal text-muted">Optional.</span>
              </label>
              <textarea
                id="reason"
                ref={reasonBox}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
              />

              {/* THE CORRECTED BILLABLE TIME, BEHIND ITS OWN BUTTON - Mánu
                  2026-09-04: an untouched flag must look untouched, so the
                  inputs exist only after "Adjust the billable time" and stay
                  TBD on the reports otherwise. Shared with the card
                  DecideBar via BillableAdjust. */}
              <BillableAdjust
                billedMin={row.billedMin}
                clockedMin={row.clockedMin}
                documentedMin={row.documentedMin}
                value={billable}
                onChange={(v, w) => { setBillable(v); setBillableWin(w || null); }}
              />

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    send(
                      "flagged",
                      reason.trim() || null,
                      billable !== "" && Number.isFinite(Number(billable)) ? Number(billable) : null,
                      billableWin,
                    )
                  }
                  className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
                >
                  Flag it
                </button>
                <button
                  type="button"
                  onClick={() => { setFlagging(false); setReason(""); setBillable(""); }}
                  className="rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-3">
              {/* TWO PER ROW ON A PHONE. Flowed with flex-wrap they came out as
                  Previous+Flag, then Approve+Skip, then Undo alone - the two
                  decisions split across rows, with Approve landing where
                  Previous had just been. A grid keeps the pair together and in
                  the same place. */}
              <button
                type="button"
                onClick={() => step(-1)}
                title="Previous shift, deciding nothing (left arrow)"
                className="order-3 rounded-xl border border-border-strong px-4 py-3.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand sm:order-1"
              >
                ← Previous
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setFlagging(true)}
                title="Flag for review (F)"
                className={`${styles.secondary} order-1 sm:order-2`}
              >
                Flag
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => send("approved")}
                title="Approve (A)"
                className={`${styles.primary} order-2 sm:order-3`}
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                title="Next shift, deciding nothing (right arrow)"
                className="order-4 rounded-xl border border-border-strong px-4 py-3.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand sm:order-4"
              >
                Skip →
              </button>
              <button
                type="button"
                disabled={busy || history.length === 0}
                onClick={back}
                title="Undo the last decision (Backspace)"
                className="order-5 col-span-2 rounded-xl border border-border-strong px-4 py-3 text-sm font-medium text-muted transition hover:border-brand hover:text-brand disabled:opacity-40 sm:order-5 sm:col-span-1 sm:py-3.5"
              >
                Undo
              </button>
            </div>
          )}

          <p className="mt-4 text-center text-xs leading-relaxed text-faint">
            Approve means the shift looks right to bill.
            <span className="hidden sm:inline">
              {" "}A to approve, F to flag. The arrows move between shifts and decide nothing, and
              the list wraps round. Space opens the note, Backspace takes the last decision back.
            </span>
          </p>
        </>
      )}
    </div>
  );
}


function Picker({ value, all, options, onPick }) {
  return (
    <select
      value={value}
      aria-label={all}
      onChange={(e) => onPick(e.target.value)}
      className={`w-full truncate rounded-md border px-2 py-2 text-xs focus:border-brand focus:outline-none sm:px-3 sm:text-sm ${
        value
          ? "border-brand bg-brand/10 font-semibold text-brand"
          : "border-border-strong bg-surface text-muted"
      }`}
    >
      <option value="">{all}</option>
      {options.map(([name, n]) => (
        <option key={name} value={name}>
          {name} ({n})
        </option>
      ))}
    </select>
  );
}
