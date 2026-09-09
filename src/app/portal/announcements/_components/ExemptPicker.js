"use client";

// EXEMPT PEOPLE - the per-post list of people who get the announcement and
// every email but owe nothing on it. Mánu 2026-09-08, on April: "i want her
// to get the email so she can at least see it but she doesnt need to sign
// it." Kept apart from the audience picker on purpose: the audience is who
// the post is FOR; this is who inside it carries no debt. They leave the
// roster denominator, the overdue chips, the reminder chase and the missed
// count - nothing else about the post changes for them.
//
// Quiet by design (the UI gate): one labelled search box, the picked people
// as removable rows, no box-in-box. State drives hidden inputs, same pattern
// as AudiencePicker, so a collapse or filter can never drop a selection.
import { useMemo, useState } from "react";

export default function ExemptPicker({
  staffByTitle = {},
  defaultIds = [],
  name = "ackExemptUserIds",
  mode = "ack",
}) {
  const people = useMemo(() => {
    const seen = new Map();
    for (const list of Object.values(staffByTitle)) {
      for (const p of list || []) {
        if (p?.id && !seen.has(p.id)) seen.set(p.id, { id: p.id, name: p.name });
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [staffByTitle]);

  const [ids, setIds] = useState(() => new Set(defaultIds || []));
  const [q, setQ] = useState("");

  const query = q.trim().toLowerCase();
  const hits = query
    ? people.filter((p) => !ids.has(p.id) && p.name.toLowerCase().includes(query)).slice(0, 8)
    : [];
  const picked = people.filter((p) => ids.has(p.id));

  const verb = mode === "attest" ? "sign" : "acknowledge";

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-foreground">
        Exempt from {mode === "attest" ? "signing" : "acknowledging"}{" "}
        <span className="text-faint">(optional)</span>
      </span>
      <p className="mb-2 text-xs text-muted">
        Exempt people still see the post and still get the email. They are not
        expected to {verb}, and reminders skip them.
      </p>
      {picked.map((p) => (
        <input key={p.id} type="hidden" name={name} value={p.id} />
      ))}
      {picked.length > 0 && (
        <ul className="mb-2 divide-y divide-border rounded-lg border border-border bg-surface-2">
          {picked.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm text-foreground">{p.name}</span>
              <button
                type="button"
                onClick={() =>
                  setIds((s) => {
                    const next = new Set(s);
                    next.delete(p.id);
                    return next;
                  })
                }
                className="text-xs font-medium text-rose-600 hover:underline dark:text-rose-400"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Find a person to exempt"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
      />
      {hits.length > 0 && (
        <ul className="mt-1 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          {hits.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setIds((s) => new Set(s).add(p.id));
                  setQ("");
                }}
                className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-surface-2"
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
