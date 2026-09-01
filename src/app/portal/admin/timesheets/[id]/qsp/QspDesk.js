"use client";

// THE DESK ITSELF. One card per signed review; entries answer every click at
// once (the roster-picker pattern - optimistic, rolled back if the server
// refuses). The approve control is the SAME review-and-approve the pay period
// has always had, linked per card - Mánu 2026-09-02: "im talking about having
// the review and approve button there." Approval and the QSP marks are
// independent facts: a review approved before its entries were keyed shows
// exactly that, and its marks stay workable.
import { useState } from "react";
// the batch's shared presence: the card reports the pointer resting on it and
// wears the other person's hover ring. `person-<sheetId>` is the SAME row key
// the All employees screen and the person page use, so Gabe on either screen
// sees where Mánu is on this one, and the other way round.
import { PresenceCard, RowPresence } from "../Presence";

const keyOf = (correctionId, fact) => `${correctionId}|${fact}`;

const CHIPS = [
  { key: "all", label: "All" },
  { key: "open", label: "Still to add" },
  { key: "approved", label: "Approved" },
  { key: "none", label: "Nothing to change" },
];

export default function QspDesk({ rows, mark, viewerName }) {
  const [chip, setChip] = useState("all");
  // entry key -> { state: "marked" | "unmarking", byName } laid over the
  // server's marks until the refresh catches up
  const [local, setLocal] = useState({});
  const [busyAll, setBusyAll] = useState({});
  const [error, setError] = useState(null);

  const markOf = (it, ch) => {
    const l = local[keyOf(it.correctionId, ch.fact)];
    if (l?.state === "marked") return { byName: l.byName, when: "just now" };
    if (l?.state === "unmarking") return null;
    return ch.mark;
  };

  const toggle = (it, ch, cur) => {
    setError(null);
    const k = keyOf(it.correctionId, ch.fact);
    const next = cur ? { state: "unmarking" } : { state: "marked", byName: viewerName };
    const prev = local[k];
    setLocal((l) => ({ ...l, [k]: next }));
    mark({ correctionId: it.correctionId, fact: ch.fact, done: !cur }).then(
      (res) => {
        if (!res?.ok) {
          setLocal((l) => ({ ...l, [k]: prev }));
          setError(messageFor(res?.error));
        }
      },
      () => {
        setLocal((l) => ({ ...l, [k]: prev }));
        setError(messageFor());
      },
    );
  };

  // FOR REVIEWS WORKED BEFORE THIS DESK EXISTED: the entries are already keyed
  // into QuickSolve, so one press marks every one - sequentially through the
  // same verified action, no separate bulk path on the server.
  const alreadyDone = async (row) => {
    setError(null);
    setBusyAll((s) => ({ ...s, [row.timesheetId]: true }));
    try {
      for (const { it, ch, mark: m } of row.changesFlat) {
        if (m) continue;
        const res = await mark({ correctionId: it.correctionId, fact: ch.fact, done: true });
        if (!res?.ok) throw new Error(res?.error || "");
        setLocal((l) => ({ ...l, [keyOf(it.correctionId, ch.fact)]: { state: "marked", byName: viewerName } }));
      }
    } catch (e) {
      setError(messageFor(e?.message));
    } finally {
      setBusyAll((s) => ({ ...s, [row.timesheetId]: false }));
    }
  };

  const shaped = rows.map((row) => {
    const changes = row.items.flatMap((it) =>
      it.changes.map((ch) => ({ it, ch, mark: markOf(it, ch) })),
    );
    const owed = changes.length;
    const marked = changes.filter((x) => x.mark).length;
    return { ...row, changesFlat: changes, owedNow: owed, markedNow: marked, none: owed === 0 };
  });

  const owedTotal = shaped.reduce((n, r) => n + r.owedNow, 0);
  const markedTotal = shaped.reduce((n, r) => n + r.markedNow, 0);
  const approvedCount = shaped.filter((r) => r.approved).length;
  const noneCount = shaped.filter((r) => r.none).length;

  const shown = shaped.filter((r) =>
    chip === "open" ? r.owedNow > r.markedNow
      : chip === "approved" ? !!r.approved
        : chip === "none" ? r.none
          : true,
  );

  return (
    <div className="mt-7">
      <div className="flex flex-wrap gap-x-7 gap-y-2 rounded-xl border border-border bg-surface px-5 py-4">
        <Stat n={owedTotal - markedTotal} label="Entries to add" tone="text-amber-700 dark:text-amber-400" />
        <Stat n={markedTotal} label="Added in QSP" tone="text-emerald-700 dark:text-emerald-400" />
        <Stat n={`${approvedCount} of ${shaped.length}`} label="Approved" />
        <Stat n={noneCount} label="Nothing to change" />
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setChip(c.key)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              chip === c.key
                ? "border-brand bg-brand text-white"
                : "border-border-strong text-muted hover:border-brand hover:text-brand"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>
      )}

      {shown.map((row) => (
        <PersonCard
          key={row.timesheetId}
          row={row}
          toggle={toggle}
          alreadyDone={alreadyDone}
          busyAll={!!busyAll[row.timesheetId]}
        />
      ))}
      {!shown.length && (
        <p className="mt-6 text-sm text-muted">Nothing here on this filter.</p>
      )}
    </div>
  );
}

function Stat({ n, label, tone = "text-foreground" }) {
  return (
    <div>
      <p className={`text-xl font-semibold tabular-nums ${tone}`}>{n}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}

function PersonCard({ row, toggle, alreadyDone, busyAll }) {
  const left = row.owedNow - row.markedNow;
  const settled = row.approved && left === 0 && row.owedNow > 0;

  return (
    <PresenceCard
      rowKey={`person-${row.timesheetId}`}
      faces={false}
      className={`card-lift mt-4 overflow-hidden rounded-xl border bg-surface ${
        settled ? "border-emerald-300/70 dark:border-emerald-800"
          : row.none ? "border-dashed border-border" : "border-border"
      }`}
    >
      <div className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3.5 ${settled || row.none ? "" : "border-b border-border"}`}>
        <span className="text-base font-semibold text-foreground">{row.name}</span>
        <span className="text-xs text-muted">
          signed {row.signedAtLabel}
          {" · "}
          {row.owed > 0
            ? `${row.owed} ${row.owed === 1 ? "entry" : "entries"}`
            : row.answers > 0
              ? `${row.answers} ${row.answers === 1 ? "answer" : "answers"}`
              : "no answers"}
        </span>
        <a
          href={`/portal/admin/timesheets/sheet/${row.timesheetId}/download?copy=signed`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-brand hover:underline"
        >
          Signed timesheet →
        </a>
        <span className="ml-auto flex items-center gap-1.5">
          <RowPresence rowKey={`person-${row.timesheetId}`} />
          {row.approved && (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
              Approved
            </span>
          )}
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
              row.none
                ? "bg-surface-2 text-muted"
                : left === 0
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
            }`}
          >
            {row.none ? "Nothing to change" : left === 0 ? "All added" : `${left} to add`}
          </span>
        </span>
      </div>

      {settled ? (
        <div className="bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          Every entry added in QuickSolve. Approved ✓{" "}
          <span className="font-normal text-muted">
            · {row.approved.byName || "approved"} · {row.approved.when}
          </span>
        </div>
      ) : row.none ? (
        <>
          {row.items.map((it, i) => (
            <Entry key={i} it={it} onlySaid />
          ))}
          <div className="px-5 py-3 text-sm text-muted">
            {row.answers > 0
              ? "Nothing to change in QuickSolve."
              : "Signed with no answers and nothing to change in QuickSolve."}
            {!row.approved && (
              <ApproveLink timesheetId={row.timesheetId} className="ml-3" />
            )}
          </div>
        </>
      ) : (
        <>
          {row.items.map((it, i) => (
            <Entry key={i} it={it} row={row} toggle={toggle} />
          ))}
          <div className="flex flex-wrap items-center gap-4 bg-surface-2 px-5 py-3.5">
            <p className="min-w-[200px] flex-1 text-sm text-muted">
              {left === 0
                ? "Every entry is added."
                : `${left} ${left === 1 ? "entry is" : "entries are"} still to add.`}
              {row.approved && ` Approved by ${row.approved.byName || "the office"} · ${row.approved.when}.`}
            </p>
            {left > 0 && (
              <button
                type="button"
                disabled={busyAll}
                onClick={() => alreadyDone(row)}
                className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-foreground transition hover:border-brand hover:text-brand disabled:opacity-45"
              >
                {busyAll ? "Marking..." : "All of this is already in QuickSolve"}
              </button>
            )}
            {!row.approved && <ApproveLink timesheetId={row.timesheetId} button />}
          </div>
        </>
      )}
    </PresenceCard>
  );
}

function ApproveLink({ timesheetId, button = false, className = "" }) {
  return (
    <a
      href={`/portal/admin/timesheets/sheet/${timesheetId}/approve`}
      className={
        button
          ? "rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          : `text-sm font-semibold text-brand hover:underline ${className}`
      }
    >
      Review and approve →
    </a>
  );
}

function Entry({ it, row, toggle, onlySaid = false }) {
  return (
    <div className="flex items-start gap-4 border-b border-border px-5 py-3.5 last:border-b-0">
      <span className="w-14 flex-none pt-0.5 text-[13px] font-semibold tabular-nums text-foreground">
        {(it.date || "").slice(0, 5) || "–"}
      </span>
      <div className="min-w-0 flex-1">
        {it.said && <p className="text-[13px] text-amber-800/90 dark:text-amber-200/80">{it.said}</p>}
        {it.changes.length === 0 ? (
          <p className="mt-0.5 text-sm text-muted">
            No entry to make. The record already says what they said.
          </p>
        ) : (
          it.changes.map((ch) => {
            const mark = onlySaid ? null : markOfEntry(row, it, ch);
            return (
              <div key={ch.fact} className="mt-1 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <p className="min-w-0 flex-1 text-sm text-foreground">
                  <span className="font-semibold">{ch.fact}</span> {ch.action}
                </p>
                <span className="flex-none">
                  {mark ? (
                    <button
                      type="button"
                      onClick={() => toggle(it, ch, true)}
                      title="Take the mark back off"
                      className="text-right text-xs font-semibold text-emerald-700 dark:text-emerald-400"
                    >
                      Added ✓
                      <span className="block text-[11px] font-normal text-muted">
                        {mark.byName} · {mark.when}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggle(it, ch, false)}
                      className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-brand hover:text-brand"
                    >
                      Added in QSP
                    </button>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// the entry's mark as the card is currently showing it - the row was shaped
// with the optimistic layer already applied, so read it from there
function markOfEntry(row, it, ch) {
  const hit = row.changesFlat.find((x) => x.it === it && x.ch === ch);
  return hit ? hit.mark : ch.mark;
}

function messageFor(code) {
  switch (code) {
    case "notsigned":
      return "That review is not signed any more. Reload the page.";
    case "unknown":
      return "That entry is not on this review any more. Reload the page.";
    default:
      return "Something went wrong saving that. Try again.";
  }
}
