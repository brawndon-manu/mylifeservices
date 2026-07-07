"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
} from "react";
import Avatar from "@/components/Avatar";
import NameHover from "@/components/NameHover";
import {
  markAttendance,
  adminMoveSession,
  adminRemoveFromMeeting,
  adminAddToSession,
  adminSetGoing,
  adminSetCantMake,
  adminRecordChoices,
  adminAddInvitee,
  adminRemoveInvitee,
} from "@/app/portal/announcements/actions";
import {
  PersonKebab,
  AddToSession,
  RecordResponse,
  InviteeManager,
  OverrideProvider,
  OverrideToggle,
} from "@/app/portal/announcements/_components/RosterAdmin";

// the full per-meeting breakdown (series -> session -> people), the roll-call,
// and the admin override toolkit. lives on the dedicated meeting page; the report
// cards are read-only summaries that link here.
const VIEWS = [
  { key: "grouped", label: "Grouped" },
  { key: "summary", label: "Summary" },
  { key: "search", label: "Searchable" },
];
const STORE_KEY = "mls-attendance-view";

// optimistic roll-call: a mark shows instantly, then saves in the background.
// attendance defaults to NEUTRAL (null) - nobody reads as absent until marked.
const AttendanceCtx = createContext(null);
const useAttendance = () => useContext(AttendanceCtx);

// the meeting's override-toolkit data (sessions, invited audience, series groups)
// so a control deep in a view can reach it without threading props.
const ToolsCtx = createContext(null);
const useTools = () => useContext(ToolsCtx);

export default function MeetingBreakdown({ m }) {
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

  // keyed by post + user + session (optionId), since roll-call is per session.
  const attendedOf = (postId, user) => {
    const key = `${postId}:${user.id}:${user.optionId || ""}`;
    return key in marks ? marks[key] : user.attended || null;
  };
  const mark = (postId, userId, status, optionId = null) => {
    const value = status === "present" || status === "absent" ? status : null;
    setMarks((prev) => ({ ...prev, [`${postId}:${userId}:${optionId || ""}`]: value }));
    startTransition(async () => {
      try {
        await markAttendance(postId, userId, status, optionId);
      } catch {}
    });
  };

  const tools = {
    postId: m.id,
    toolSessions: m.toolSessions || [],
    hasSessions: m.hasSessions,
    isSeries: m.isSeries,
    audience: m.audience || [],
    recordSeriesGroups: (m.seriesGroups || []).map((g) => ({
      id: g.id,
      label: g.label,
      options: g.sessions.map((s) => ({ id: s.id, label: s.label })),
    })),
  };

  return (
    <OverrideProvider>
      <AttendanceCtx.Provider value={{ attendedOf, mark }}>
        <ToolsCtx.Provider value={tools}>
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
            <OverrideToggle />
          </div>

          <div className="mt-4 space-y-2.5">
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
                  Attending ({m.singleGoing.length})
                </p>
                <div className="mt-1">
                  <SessionPeople going={m.singleGoing} view={view} postId={m.id} />
                </div>
              </div>
            )}
            {!m.isSeries && <PeopleDisc label="Can't make it" users={m.cantAll} tone="rose" />}
            <PeopleDisc label="No response" users={m.noResponse} record />
          </div>

          <InviteeManager
            postId={m.id}
            added={m.addedInvitees || []}
            candidates={m.inviteeCandidates || []}
            add={adminAddInvitee}
            remove={adminRemoveInvitee}
          />
        </ToolsCtx.Provider>
      </AttendanceCtx.Provider>
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

const STATUS_DOT = {
  present: "bg-emerald-500",
  absent: "bg-rose-500",
  unmarked: "bg-amber-400",
};

// a person row. with postId it shows live Present/Absent roll-call buttons
// (going people) plus the override kebab; without it, it's read-only.
function PersonLine({ user, postId, showDot, extra }) {
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
        // going row: roll-call is always visible; the kebab (move / remove) only
        // shows once Manual override is on.
        <span className="ml-auto flex flex-none items-center gap-1.5">
          <button
            type="button"
            onClick={() => mark(postId, user.id, att === "present" ? "" : "present", user.optionId)}
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
            onClick={() => mark(postId, user.id, att === "absent" ? "" : "absent", user.optionId)}
            className={`${rollBtn} ${
              att === "absent"
                ? "border-rose-500 bg-rose-500 text-white"
                : "border-border-strong text-muted hover:border-rose-500 hover:text-rose-600"
            }`}
          >
            Absent
          </button>
          <GoingKebab user={user} />
        </span>
      ) : extra ? (
        <span className="ml-auto flex flex-none items-center gap-1.5">{extra}</span>
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

// ---- admin override controls (self-gate on the Manual override toggle) ----

function GoingKebab({ user }) {
  const t = useTools();
  if (!t) return null;
  return (
    <PersonKebab
      postId={t.postId}
      userId={user.id}
      currentOptionId={user.optionId || null}
      moveTargets={t.toolSessions.filter((s) => s.id !== (user.optionId || null))}
      move={adminMoveSession}
      remove={adminRemoveFromMeeting}
    />
  );
}

function SessionAdd({ session }) {
  const t = useTools();
  if (!t) return null;
  return (
    <div className="pt-1">
      <AddToSession
        postId={t.postId}
        optionId={session.id}
        candidates={t.audience.filter((a) => !session.going.some((u) => u.id === a.id))}
        add={adminAddToSession}
      />
    </div>
  );
}

function NoResponseRecord({ user }) {
  const t = useTools();
  if (!t) return null;
  return (
    <RecordResponse
      postId={t.postId}
      userId={user.id}
      sessions={t.toolSessions}
      hasSessions={t.hasSessions}
      isSeries={t.isSeries}
      seriesGroups={t.recordSeriesGroups}
      addToSession={adminAddToSession}
      setGoing={adminSetGoing}
      cantMake={adminSetCantMake}
      record={adminRecordChoices}
    />
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
            attending
            {present || absent ? ` · ${present} present · ${absent} absent` : ""}
          </span>
        </span>
      </summary>
      <div className="mt-2 border-t border-border pt-2 pl-5">
        <SessionPeople going={session.going} view={view} postId={postId} />
        <SessionAdd session={session} />
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
            {going} attending
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

function PeopleDisc({ label, users, tone, record }) {
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
          <PersonLine
            key={u.id}
            user={u}
            extra={record ? <NoResponseRecord user={u} /> : null}
          />
        ))}
      </div>
    </details>
  );
}
