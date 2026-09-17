"use client";

// THE LIST, THE SIGNATURE, AND THE RUN.
//
// One signature, drawn here, held in this component for this run only. It is
// never stored and never sent anywhere but the approve action, one sheet at a
// time - a reusable signature sitting in a database is a different thing from a
// signature drawn over a list somebody just looked at.
//
// ONE REQUEST PER SHEET, and that is deliberate. `approveTimesheet` fetches the
// signed PDF, finds the approval anchor in the bytes the employee actually
// signed, stamps, uploads and updates. Fifty one of those cannot be one request,
// and putting them in one would also mean one failure loses the lot. So the
// existing action is called per sheet, a few at a time: every guard it already
// has applies unchanged, a sheet that fails fails alone and says so, and the
// count on screen is the real number done rather than a guess.
import { useMemo, useState } from "react";
import SignaturePad from "@/app/portal/forms/[id]/fill/SignaturePad";

// how many run at once. Small on purpose: each one is a PDF fetch, a stamp and
// an upload, and a burst of fifty one would be unkind to the blob store and
// impossible to report on honestly.
const AT_ONCE = 3;

const f2 = (n) => Number(n || 0).toFixed(2);

// WHAT EARNS A CHIP. Only money that moved, or a decision already taken on the
// sheet. NOT unusual hours: the spread here runs from twelve to ninety six and
// both ends are ordinary, so flagging on hours would tint half the list and
// teach somebody to stop seeing the tint.
function chipsFor(r) {
  const out = [];
  if (r.premium > 0) out.push({ k: "premium", t: `${f2(r.premium)} premium` });
  if (r.ot > 0) out.push({ k: "ot", t: `${f2(r.ot)} OT` });
  if (r.accepted > 0) out.push({ k: "accepted", t: `${r.accepted} report${r.accepted === 1 ? "" : "s"} accepted` });
  if (r.declined > 0) out.push({ k: "declined", t: `${r.declined} declined` });
  return out;
}

const CHIP = {
  premium: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ot: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  accepted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  declined: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

export default function ApprovalsList({ groups, approve, approverName }) {
  const all = useMemo(() => groups.flatMap((g) => g.rows), [groups]);
  // ONLY THE PERIOD BEING WORKED STARTS TICKED, AND NEVER THE VIEWER'S OWN.
  // Older periods are on the page because they are genuinely waiting, not so
  // they can be swept up by a press aimed at this fortnight. The viewer's own
  // sheet is listed so a colleague can sign it off, and unticked so they cannot
  // sign it off themselves without meaning to.
  const [picked, setPicked] = useState(
    () => new Set(all.filter((r) => r.current && !r.mine).map((r) => r.id)),
  );
  const [signature, setSignature] = useState(null);
  const [padOpen, setPadOpen] = useState(false);
  const [running, setRunning] = useState(false);
  // { done, total, ok, failed: [{ name, error }] }
  const [progress, setProgress] = useState(null);
  const [finished, setFinished] = useState(null);

  const flaggedCount = useMemo(() => all.filter((r) => chipsFor(r).length).length, [all]);
  const chosen = all.filter((r) => picked.has(r.id));

  const toggle = (id) => setPicked((prev) => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const toggleGroup = (g, on) => setPicked((prev) => {
    const n = new Set(prev);
    for (const r of g.rows) on ? n.add(r.id) : n.delete(r.id);
    return n;
  });

  async function run() {
    if (!signature || !chosen.length || running) return;
    setRunning(true);
    setFinished(null);
    const queue = [...chosen];
    const state = { done: 0, total: queue.length, ok: 0, failed: [] };
    setProgress({ ...state });

    // a small pool rather than Promise.all over everything
    const worker = async () => {
      for (;;) {
        const r = queue.shift();
        if (!r) return;
        let res;
        try {
          res = await approve({ timesheetId: r.id, signatureDataUrl: signature });
        } catch {
          res = { ok: false, error: "threw" };
        }
        state.done += 1;
        if (res?.ok) state.ok += 1;
        // A FAILURE IS NAMED, NOT SWALLOWED. The whole point of doing fifty one
        // at once is that nobody watches each one, so anything that did not land
        // has to be readable afterwards or it is simply lost.
        else state.failed.push({ name: r.name, error: res?.error || "unknown" });
        setProgress({ ...state, failed: [...state.failed] });
      }
    };
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, queue.length) }, worker));

    setRunning(false);
    setFinished({ ...state, failed: [...state.failed] });
    // the ones that landed leave the list; the ones that did not stay ticked so
    // a second press retries exactly them
    const failedNames = new Set(state.failed.map((f) => f.name));
    setPicked(new Set(chosen.filter((r) => failedNames.has(r.name)).map((r) => r.id)));
  }

  if (!all.length) {
    return (
      <div className="mt-8 rounded-xl border border-sep bg-surface px-5 py-6 text-sm text-muted">
        Nothing is waiting for the approval line.
      </div>
    );
  }

  return (
    <>
      {/* the signature, once */}
      <div className="mt-7 rounded-xl bg-surface px-5 py-4 shadow-sm night:ring-1 night:ring-border">
        <h2 className="text-[15px] font-semibold text-foreground">Your signature</h2>
        <p className="mt-1 text-[13px] text-muted">
          Drawn here and used for this run only. Prints as{" "}
          <b className="text-foreground">{approverName}</b>{" "}
          above the line, with today&apos;s date.
        </p>
        {signature ? (
          <div className="mt-3 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={signature} alt="Your signature" className="h-16 rounded-lg bg-white px-3 py-1" />
            <button type="button" onClick={() => setPadOpen(true)} disabled={running}
              className="min-h-[44px] text-sm font-medium text-accent disabled:opacity-40">
              Draw it again
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setPadOpen(true)}
            className="mt-3 min-h-[44px] rounded-[9px] bg-brand px-4 py-2 text-sm font-semibold text-white">
            Sign here
          </button>
        )}
      </div>

      {padOpen && (
        <SignaturePad
          onSave={(dataUrl) => { setSignature(dataUrl); setPadOpen(false); }}
          onClose={() => setPadOpen(false)}
        />
      )}

      {groups.map((g) => {
        const on = g.rows.filter((r) => picked.has(r.id)).length;
        return (
          <section key={g.name} className="mt-8">
            <div className="flex items-center gap-3 border-b border-sep pb-2">
              <input
                type="checkbox"
                checked={on === g.rows.length}
                ref={(el) => { if (el) el.indeterminate = on > 0 && on < g.rows.length; }}
                onChange={(e) => toggleGroup(g, e.target.checked)}
                disabled={running}
                className="h-[17px] w-[17px] accent-[var(--color-brand)]"
                aria-label={`Select all in ${g.name}`}
              />
              <h2 className="text-[17px] font-semibold tracking-tight text-foreground">{g.name}</h2>
              {!g.current && (
                <span className="rounded-[5px] bg-fill px-1.5 py-0.5 text-[11.5px] font-semibold text-muted">
                  earlier period
                </span>
              )}
              <span className="ml-auto text-xs text-faint">{g.rows.length} waiting</span>
            </div>
            {!g.current && (
              <p className="mt-2 text-xs text-muted">
                Signed and never approved. Left unticked on purpose - tick what you
                mean to sign off.
              </p>
            )}
            <div className="mt-1">
              {g.rows.map((r) => {
                const cs = chipsFor(r);
                return (
                  <label key={r.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-[9px] px-3 py-2.5 transition-colors hover:bg-fill ${cs.length ? "bg-amber-500/[0.06]" : ""}`}>
                    <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)}
                      disabled={running} className="h-[17px] w-[17px] accent-[var(--color-brand)]" />
                    <span className="flex min-w-0 shrink-0 basis-[34%] flex-col">
                      <span className="truncate text-[14.5px] font-medium text-foreground">
                        {r.name}
                        {r.mine && (
                          <span className="ml-2 rounded-[5px] bg-fill px-1.5 py-0.5 text-[11px] font-semibold text-muted">
                            yours
                          </span>
                        )}
                      </span>
                      <span className="truncate text-xs text-faint">
                        signed {r.signedAtLabel}{r.signedName ? ` as ${r.signedName}` : ""}
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                      {cs.map((c) => (
                        <span key={c.k} className={`rounded-[5px] px-1.5 py-0.5 text-[11.5px] font-semibold ${CHIP[c.k]}`}>
                          {c.t}
                        </span>
                      ))}
                    </span>
                    <span className="ml-auto shrink-0 text-[14.5px] font-semibold tabular-nums text-foreground">
                      {f2(r.hours)}<small className="ml-0.5 text-[11px] font-normal text-faint">hrs</small>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* what happened, kept on screen rather than flashed */}
      {(progress || finished) && (
        <div className="mt-8 rounded-xl border border-sep bg-surface-2 px-5 py-4">
          {running && (
            <p className="text-sm text-foreground">
              Signing {progress.done} of {progress.total}&hellip;
            </p>
          )}
          {finished && (
            <>
              <p className="text-sm font-semibold text-foreground">
                {finished.ok} approved{finished.failed.length ? `, ${finished.failed.length} did not` : "."}
              </p>
              {!!finished.failed.length && (
                <ul className="mt-2 space-y-1">
                  {finished.failed.map((f, i) => (
                    <li key={i} className="text-[13px] text-rose-600 dark:text-rose-400">
                      {f.name} &mdash; {f.error}
                    </li>
                  ))}
                  <li className="pt-1 text-xs text-muted">
                    These are still ticked. Press again to retry just them.
                  </li>
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {/* the bar: what is about to be signed, and by how many */}
      <div className="sticky bottom-0 z-10 mt-8 -mx-6 border-t border-border bg-glass px-6 py-3.5 backdrop-blur">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-sm text-foreground">
              <b className="text-[17px]">{chosen.length}</b> of {all.length} selected
            </div>
            <div className="text-xs text-faint">
              {flaggedCount} carry something worth a look
            </div>
          </div>
          <button
            type="button"
            onClick={run}
            disabled={!signature || !chosen.length || running}
            className="ml-auto min-h-[44px] rounded-[10px] bg-brand px-5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {running
              ? `Signing ${progress?.done ?? 0} of ${progress?.total ?? 0}`
              : !signature
                ? "Sign here first"
                : `Sign and approve ${chosen.length}`}
          </button>
        </div>
      </div>
    </>
  );
}
