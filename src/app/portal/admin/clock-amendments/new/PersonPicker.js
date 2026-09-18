"use client";

import { useEffect, useRef, useState } from "react";

// START TYPING AND THE PEOPLE COME UP. Mánu 2026-09-18: "we can just make it so
// you start typing and the options come up of who to send thats all."
//
// A LIST OF 117 IS NOT A SELECT. It is also not derivable: `User.supervisorId`
// exists and is filled in for 0 of 99 staff, so there is nothing to pre-pick
// from and the honest answer is to ask.
//
// THE CHOSEN PERSON IS AN ID IN A HIDDEN FIELD, never the typed text. A form
// that posts a name matches the wrong Brandon the first time two of them work
// here, and two of them already do.
export default function PersonPicker({ name, label, hint, search, onPick }) {
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState([]);
  const [picked, setPicked] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (picked) return;
    const q = term.trim();
    if (q.length < 2) { setRows([]); return; }
    // one request per pause, not one per keystroke
    let live = true;
    setBusy(true);
    const t = setTimeout(async () => {
      const found = await search(q);
      if (!live) return;
      setRows(found || []);
      setOpen(true);
      setBusy(false);
    }, 220);
    return () => { live = false; clearTimeout(t); };
  }, [term, picked, search]);

  // a click anywhere else closes the list rather than leaving it hanging over
  // whatever is underneath
  useEffect(() => {
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const choose = (r) => {
    setPicked(r);
    setTerm(r.label);
    setOpen(false);
    onPick?.(r);
  };

  const clear = () => {
    setPicked(null);
    setTerm("");
    setRows([]);
    onPick?.(null);
  };

  return (
    <div ref={box} className="relative">
      <label className="block text-[12.5px] font-medium text-muted" htmlFor={`pick-${name}`}>
        {label}
      </label>
      {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-faint">{hint}</p>}
      <input type="hidden" name={name} value={picked?.id || ""} />
      <div className="relative mt-1.5">
        <input
          id={`pick-${name}`}
          type="text"
          autoComplete="off"
          value={term}
          placeholder="Start typing a name"
          onChange={(e) => { setPicked(null); setTerm(e.target.value); }}
          onFocus={() => rows.length && setOpen(true)}
          className="min-h-[44px] w-full rounded-[9px] border border-border-strong bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-brand"
        />
        {picked && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-muted transition hover:bg-fill"
          >
            Change
          </button>
        )}
      </div>

      {/* SAYS WHO IT LANDED ON, not just that something was picked. Two people
          here share a first name and one of them is the person filling this in. */}
      {picked && (
        <p className="mt-1 text-[11.5px] text-muted">
          {picked.name && picked.name !== picked.label ? `${picked.name} · ` : ""}
          <span className="text-faint">{picked.email}</span>
        </p>
      )}

      {open && !picked && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-[10px] border border-border bg-surface py-1 shadow-lg">
          {busy && <li className="px-3 py-2 text-[12.5px] text-faint">Looking&hellip;</li>}
          {!busy && rows.length === 0 && (
            <li className="px-3 py-2 text-[12.5px] text-faint">Nobody by that name.</li>
          )}
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => choose(r)}
                className="block w-full px-3 py-2 text-left transition hover:bg-fill"
              >
                <span className="block text-[13px] font-medium text-foreground">{r.label}</span>
                {/* the account name only where it is a DIFFERENT name. Most
                    people here go by the one on their account, and printing it
                    twice reads as a duplicate row rather than as a distinction. */}
                <span className="block text-[11.5px] text-faint">
                  {r.name && r.name !== r.label ? `${r.name} · ` : ""}
                  {r.role || ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
