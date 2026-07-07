import Link from "next/link";
import Avatar from "@/components/Avatar";

// the acknowledgments report: one read-only summary card per ack-required
// announcement (acknowledged / not-yet face stacks). clicking a card opens its
// dedicated page, where the full list + mark-acknowledged override live.
export default function AckBoard({ posts, counts }) {
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
      </div>

      {counts.total === 0 ? (
        <p className="mt-10 rounded-xl border border-border bg-surface p-6 text-sm text-muted">
          No announcements need acknowledgment yet. Turn on &quot;require
          acknowledgment&quot; when posting and it will show up here.
        </p>
      ) : (
        <div className="mt-8 space-y-3.5">
          {posts.map((p) => (
            <AckCard key={p.id} p={p} />
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

function MailIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function MonitorIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

function AckCard({ p }) {
  const s = p.summary;
  return (
    <Link
      href={`/portal/admin/acknowledgments/${p.id}`}
      className="group block rounded-xl border border-border bg-surface p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-border-strong hover:shadow-[6px_6px_0_0_rgba(15,23,42,0.9)] dark:hover:shadow-[6px_6px_0_0_rgba(56,138,221,0.45)]"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 sm:flex-[1_1_46%]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-base font-semibold tracking-tight text-foreground transition group-hover:text-brand dark:group-hover:text-brand-light">
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

        <div className="flex flex-col gap-2.5 sm:flex-[1_1_54%]">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted">Acknowledged</span>
            <span className="font-semibold text-foreground">
              {p.acked} / {p.expected} · {p.pct}%
            </span>
          </div>
          <Bar pct={p.pct} full={p.expected > 0 && p.notYetCount === 0} />
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Acknowledged
            </span>
            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-foreground">
              {s.ackedCount}
            </span>
          </div>
          <div className="mt-2">
            <AvatarStack users={s.ackedPeople} />
          </div>
          {s.ackedCount > 0 && (
            <div className="mt-2 flex flex-wrap gap-3.5 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <MonitorIcon className="h-3.5 w-3.5" /> in portal {s.inPortal}
              </span>
              <span className="flex items-center gap-1.5">
                <MailIcon className="h-3.5 w-3.5" /> via email {s.viaEmail}
              </span>
            </div>
          )}
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Not yet
            </span>
            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-foreground">
              {s.notYetCount}
            </span>
          </div>
          <div className="mt-2">
            {s.notYetCount === 0 ? (
              <span className="text-xs text-faint">everyone&apos;s in</span>
            ) : (
              <AvatarStack users={s.notYetPeople} />
            )}
          </div>
        </div>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-faint">
        <span aria-hidden>▸</span> Open the full list &amp; nudge the stragglers
      </p>
    </Link>
  );
}
