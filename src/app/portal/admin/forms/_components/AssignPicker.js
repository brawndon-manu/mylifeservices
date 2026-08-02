"use client";

// reconciliation control for a "needs assignment" form submission: search the
// active-staff list and assign it to the right person, with a couple of
// fuzzy name-guess suggestions surfaced first. portaled to <body> like the
// announcement roster's dropdowns, so it isn't clipped by the table row.
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Avatar from "@/components/Avatar";

export default function AssignPicker({ submissionId, candidates, suggestions, assign }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [q, setQ] = useState("");
  const ref = useRef(null);

  const place = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const up = r.bottom > window.innerHeight * 0.6;
    setPos({
      up,
      top: up ? undefined : r.bottom + 4,
      bottom: up ? window.innerHeight - r.top + 4 : undefined,
      right: window.innerWidth - r.right,
    });
  };
  const toggle = () => {
    if (!open) place();
    setOpen((v) => !v);
  };

  const suggestedIds = new Set(suggestions.map((s) => s.id));
  const shown = q
    ? candidates.filter((c) => c.displayName.toLowerCase().includes(q.toLowerCase()))
    : candidates.filter((c) => !suggestedIds.has(c.id));

  const style = pos
    ? { top: pos.top, bottom: pos.bottom, right: pos.right }
    : {};

  return (
    <span ref={ref} className="inline-block">
      <button
        type="button"
        onClick={toggle}
        className="rounded-md border border-brand-light/50 px-2.5 py-1 text-xs font-semibold text-brand-light transition hover:bg-brand-light/10"
      >
        Assign →
      </button>
      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
            <div
              style={style}
              className="fixed z-[61] w-80 max-h-[70vh] overflow-y-auto rounded-xl border border-border-strong bg-surface p-2 shadow-lg"
            >
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search active staff…"
                className="mb-1.5 block w-full rounded-md border border-border-strong bg-background px-2.5 py-1.5 text-sm text-foreground focus:border-brand focus:outline-none"
              />
              {!q && suggestions.length > 0 && (
                <>
                  <p className="px-1 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-faint">
                    Suggested match{suggestions.length > 1 ? "es" : ""}
                  </p>
                  {suggestions.map((c) => (
                    <Candidate key={c.id} c={c} submissionId={submissionId} assign={assign} onPick={() => setOpen(false)} />
                  ))}
                  <div className="my-1 border-t border-border" />
                </>
              )}
              {shown.length === 0 ? (
                <p className="px-1 py-2 text-xs text-faint">no one matches</p>
              ) : (
                shown.map((c) => (
                  <Candidate key={c.id} c={c} submissionId={submissionId} assign={assign} onPick={() => setOpen(false)} />
                ))
              )}
            </div>
          </>,
          document.body,
        )}
    </span>
  );
}

function Candidate({ c, submissionId, assign, onPick }) {
  return (
    <form action={assign.bind(null, submissionId, c.id)} onSubmit={onPick}>
      <button
        type="submit"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition hover:bg-surface-2"
      >
        <Avatar name={c.displayName} image={c.image} size={22} />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{c.displayName}</span>
          {c.title && <span className="block truncate text-xs text-muted">{c.title}</span>}
        </span>
      </button>
    </form>
  );
}
