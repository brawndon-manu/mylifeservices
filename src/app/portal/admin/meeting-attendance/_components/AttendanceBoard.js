import Link from "next/link";
import Avatar from "@/components/Avatar";

// the meeting-attendance report: one read-only summary card per Company Meeting
// (attending / no-response / can't-make-it face stacks). clicking a card opens
// its dedicated page, where the full drill-down + roll-call + override live.
export default function AttendanceBoard({ upcoming, past, counts }) {
  return (
    <>
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
                  <MeetingCard key={m.id} m={m} />
                ))}
              </div>
            </>
          )}
          {past.length > 0 && (
            <>
              <SectionLabel>Past</SectionLabel>
              <div className="space-y-3.5 opacity-70">
                {past.map((m) => (
                  <MeetingCard key={m.id} m={m} past />
                ))}
              </div>
            </>
          )}
        </>
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

function AvatarStack({ users, max = 8 }) {
  if (users.length === 0) {
    return <span className="text-xs text-faint">nobody</span>;
  }
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className="flex items-center">
      <span className="flex">
        {shown.map((u) => (
          <span key={u.id} className="-ml-2 rounded-full ring-2 ring-surface first:ml-0">
            <Avatar name={u.displayName} image={u.image} size={26} />
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

// one summary section on a card: a label + count badge, the face stack, and (for
// Attending) a read-only present/absent/unmarked bar + legend.
function SummarySection({ label, tone, count, people, roll }) {
  const labelCls =
    tone === "rose"
      ? "text-rose-600 dark:text-rose-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted";
  const w = (n) => (roll && roll.total ? `${(n / roll.total) * 100}%` : "0%");
  return (
    <div className="mt-4 first:mt-0">
      <div className="flex items-center gap-2">
        <span className={`text-xs font-semibold uppercase tracking-wider ${labelCls}`}>
          {label}
        </span>
        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-foreground">
          {count}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3.5">
        <AvatarStack users={people} />
        {roll && roll.total > 0 && (
          <div className="flex h-2 min-w-[140px] max-w-[320px] flex-1 overflow-hidden rounded-full border border-border bg-background">
            <span className="bg-emerald-500" style={{ width: w(roll.present) }} />
            <span className="bg-rose-500" style={{ width: w(roll.absent) }} />
            <span className="bg-border-strong" style={{ width: w(roll.unmarked) }} />
          </div>
        )}
      </div>
      {roll && roll.total > 0 && (
        <div className="mt-2 flex flex-wrap gap-3.5 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT.present}`} /> Present {roll.present}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT.absent}`} /> Absent {roll.absent}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT.unmarked}`} /> Unmarked {roll.unmarked}
          </span>
        </div>
      )}
    </div>
  );
}

function MeetingCard({ m }) {
  const s = m.summary;
  return (
    <Link
      href={`/portal/admin/meeting-attendance/${m.id}`}
      className="group block rounded-xl border border-border bg-surface p-5 shadow-sm card-lift"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 sm:flex-[1_1_46%]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold tracking-tight text-foreground transition group-hover:text-brand dark:group-hover:text-brand-light">
              {m.title}
            </span>
            {m.mandatory && <Chip tone="mandatory">Mandatory</Chip>}
            {m.isSeries && <Chip tone="series">{m.seriesCount} series</Chip>}
          </div>
          <p className="mt-1.5 text-sm text-muted">{m.metaLine}</p>
          {m.dueLabel && (
            <p className="mt-2">
              <Chip tone="due">Response needed by {m.dueLabel}</Chip>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-[1_1_54%]">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted">Responded</span>
            <span className="font-semibold text-foreground">
              {m.responded} / {m.invited} · {m.pct}%
            </span>
          </div>
          <Bar pct={m.pct} full={m.invited > 0 && m.responded >= m.invited} />
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <SummarySection
          label="Attending"
          count={s.attendingCount}
          people={s.attendingPeople}
          roll={{ total: s.attendingSessions, present: s.present, absent: s.absent, unmarked: s.unmarked }}
        />
        <SummarySection label="No response" tone="faint" count={s.noResponseCount} people={s.noResponsePeople} />
        <SummarySection
          label={s.cantLabel}
          tone={m.isSeries ? "amber" : "rose"}
          count={s.cantCount}
          people={s.cantPeople}
        />
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-faint">
        <span aria-hidden>▸</span> Open the full breakdown &amp; take roll-call
      </p>
    </Link>
  );
}
