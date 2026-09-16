import Link from "next/link";
import { redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";

export const metadata = {
  title: "July Timesheets Mock",
  robots: { index: false, follow: false },
};

const VIEWS = [
  { key: "overview", label: "Overview mock" },
  { key: "queue", label: "Queue mock" },
];

const SECTION_NAV = [
  { key: "overview", label: "Overview", note: "period state + blockers" },
  { key: "queue", label: "Queue", note: "who needs attention first" },
  { key: "premiums", label: "Premiums", note: "evidence + penalty logic" },
  { key: "payroll", label: "Payroll", note: "payout report + exports" },
  { key: "signed", label: "Signed", note: "returned records" },
];

const PEOPLE = [
  {
    id: "marisol-d",
    name: "Marisol Diaz",
    initials: "MD",
    state: "Needs answer",
    tone: "amber",
    stage: "Sent Jul 31",
    hours: "74.50",
    premium: "2.00",
    summary: "One break question is still open, so her premium may fall after she confirms.",
    next: "Call about Jul 24 lunch",
    tags: ["1 answer pending", "Projected premium may change"],
    detail:
      "This mock moves her into a single queue row with one next step instead of spreading her state across five badges and three links.",
  },
  {
    id: "owen-r",
    name: "Owen Rivera",
    initials: "OR",
    state: "Needs match",
    tone: "rose",
    stage: "Not sent",
    hours: "68.00",
    premium: "0.00",
    summary: "The sheet is clean, but it is still blocked because nobody has matched the export name to a portal account.",
    next: "Match employee account",
    tags: ["Send blocker", "No portal account"],
    detail:
      "This is a good example of something that should be loud on the queue and almost invisible everywhere else. It is a routing problem, not a payroll problem.",
  },
  {
    id: "tiana-s",
    name: "Tiana Scott",
    initials: "TS",
    state: "Reported problem",
    tone: "violet",
    stage: "Signed Aug 2",
    hours: "81.25",
    premium: "3.00",
    summary: "She signed, then reported a missing shift. Her row should stay in the queue until somebody resolves it.",
    next: "Review correction",
    tags: ["Correction open", "Hold resend"],
    detail:
      "The current layout makes this feel like one more badge among many. In the mock it reads as a single blocked state with one action door.",
  },
  {
    id: "caleb-j",
    name: "Caleb Johnson",
    initials: "CJ",
    state: "Ready",
    tone: "emerald",
    stage: "Ready to send",
    hours: "72.00",
    premium: "0.00",
    summary: "Matched, built, and clear. He should not visually compete with people who need a human decision.",
    next: "No action needed",
    tags: ["Clean", "Can send now"],
    detail:
      "Rows like this are where the current screen feels busiest than it needs to. Ready people should collapse into a quieter visual treatment.",
  },
  {
    id: "imani-k",
    name: "Imani Kelly",
    initials: "IK",
    state: "Needs review",
    tone: "sky",
    stage: "Signed Aug 3",
    hours: "77.75",
    premium: "1.00",
    summary: "Signed and waiting on management sign-off. Useful to track, but it belongs behind a dedicated signed workflow instead of on every overview.",
    next: "Approve signed sheet",
    tags: ["Signed", "Awaiting approval"],
    detail:
      "This is intentionally calmer than a blocker state. It matters, but it should not read as the same severity as an unresolved correction.",
  },
  {
    id: "lena-p",
    name: "Lena Park",
    initials: "LP",
    state: "Needs decision",
    tone: "amber",
    stage: "Checks flagged",
    hours: "79.00",
    premium: "4.00",
    summary: "Two penalty days are still resting on a person decision. The overview should show that plainly without making you open three separate screens first.",
    next: "Open premium evidence",
    tags: ["2 penalty days open", "Human ruling needed"],
    detail:
      "This mock gives premium uncertainty one clear lane instead of repeating similar warnings across overview, checks, stats, and payout.",
  },
];

const BLOCKERS = [
  {
    label: "Unmatched employees",
    value: "2",
    note: "They are ready otherwise, but nothing can send until they belong to an account.",
    tone: "rose",
  },
  {
    label: "Answers still pending",
    value: "5",
    note: "These are the only people who can still move premium hours down.",
    tone: "amber",
  },
  {
    label: "Corrections open",
    value: "1",
    note: "A signed sheet is on hold because the person says the record is wrong.",
    tone: "violet",
  },
];

const METRICS = [
  { label: "People in batch", value: "59", sub: "July 16 to July 31, 2026" },
  { label: "Ready to send", value: "41", sub: "quiet rows, no review needed" },
  { label: "Already sent", value: "12", sub: "returned to Signed workflow" },
  { label: "Still blocked", value: "6", sub: "the queue should revolve around these" },
];

const MOVED_AWAY = [
  "Premium evidence and penalty reasoning move under one dedicated Premiums section.",
  "Signed and approved records move out of the landing page and into Signed.",
  "Payroll exports and payout totals live under Payroll instead of sharing space with sending.",
];

export default async function JulyMockPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const sp = await searchParams;
  const view = VIEWS.some((item) => item.key === sp?.view) ? sp.view : "overview";
  const selectedId = PEOPLE.some((person) => person.id === sp?.person)
    ? sp.person
    : PEOPLE[0].id;
  const selected = PEOPLE.find((person) => person.id === selectedId) || PEOPLE[0];

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin/timesheets">Back to Timesheets</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        July rehearsal · HTML mock
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            July 16 to July 31 overview rethink
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted">
            A mock for the July flow only. Nothing here writes, sends, or edits data.
            The goal is to make the batch screen feel like one workspace instead of
            five stacked dashboards competing for attention.
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
          <p className="font-semibold">Mock only</p>
          <p className="mt-1 text-xs">
            Buttons and counts are visual. No emails. No live actions.
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-1.5 border-b border-border">
        {VIEWS.map((item) => (
          <Link
            key={item.key}
            href={`/portal/admin/timesheets/july-mock?view=${item.key}${item.key === "queue" ? `&person=${selected.id}` : ""}`}
            className={`-mb-px rounded-t-xl border border-b-0 px-4 py-2.5 text-sm font-semibold transition ${
              view === item.key
                ? "border-border-strong bg-surface text-foreground"
                : "border-transparent bg-surface-2 text-muted hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="rounded-b-2xl border border-t-0 border-border-strong bg-surface p-6">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-4 dark:from-sky-950/20 dark:via-surface dark:to-emerald-950/20">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-faint">
            Proposed batch navigation
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-5">
            {SECTION_NAV.map((section) => {
              const active =
                (view === "overview" && section.key === "overview") ||
                (view === "queue" && section.key === "queue");
              return (
                <div
                  key={section.key}
                  className={`rounded-xl border px-3 py-3 ${
                    active
                      ? "border-brand bg-white shadow-sm dark:bg-surface-2"
                      : "border-border bg-white/70 dark:bg-surface/60"
                  }`}
                >
                  <p className={`text-sm font-semibold ${active ? "text-foreground" : "text-muted"}`}>
                    {section.label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-faint">{section.note}</p>
                </div>
              );
            })}
          </div>
        </div>

        {view === "overview" ? <OverviewView /> : <QueueView selected={selected} />}
      </div>
    </section>
  );
}

function OverviewView() {
  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-faint">
                Period state
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                Safe to work from this upload
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                The mock makes one thing dominant here: is this the current batch, is it
                locked, and what still blocks sending. The rest of the reporting moves out
                of the landing page instead of repeating itself above and below the queue.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Pill tone="emerald">Current upload</Pill>
              <Pill tone="sky">Locked Jul 31, 8:14 PM</Pill>
              <Pill tone="slate">59 employees</Pill>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            {METRICS.map((metric) => (
              <div key={metric.label} className="rounded-xl border border-border bg-surface-2 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {metric.label}
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                  {metric.value}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-faint">{metric.sub}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-border bg-surface-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Send readiness</p>
                <p className="mt-1 text-sm text-muted">
                  One primary message instead of separate send, warning, and stats blocks.
                </p>
              </div>
              <div className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
                41 ready now
              </div>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full w-[69%] rounded-full bg-gradient-to-r from-sky-500 to-emerald-500" />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted">
              <span>12 already sent</span>
              <span>6 blocked</span>
              <span>41 ready</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled
                className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white opacity-80"
              >
                Send ready people
              </button>
              <button
                type="button"
                disabled
                className="rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-muted"
              >
                Review blockers first
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-faint">
              Open blockers
            </p>
            <div className="mt-4 space-y-3">
              {BLOCKERS.map((blocker) => (
                <div key={blocker.label} className={`rounded-xl border p-4 ${toneCard(blocker.tone)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{blocker.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted">{blocker.note}</p>
                    </div>
                    <span className="text-2xl font-semibold tracking-tight text-foreground">
                      {blocker.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-faint">
              What moves off this page
            </p>
            <ul className="mt-4 space-y-3">
              {MOVED_AWAY.map((line) => (
                <li key={line} className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm leading-relaxed text-muted">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-faint">
              Queue preview
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              The landing page should point you toward people, not explain everything itself
            </h2>
          </div>
          <Link
            href="/portal/admin/timesheets/july-mock?view=queue&person=marisol-d"
            className="rounded-md border border-border-strong px-4 py-2 text-sm font-semibold text-brand transition hover:border-brand"
          >
            Open the queue mock →
          </Link>
        </div>

        <div className="mt-5 space-y-3">
          {PEOPLE.slice(0, 4).map((person) => (
            <QueueRow key={person.id} person={person} compact />
          ))}
        </div>
      </div>
    </div>
  );
}

function QueueView({ selected }) {
  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <div>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-faint">
                Proposed queue
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                One row, one state, one next action
              </h2>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <FilterChip active>Blocked 6</FilterChip>
              <FilterChip>Ready 41</FilterChip>
              <FilterChip>Signed 12</FilterChip>
              <FilterChip>Approved 7</FilterChip>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {PEOPLE.map((person) => (
              <QueueRow key={person.id} person={person} href={`/portal/admin/timesheets/july-mock?view=queue&person=${person.id}`} active={person.id === selected.id} />
            ))}
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-faint">
            Selected person
          </p>
          <div className="mt-4 flex items-start gap-3">
            <Avatar initials={selected.initials} />
            <div>
              <h3 className="text-xl font-semibold tracking-tight text-foreground">
                {selected.name}
              </h3>
              <p className="mt-1 text-sm text-muted">{selected.stage}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Pill tone={selected.tone}>{selected.state}</Pill>
                <Pill tone="slate">{selected.hours} hrs</Pill>
                <Pill tone="slate">{selected.premium} premium</Pill>
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted">{selected.summary}</p>
          <div className="mt-4 rounded-xl border border-border bg-surface-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Why this layout is calmer
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{selected.detail}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-faint">
            Next action panel
          </p>
          <h3 className="mt-2 text-lg font-semibold text-foreground">{selected.next}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The current screens often make the user interpret several badges before they
            know what to do. This side panel turns the selected row into a single work
            instruction.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled
              className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white opacity-80"
            >
              Open work item
            </button>
            <button
              type="button"
              disabled
              className="rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-muted"
            >
              View raw details
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-faint">
            What stays hidden until needed
          </p>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
            <li className="rounded-xl border border-border bg-surface-2 px-4 py-3">
              Source-document links and premium reasoning move into a secondary details layer.
            </li>
            <li className="rounded-xl border border-border bg-surface-2 px-4 py-3">
              Signed and approved history becomes a workflow state, not a second status stack.
            </li>
            <li className="rounded-xl border border-border bg-surface-2 px-4 py-3">
              Phone, notes, and flags still exist, but they stop overpowering the queue itself.
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

function QueueRow({ person, href, active = false, compact = false }) {
  const content = (
    <div
      className={`rounded-2xl border p-4 transition ${
        active
          ? "border-brand bg-sky-50/60 shadow-sm dark:bg-sky-950/10"
          : "border-border bg-surface-2"
      }`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <Avatar initials={person.initials} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-foreground">{person.name}</p>
            <Pill tone={person.tone}>{person.state}</Pill>
          </div>
          <p className="mt-1 text-sm text-muted">{person.summary}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {person.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border-strong bg-white px-2.5 py-1 text-[11px] font-medium text-muted dark:bg-surface"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="ml-auto flex min-w-[9rem] flex-col items-end gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">{person.stage}</p>
          <div className="text-right">
            <p className="text-lg font-semibold tracking-tight text-foreground">{person.hours} hrs</p>
            <p className="text-xs text-muted">{person.premium} premium</p>
          </div>
          <span className="rounded-md border border-border-strong px-3 py-1.5 text-xs font-semibold text-brand">
            {compact ? "Focus row" : person.next}
          </span>
        </div>
      </div>
    </div>
  );

  if (!href) return content;

  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}

function Avatar({ initials }) {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-emerald-500 text-sm font-semibold text-white shadow-sm">
      {initials}
    </div>
  );
}

function Pill({ children, tone }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tonePill(tone)}`}>
      {children}
    </span>
  );
}

function FilterChip({ children, active = false }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 ${
        active
          ? "border-brand bg-brand/10 text-brand"
          : "border-border-strong bg-surface-2 text-muted"
      }`}
    >
      {children}
    </span>
  );
}

function tonePill(tone) {
  if (tone === "rose") {
    return "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300";
  }
  if (tone === "amber") {
    return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300";
  }
  if (tone === "violet") {
    return "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300";
  }
  if (tone === "sky") {
    return "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300";
  }
  if (tone === "emerald") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300";
  }
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

function toneCard(tone) {
  if (tone === "rose") {
    return "border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/20";
  }
  if (tone === "amber") {
    return "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/20";
  }
  if (tone === "violet") {
    return "border-violet-200 bg-violet-50 dark:border-violet-900/60 dark:bg-violet-950/20";
  }
  return "border-border bg-surface-2";
}
