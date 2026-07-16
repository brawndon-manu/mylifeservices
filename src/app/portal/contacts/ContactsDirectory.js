"use client";

// the directory grid + live search. filters in the browser as you type, so no
// round-trip. it only ever receives each person's DISPLAY name (computed
// server-side) - never the legal name - so search can't leak a hidden legal name.
import Link from "next/link";
import { useState, useMemo } from "react";
import Avatar from "@/components/Avatar";
import { ROLE_LABELS, roleBadgeClass } from "@/lib/roles";

export default function ContactsDirectory({ cards }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return cards;
    return cards.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(s) ||
        (c.legal || "").toLowerCase().includes(s) ||
        (c.email || "").toLowerCase().includes(s) ||
        (c.title || "").toLowerCase().includes(s),
    );
  }, [q, cards]);

  return (
    <div>
      {/* sticky so it stays put while the list scrolls under it */}
      <div className="sticky top-0 z-10 -mx-1 mb-3 bg-background px-1 pb-3 pt-0.5">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, email, or title"
          aria-label="Search contacts"
          className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      {cards.length === 0 ? (
        <p className="text-sm text-muted">No one in this group.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted">No one matches “{q}”.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {filtered.map((c) => (
            <li key={c.id}>
              <Link
                href={`/portal/contacts/${c.id}`}
                className="flex h-full gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm card-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <Avatar name={c.name} email={c.email} image={c.image} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{c.name}</span>
                    {c.role && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${roleBadgeClass(c.role)}`}>
                        {ROLE_LABELS[c.role] ?? c.role}
                      </span>
                    )}
                  </div>
                  {c.legal && <p className="text-sm text-muted">{c.legal}</p>}
                  {c.title && <p className="text-sm text-muted">{c.title}</p>}
                  <p className="mt-1 truncate text-sm text-brand">{c.email}</p>
                  {c.phone && <p className="text-sm text-muted">{c.phone}</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
