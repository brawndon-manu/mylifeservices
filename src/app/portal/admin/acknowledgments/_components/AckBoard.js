"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import NameHover from "@/components/NameHover";

// people-view styles, tailored to acks (who's done vs who hasn't).
const VIEWS = [
  { key: "grouped", label: "Grouped" },
  { key: "summary", label: "Summary" },
  { key: "search", label: "Searchable" },
];
const STORE_KEY = "mls-ack-view";

export default function AckBoard({ posts, counts }) {
  const [view, setView] = useState("grouped");
  useEffect(() => {
    const saved = window.localStorage.getItem(STORE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved && VIEWS.some((v) => v.key === saved)) setView(saved);
  }, []);
  const pick = (k) => {
    setView(k);
    try {
      window.localStorage.setItem(STORE_KEY, k);
    } catch {}
  };

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        <Pill>
          <b className="text-foreground">{counts.total}</b> need acknowledgment
        </Pill>
        <Pill>
          <b className="text-foreground">{counts.done}</b> fully acknowledged
        </Pill>
        {counts.total > 0 && (
          <Pill>
            avg <b className="text-foreground">{counts.avg}%</b>
          </Pill>
        )}
        {counts.total > 0 && (
          <span className="ml-auto flex items-center gap-2">
            <span className="text-xs text-faint">People view</span>
            <span className="inline-flex rounded-lg border border-border bg-surface p-0.5">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => pick(v.key)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    view === v.key ? "bg-brand-light text-white" : "text-muted hover:text-foreground"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </span>
          </span>
        )}
      </div>

      {counts.total === 0 ? (
        <p className="mt-10 rounded-xl border border-border bg-surface p-6 text-sm text-muted">
          No announcements need acknowledgment yet. Turn on &quot;require
          acknowledgment&quot; when posting and it will show up here.
        </p>
      ) : (
        <div className="mt-8 space-y-3.5">
          {posts.map((p) => (
            <AckCard key={p.id} p={p} view={view} />
          ))}
        </div>
      )}

    </>
  );
}

function Pill({ children }) {
  return (
    <span className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-muted">
      {children}
    </span>
  );
}

function Stat({ tone, label, value }) {
  const valCls = tone === "na" ? "text-faint" : "text-foreground";
  return (
    <span className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted">
      {label} <b className={`font-semibold ${valCls}`}>{value}</b>
    </span>
  );
}

function Bar({ pct, full }) {
  return (
    <div className="h-2 overflow-hidden rounded-full border border-border bg-background">
      <div
        className={`h-full rounded-full ${full ? "bg-emerald-500" : "bg-brand-light"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function AvatarStack({ users, max = 6 }) {
  if (users.length === 0) return null;
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className="flex items-center">
      <span className="flex">
        {shown.map((u) => (
          <span key={u.id} className="-ml-2 rounded-full ring-2 ring-surface first:ml-0">
            <Avatar name={u.displayName} image={u.image} size={24} />
          </span>
        ))}
      </span>
      {rest > 0 && <span className="ml-1.5 text-xs text-muted">+{rest}</span>}
    </span>
  );
}

function PersonLine({ user, showDot }) {
  return (
    <div className="flex items-center gap-2.5 py-1">
      {showDot && (
        <span
          className={`h-2 w-2 flex-none rounded-full ${
            user.acked ? "bg-emerald-500" : "bg-amber-400"
          }`}
        />
      )}
      <Avatar name={user.displayName} image={user.image} size={26} />
      <div className="min-w-0">
        <NameHover user={user} className="block truncate text-sm font-medium text-foreground" />
        {user.title && <div className="truncate text-xs text-muted">{user.title}</div>}
      </div>
      {user.acked && (
        <span className="ml-auto whitespace-nowrap text-xs text-muted">
          {user.viaEmail ? "via email" : "in portal"}
          {user.dateLabel ? ` · ${user.dateLabel}` : ""}
        </span>
      )}
    </div>
  );
}

// ---- the people views ----

function GroupedView({ people }) {
  const acked = people.filter((u) => u.acked);
  const notYet = people.filter((u) => !u.acked);
  return (
    <div className="space-y-1">
      <StatusGroup dot="bg-amber-400" label="Not yet" users={notYet} open />
      <StatusGroup dot="bg-emerald-500" label="Acknowledged" users={acked} />
    </div>
  );
}

function StatusGroup({ dot, label, users, open }) {
  if (users.length === 0) return null;
  return (
    <details open={open} className="rounded-lg border border-border bg-background/60 px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label} <span className="text-faint">({users.length})</span>
      </summary>
      <div className="mt-1">
        {users.map((u) => (
          <PersonLine key={u.id} user={u} />
        ))}
      </div>
    </details>
  );
}

function SummaryView({ people }) {
  const acked = people.filter((u) => u.acked).length;
  const notYet = people.length - acked;
  const w = (n) => (people.length ? `${(n / people.length) * 100}%` : "0%");
  return (
    <div>
      <div className="flex items-center gap-3">
        <AvatarStack users={people.filter((u) => u.acked)} />
        <div className="flex h-2 min-w-[140px] flex-1 overflow-hidden rounded-full border border-border bg-background">
          <span className="bg-emerald-500" style={{ width: w(acked) }} />
          <span className="bg-border-strong" style={{ width: w(notYet) }} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Acknowledged {acked}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-400" /> Not yet {notYet}
        </span>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer list-none text-xs font-medium text-brand-dark hover:text-brand">
          View everyone ({people.length}) →
        </summary>
        <div className="mt-1">
          {people.map((u) => (
            <PersonLine key={u.id} user={u} showDot />
          ))}
        </div>
      </details>
    </div>
  );
}

function SearchView({ people }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const counts = {
    all: people.length,
    acked: people.filter((u) => u.acked).length,
    notYet: people.filter((u) => !u.acked).length,
  };
  const shown = people.filter((u) => {
    if (filter === "acked" && !u.acked) return false;
    if (filter === "notYet" && u.acked) return false;
    if (q && !u.displayName.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const chips = [
    ["all", "All"],
    ["acked", "Acknowledged"],
    ["notYet", "Not yet"],
  ];
  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search…"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-brand focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {chips.map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
              filter === k
                ? "border-brand-light bg-brand-light/10 text-brand-dark"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {lbl} {counts[k]}
          </button>
        ))}
      </div>
      <div className="mt-2">
        {shown.length === 0 ? (
          <p className="py-1 text-xs text-faint">nobody matches</p>
        ) : (
          shown.map((u) => <PersonLine key={u.id} user={u} showDot />)
        )}
      </div>
    </div>
  );
}

function AckPeople({ people, view }) {
  if (people.length === 0) return <p className="py-1 text-xs text-faint">nobody yet</p>;
  if (view === "summary") return <SummaryView people={people} />;
  if (view === "search") return <SearchView people={people} />;
  return <GroupedView people={people} />;
}

function AckCard({ p, view }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-border-strong hover:shadow-[6px_6px_0_0_rgba(15,23,42,0.9)] dark:hover:shadow-[6px_6px_0_0_rgba(56,138,221,0.45)]">
      {/* header opens the announcement; the drill-down below stays interactive. */}
      <div className="group relative flex flex-col gap-4 sm:flex-row sm:items-start">
        <Link
          href={`/portal/announcements/${p.id}?from=ack`}
          aria-label={`Open ${p.title}`}
          className="absolute inset-0 rounded-lg"
        />
        <div className="min-w-0 sm:flex-[1_1_44%]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-base font-semibold tracking-tight text-foreground group-hover:text-brand">
              {p.title}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${p.tagCls}`}>
              {p.tag}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-muted">
            {p.dateLabel && <>Posted {p.dateLabel} · </>}audience: {p.audience}
          </p>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-[1_1_56%]">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted">Acknowledged</span>
            <span className="font-semibold text-foreground">
              {p.acked} / {p.expected} · {p.pct}%
            </span>
          </div>
          <Bar pct={p.pct} full={p.expected > 0 && p.notYetCount === 0} />
          <div className="flex flex-wrap items-center gap-2">
            <Stat label="in portal" value={p.inPortal} />
            <Stat label="via email" value={p.viaEmail} />
            <Stat tone="na" label="Not yet" value={p.notYetCount} />
          </div>
        </div>
      </div>

      <details className="mt-4 border-t border-border pt-3">
        <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wider text-muted">
          <span className="text-faint">▾</span> Who&apos;s acknowledged
        </summary>
        <div className="mt-3 border-l-2 border-border-strong pl-3">
          <AckPeople people={p.people} view={view} />
        </div>
      </details>
    </div>
  );
}
