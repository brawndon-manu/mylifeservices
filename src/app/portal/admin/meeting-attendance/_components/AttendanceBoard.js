"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import NameHover from "@/components/NameHover";
import { markAttendance } from "@/app/portal/announcements/actions";

// the people-view styles the admin can switch between (choice persists).
const VIEWS = [
  { key: "grouped", label: "Grouped" },
  { key: "summary", label: "Summary" },
  { key: "search", label: "Searchable" },
];
const STORE_KEY = "mls-attendance-view";

// optimistic roll-call: a mark shows instantly, then saves in the background.
// attendance defaults to NEUTRAL (null) - nobody reads as absent until someone
// actively marks them.
const AttendanceCtx = createContext(null);
const useAttendance = () => useContext(AttendanceCtx);

export default function AttendanceBoard({ upcoming, past, counts }) {
  const [view, setView] = useState("grouped");
  const [marks, setMarks] = useState({});
  const [, startTransition] = useTransition();

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

  const attendedOf = (postId, user) => {
    const key = `${postId}:${user.id}`;
    return key in marks ? marks[key] : user.attended || null;
  };
  const mark = (postId, userId, status) => {
    const value = status === "present" || status === "absent" ? status : null;
    setMarks((prev) => ({ ...prev, [`${postId}:${userId}`]: value }));
    startTransition(async () => {
      try {
        await markAttendance(postId, userId, status);
      } catch {}
    });
  };

  return (
    <AttendanceCtx.Provider value={{ attendedOf, mark }}>
      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        <Pill>
          <b className="text-foreground">{counts.total}</b> meeting
          {counts.total === 1 ? "" : "s"}
        </Pill>
        <Pill>
          <b className="text-foreground">{counts.upcoming}</b> upcoming
        </Pill>
        <Pill>
          <b className="text-foreground">{counts.past}</b> past
        </Pill>
        {counts.total > 0 && (
          <Pill>
            avg response <b className="text-foreground">{counts.avg}%</b>
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
                    view === v.key
                      ? "bg-brand-light text-white"
                      : "text-muted hover:text-foreground"
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
          No Company Meetings yet. Post one from the Announcements feed and it will
          show up here.
        </p>
      ) : (
        <>
          {upcoming.length > 0 && (
            <>
              <SectionLabel>Upcoming</SectionLabel>
              <div className="space-y-3.5">
                {upcoming.map((m) => (
                  <MeetingCard key={m.id} m={m} view={view} />
                ))}
              </div>
            </>
          )}
          {past.length > 0 && (
            <>
              <SectionLabel>Past</SectionLabel>
              <div className="space-y-3.5 opacity-70">
                {past.map((m) => (
                  <MeetingCard key={m.id} m={m} view={view} past />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </AttendanceCtx.Provider>
  );
}

function Pill({ children }) {
  return (
    <span className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-muted">
      {children}
    </span>
  );
}

function SectionLabel({ children }) {
  return (
    <h2 className="mt-8 mb-3 text-xs font-semibold uppercase tracking-wider text-faint">
      {children}
    </h2>
  );
}

function Chip({ tone, children }) {
  const cls = {
    mandatory: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    series: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
    due: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
  }[tone];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

function Stat({ tone, label, value }) {
  const valCls = {
    go: "text-emerald-600 dark:text-emerald-400",
    no: "text-rose-600 dark:text-rose-400",
    na: "text-faint",
    pres: "text-emerald-600 dark:text-emerald-400",
    abs: "text-rose-600 dark:text-rose-400",
  }[tone];
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

const STATUS_DOT = {
  present: "bg-emerald-500",
  absent: "bg-rose-500",
  unmarked: "bg-amber-400",
};

// a person row. with postId it shows live Present/Absent roll-call buttons
// (going people); without it, it's read-only (can't-attend / no-response rows).
function PersonLine({ user, postId, showDot }) {
  const { attendedOf, mark } = useAttendance();
  const att = postId ? attendedOf(postId, user) : user.attended || null;
  const rollBtn = "rounded-md border px-2 py-0.5 text-xs font-medium transition";
  return (
    <div className="flex items-center gap-2.5 py-1">
      {showDot && (
        <span className={`h-2 w-2 flex-none rounded-full ${STATUS_DOT[att || "unmarked"]}`} />
      )}
      <Avatar name={user.displayName} image={user.image} size={26} />
      <div className="min-w-0">
        <NameHover user={user} className="block truncate text-sm font-medium text-foreground" />
        {user.title && <div className="truncate text-xs text-muted">{user.title}</div>}
      </div>
      {postId ? (
        <span className="ml-auto flex flex-none gap-1.5">
          <button
            type="button"
            onClick={() => mark(postId, user.id, att === "present" ? "" : "present")}
            className={`${rollBtn} ${
              att === "present"
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-border-strong text-muted hover:border-emerald-500 hover:text-emerald-600"
            }`}
          >
            Present
          </button>
          <button
            type="button"
            onClick={() => mark(postId, user.id, att === "absent" ? "" : "absent")}
            className={`${rollBtn} ${
              att === "absent"
                ? "border-rose-500 bg-rose-500 text-white"
                : "border-border-strong text-muted hover:border-rose-500 hover:text-rose-600"
            }`}
          >
            Absent
          </button>
        </span>
      ) : (
        user.reason && (
          <span className="ml-auto rounded-md border border-rose-300/40 bg-rose-50 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {user.reason}
          </span>
        )
      )}
    </div>
  );
}

// ---- the people views (what the switcher flips between) ----

function GroupedView({ going, postId }) {
  const { attendedOf } = useAttendance();
  const eff = (u) => attendedOf(postId, u);
  const unmarked = going.filter((u) => !eff(u));
  const present = going.filter((u) => eff(u) === "present");
  const absent = going.filter((u) => eff(u) === "absent");
  const anyMarked = present.length > 0 || absent.length > 0;
  if (!anyMarked) {
    return going.map((u) => <PersonLine key={u.id} user={u} postId={postId} />);
  }
  return (
    <div className="space-y-1">
      <StatusGroup dot={STATUS_DOT.unmarked} label="Unmarked" users={unmarked} postId={postId} open />
      <StatusGroup dot={STATUS_DOT.present} label="Present" users={present} postId={postId} />
      <StatusGroup dot={STATUS_DOT.absent} label="Absent" users={absent} postId={postId} />
    </div>
  );
}

function StatusGroup({ dot, label, users, postId, open }) {
  if (users.length === 0) return null;
  return (
    <details open={open} className="rounded-lg border border-border bg-background/60 px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label} <span className="text-faint">({users.length})</span>
      </summary>
      <div className="mt-1">
        {users.map((u) => (
          <PersonLine key={u.id} user={u} postId={postId} />
        ))}
      </div>
    </details>
  );
}

// Option B: stay collapsed - avatar stack + a present/absent/unmarked bar, and a
// "View everyone" reveal for the full list.
function SummaryView({ going, postId }) {
  const { attendedOf } = useAttendance();
  const present = going.filter((u) => attendedOf(postId, u) === "present").length;
  const absent = going.filter((u) => attendedOf(postId, u) === "absent").length;
  const unmarked = going.length - present - absent;
  const w = (n) => (going.length ? `${(n / going.length) * 100}%` : "0%");
  return (
    <div>
      <div className="flex items-center gap-3">
        <AvatarStack users={going} />
        <div className="flex h-2 min-w-[140px] flex-1 overflow-hidden rounded-full border border-border bg-background">
          <span className="bg-emerald-500" style={{ width: w(present) }} />
          <span className="bg-rose-500" style={{ width: w(absent) }} />
          <span className="bg-border-strong" style={{ width: w(unmarked) }} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT.present}`} /> Present {present}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT.absent}`} /> Absent {absent}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT.unmarked}`} /> Unmarked {unmarked}
        </span>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer list-none text-xs font-medium text-brand-dark hover:text-brand">
          View everyone ({going.length}) →
        </summary>
        <div className="mt-1">
          {going.map((u) => (
            <PersonLine key={u.id} user={u} postId={postId} showDot />
          ))}
        </div>
      </details>
    </div>
  );
}

function SearchView({ going, postId }) {
  const { attendedOf } = useAttendance();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const st = (u) => attendedOf(postId, u) || "unmarked";
  const counts = {
    all: going.length,
    present: going.filter((u) => st(u) === "present").length,
    absent: going.filter((u) => st(u) === "absent").length,
    unmarked: going.filter((u) => st(u) === "unmarked").length,
  };
  const shown = going.filter((u) => {
    if (filter !== "all" && st(u) !== filter) return false;
    if (q && !u.displayName.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const chips = [
    ["all", "All"],
    ["present", "Present"],
    ["absent", "Absent"],
    ["unmarked", "Unmarked"],
  ];
  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search this session…"
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
          shown.map((u) => <PersonLine key={u.id} user={u} postId={postId} showDot />)
        )}
      </div>
    </div>
  );
}

function SessionPeople({ going, view, postId }) {
  if (going.length === 0) return <p className="py-1 text-xs text-faint">nobody yet</p>;
  if (view === "summary") return <SummaryView going={going} postId={postId} />;
  if (view === "search") return <SearchView going={going} postId={postId} />;
  return <GroupedView going={going} postId={postId} />;
}

function SessionDisc({ session, view, postId }) {
  const { attendedOf } = useAttendance();
  const present = session.going.filter((u) => attendedOf(postId, u) === "present").length;
  const absent = session.going.filter((u) => attendedOf(postId, u) === "absent").length;
  return (
    <details className="rounded-lg border border-border bg-surface px-3.5 py-2.5">
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <span className="text-xs text-faint">▸</span>
        <span className="text-sm font-medium text-foreground">{session.label}</span>
        {session.dateLabel && <span className="text-xs text-muted">{session.dateLabel}</span>}
        <span className="ml-auto flex items-center gap-3">
          <AvatarStack users={session.going} />
          <span className="text-xs text-muted">
            <b
              className={
                session.going.length ? "text-emerald-600 dark:text-emerald-400" : "text-faint"
              }
            >
              {session.going.length}
            </b>{" "}
            going
            {present || absent ? ` · ${present} present · ${absent} absent` : ""}
          </span>
        </span>
      </summary>
      <div className="mt-2 border-t border-border pt-2 pl-5">
        <SessionPeople going={session.going} view={view} postId={postId} />
      </div>
    </details>
  );
}

function SeriesDisc({ group, view, postId }) {
  const going = group.sessions.reduce((n, s) => n + s.going.length, 0);
  return (
    <details className="rounded-xl border border-border bg-surface/60 px-3.5 py-2.5">
      <summary className="flex cursor-pointer list-none items-center gap-2.5">
        <span className="text-xs text-faint">▸</span>
        <span className="text-sm font-semibold text-foreground">{group.label}</span>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
          pick one
        </span>
        <span className="ml-auto text-xs">
          <b className={going ? "text-emerald-600 dark:text-emerald-400" : "text-faint"}>
            {going} going
          </b>
          {group.cant.length > 0 && (
            <span className="text-rose-600 dark:text-rose-400"> · {group.cant.length} can&apos;t attend</span>
          )}
        </span>
      </summary>
      <div className="mt-2.5 space-y-2 border-l-2 border-border-strong pl-3">
        {group.sessions.map((s) => (
          <SessionDisc key={s.id} session={s} view={view} postId={postId} />
        ))}
        {group.cant.length > 0 && (
          <div className="pt-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Can&apos;t attend this series ({group.cant.length})
            </p>
            {group.cant.map((u) => (
              <PersonLine key={u.id} user={u} />
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function PeopleDisc({ label, users, tone }) {
  if (users.length === 0) return null;
  const labelCls = tone === "rose" ? "text-rose-600 dark:text-rose-400" : "text-faint";
  return (
    <details className="rounded-lg border border-border bg-surface px-3.5 py-2.5">
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 text-xs font-semibold uppercase tracking-wider ${labelCls}`}
      >
        <span className="text-faint">▸</span>
        {label} <span className="text-faint">({users.length})</span>
      </summary>
      <div className="mt-1 pl-5">
        {users.map((u) => (
          <PersonLine key={u.id} user={u} />
        ))}
      </div>
    </details>
  );
}

function MeetingCard({ m, view, past }) {
  const { attendedOf } = useAttendance();
  // distinct going people across sessions, for the live top-of-card tally.
  const goingAll = [];
  const seen = new Set();
  for (const u of [...m.sessions.flatMap((s) => s.going), ...m.singleGoing]) {
    if (!seen.has(u.id)) {
      seen.add(u.id);
      goingAll.push(u);
    }
  }
  const present = goingAll.filter((u) => attendedOf(m.id, u) === "present").length;
  const absent = goingAll.filter((u) => attendedOf(m.id, u) === "absent").length;

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-border-strong hover:shadow-[6px_6px_0_0_rgba(15,23,42,0.9)] dark:hover:shadow-[6px_6px_0_0_rgba(56,138,221,0.45)]">
      {/* the header block (title + stats) opens the meeting; the drill-down below
          stays interactive. stretched link covers the header only. */}
      <div className="group relative flex flex-col gap-4 sm:flex-row sm:items-start">
        <Link
          href={`/portal/announcements/${m.id}?from=meetings`}
          aria-label={`Open ${m.title}`}
          className="absolute inset-0 rounded-lg"
        />
        <div className="min-w-0 sm:flex-[1_1_44%]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold tracking-tight text-foreground group-hover:text-brand">
              {m.title}
            </span>
            {m.mandatory && <Chip tone="mandatory">Mandatory</Chip>}
            {m.isSeries && <Chip tone="series">{m.seriesGroups.length} series</Chip>}
          </div>
          <p className="mt-1.5 text-sm text-muted">{m.metaLine}</p>
          {m.dueLabel && (
            <p className="mt-2">
              <Chip tone="due">Response needed by {m.dueLabel}</Chip>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-[1_1_56%]">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted">Responded</span>
            <span className="font-semibold text-foreground">
              {m.responded} / {m.invited} · {m.pct}%
            </span>
          </div>
          <Bar pct={m.pct} full={m.invited > 0 && m.responded >= m.invited} />
          <div className="flex flex-wrap items-center gap-2">
            <Stat tone="go" label="Going" value={m.goingCount} />
            {m.isSeries ? (
              <Stat tone="no" label="Can't attend a series" value={m.seriesCantCount} />
            ) : (
              <Stat tone="no" label="Can't make it" value={m.cantAll.length} />
            )}
            {(past || present > 0 || absent > 0) && (
              <>
                <Stat tone="pres" label="Present" value={present} />
                <Stat tone="abs" label="Absent" value={absent} />
              </>
            )}
            <Stat tone="na" label="No response" value={m.noResponse.length} />
          </div>
        </div>
      </div>

      <details className="mt-4 border-t border-border pt-3">
        <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wider text-muted">
          <span className="text-faint">▾</span> Per-{m.isSeries ? "series" : "session"} breakdown &amp; roll-call
        </summary>
        <div className="mt-3 space-y-2.5 border-l-2 border-border-strong pl-3">
          {m.isSeries ? (
            m.seriesGroups.map((g) => (
              <SeriesDisc key={g.id} group={g} view={view} postId={m.id} />
            ))
          ) : m.sessions.length > 0 ? (
            m.sessions.map((s) => (
              <SessionDisc key={s.id} session={s} view={view} postId={m.id} />
            ))
          ) : (
            <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Going ({m.singleGoing.length})
              </p>
              <div className="mt-1">
                <SessionPeople going={m.singleGoing} view={view} postId={m.id} />
              </div>
            </div>
          )}
          {!m.isSeries && <PeopleDisc label="Can't make it" users={m.cantAll} tone="rose" />}
          <PeopleDisc label="No response" users={m.noResponse} />
        </div>
      </details>
    </div>
  );
}
