"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import NameHover from "@/components/NameHover";
import {
  markAckFor,
  adminAddInvitee,
  adminRemoveInvitee,
} from "@/app/portal/announcements/actions";
import {
  InviteeManager,
  OverrideProvider,
  OverrideToggle,
  useOverrideShown,
} from "@/app/portal/announcements/_components/RosterAdmin";

// the full acknowledged / not-yet list for one announcement, with the people-view
// switcher, the mark-acknowledged override, and invitee management. lives on the
// dedicated page; the report cards are read-only summaries that link here.
const AckCtx = createContext({ postId: null });

const VIEWS = [
  { key: "grouped", label: "Grouped" },
  { key: "summary", label: "Summary" },
  { key: "search", label: "Searchable" },
];
const STORE_KEY = "mls-ack-view";

export default function AckBreakdown({ p }) {
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
    <OverrideProvider>
      <AckCtx.Provider value={{ postId: p.id }}>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2">
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
          <OverrideToggle />
        </div>

        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <AckPeople people={p.people} view={view} />
        </div>

        <InviteeManager
          postId={p.id}
          added={p.addedInvitees || []}
          candidates={p.inviteeCandidates || []}
          add={adminAddInvitee}
          remove={adminRemoveInvitee}
        />
      </AckCtx.Provider>
    </OverrideProvider>
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
  const { postId } = useContext(AckCtx);
  const override = useOverrideShown();
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
      {user.acked ? (
        <span className="ml-auto whitespace-nowrap text-xs text-muted">
          {user.viaEmail ? "via email" : "in portal"}
          {user.dateLabel ? ` · ${user.dateLabel}` : ""}
        </span>
      ) : (
        override && (
          <form action={markAckFor.bind(null, postId, user.id)} className="ml-auto flex">
            <button
              type="submit"
              className="rounded-md border border-brand-light/50 px-2.5 py-1 text-xs font-semibold text-brand-light transition hover:bg-brand-light/10"
            >
              Mark acknowledged
            </button>
          </form>
        )
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
