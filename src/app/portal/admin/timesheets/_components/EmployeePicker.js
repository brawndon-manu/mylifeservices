"use client";

// pick the portal account a parsed timesheet belongs to. suggestions from the
// name matcher come first, with their confidence, then the full active roster.
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Avatar from "@/components/Avatar";

export default function EmployeePicker({ timesheetId, candidates, suggestions = [], assign, label }) {
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
  const list = q
    ? candidates.filter((c) => c.displayName.toLowerCase().includes(q.toLowerCase()))
    : candidates.filter((c) => !suggestedIds.has(c.id));

  return (
    <span ref={ref} className="inline-block">
      <button
        type="button"
        onClick={toggle}
        className="rounded-md border border-brand-light/50 px-2.5 py-1 text-xs font-semibold text-brand-light transition hover:bg-brand-light/10"
      >
        {label}
      </button>
      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
            <div
              style={{ top: pos.top, bottom: pos.bottom, right: pos.right }}
              className="fixed z-[61] max-h-[70vh] w-80 overflow-y-auto rounded-xl border border-border-strong bg-surface p-2 shadow-lg"
            >
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search staff…"
                className="mb-1.5 block w-full rounded-md border border-border-strong bg-background px-2.5 py-1.5 text-sm text-foreground focus:border-brand focus:outline-none"
              />
              {!q && suggestions.length > 0 && (
                <>
                  <p className="px-1 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-faint">
                    Likely match
                  </p>
                  {suggestions.map((c) => (
                    <Row key={c.id} c={c} timesheetId={timesheetId} assign={assign} onPick={() => setOpen(false)} />
                  ))}
                  <div className="my-1 border-t border-border" />
                </>
              )}
              {list.length === 0 ? (
                <p className="px-1 py-2 text-xs text-faint">no one matches</p>
              ) : (
                list.map((c) => (
                  <Row key={c.id} c={c} timesheetId={timesheetId} assign={assign} onPick={() => setOpen(false)} />
                ))
              )}
            </div>
          </>,
          document.body,
        )}
    </span>
  );
}

function Row({ c, timesheetId, assign, onPick }) {
  return (
    <form action={assign.bind(null, timesheetId, c.id)} onSubmit={onPick}>
      <button
        type="submit"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition hover:bg-surface-2"
      >
        <Avatar name={c.displayName} image={c.image} size={22} />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{c.displayName}</span>
          <span className="block truncate text-xs text-muted">{c.email}</span>
        </span>
        {c.confidence != null && (
          <span className="flex-none text-[10px] font-semibold text-muted">{c.confidence}%</span>
        )}
      </button>
    </form>
  );
}
