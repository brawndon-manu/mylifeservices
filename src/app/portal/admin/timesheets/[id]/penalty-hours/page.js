import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import BackLink from "@/components/BackLink";

export const metadata = { title: "Penalty hours", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const f2 = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// The two questions a premium has to answer, in the words of the source that
// decided it. These are read straight off the stored day - nothing is re-derived
// here, so what this page says is what the engine actually did.
function mealWhy(d) {
  if (!d.mealViolation) return null;
  if (d.mealLate) return "meal started after the fifth hour";
  if (d.mealScheduled === true) return "a meal was rostered but none was punched";
  if (d.mealScheduled === false) return "the schedule rostered no meal period";
  return "no schedule covers the day";
}
function restWhy(d) {
  if (!d.restViolation) return null;
  if (d.restSource === "none") return "not in the Rest Periods Report";
  return `report shows ${d.restTaken ?? 0} of ${d.restRequired}`;
}

// "07/16/26" -> "7/16". The year is in the page title; repeating it 700 times
// costs width that the dates themselves need.
const short = (dt) => String(dt).replace(/^0?(\d+)\/0?(\d+)\/\d+$/, "$1/$2");

// One date somebody is owed for. Half-and-half means a meal AND a rest premium
// on the same day, which is common enough that collapsing it to one colour
// would under-report the day.
//
// Ink is pure black on both fills: on the light meal step that measures 4.76:1,
// which clears the 4.5:1 small-text floor. Near-black came in at 4.45 and would
// not have.
function DateChip({ day, who }) {
  const both = day.meal && day.rest;
  const background = both
    ? "linear-gradient(90deg, var(--pen-meal) 50%, var(--pen-rest) 50%)"
    : day.meal
      ? "var(--pen-meal)"
      : "var(--pen-rest)";
  return (
    <span
      title={`${who} ${day.date} - ${[day.meal, day.rest].filter(Boolean).join(" | ")}`}
      className="rounded-[3px] px-1.5 py-[3px] text-[9.5px] font-medium leading-none tabular-nums text-black"
      style={{ background }}
    >
      {short(day.date)}
    </span>
  );
}

// bars are capped rather than filling their slot, and every one carries a
// visible number - the yellow step sits under 3:1 on the light surface, so the
// label is what makes it readable rather than the fill
function Bar({ pct, color, rounded }) {
  return (
    <div
      className={`h-full ${rounded}`}
      style={{ width: `${pct}%`, backgroundColor: color, minWidth: pct > 0 ? "2px" : 0 }}
    />
  );
}

export default async function PenaltyHoursPage({ params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");
  const { id } = await params;

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    include: {
      timesheets: {
        orderBy: { sourceName: "asc" },
        include: {
          user: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
        },
      },
    },
  });
  if (!batch) notFound();

  const byDate = new Map();
  const reasons = new Map();
  const people = [];
  let meal = 0;
  let rest = 0;

  for (const t of batch.timesheets) {
    const days = [];
    let m = 0;
    let r = 0;
    for (const d of t.data?.days || []) {
      const mw = mealWhy(d);
      const rw = restWhy(d);
      if (!mw && !rw) continue;
      if (mw) { m++; meal++; reasons.set(`meal|${mw}`, (reasons.get(`meal|${mw}`) || 0) + 1); }
      if (rw) { r++; rest++; reasons.set(`rest|${rw}`, (reasons.get(`rest|${rw}`) || 0) + 1); }
      const e = byDate.get(d.date) || { date: d.date, meal: 0, rest: 0 };
      if (mw) e.meal++;
      if (rw) e.rest++;
      byDate.set(d.date, e);
      days.push({ date: d.date, hours: d.paidHours, meal: mw, rest: rw });
    }
    if (days.length) {
      people.push({
        id: t.id,
        name: t.user ? preferredName(t.user) : t.sourceName,
        meal: m, rest: r, total: m + r, days,
      });
    }
  }

  const days = [...byDate.values()].sort((a, b) => {
    const [am, ad] = a.date.split("/").map(Number);
    const [bm, bd] = b.date.split("/").map(Number);
    return am - bm || ad - bd;
  }).map((e) => {
    const [mm, dd, yy] = e.date.split("/").map(Number);
    const dt = new Date(2000 + yy, mm - 1, dd);
    return { ...e, dow: DOW[dt.getDay()], label: `${mm}/${dd}`, weekend: dt.getDay() % 6 === 0 };
  });
  people.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const reasonRows = [...reasons.entries()]
    .map(([k, n]) => ({ kind: k.split("|")[0], text: k.slice(k.indexOf("|") + 1), n }))
    .sort((a, b) => b.n - a.n);

  const total = meal + rest;
  const maxDay = Math.max(1, ...days.map((x) => x.meal + x.rest));
  // round the axis up to a clean number above the worst day
  const top = Math.ceil(maxDay / 20) * 20;
  const maxReason = Math.max(1, ...reasonRows.map((r) => r.n));
  const H = 190;

  const legend = (
    <div className="flex items-center gap-4 text-xs text-muted">
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: "var(--pen-meal)" }} />
        Meal
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: "var(--pen-rest)" }} />
        Rest
      </span>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <BackLink href={`/portal/admin/timesheets/${batch.id}`}>Back to the batch</BackLink>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-accent">Penalty hours</p>
      <h1 className="mt-1 text-3xl font-bold text-foreground">
        {batch.periodFrom} to {batch.periodTo}
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        One hour per workday for a missed meal period and one for missed rest breaks, max one of
        each per day, under California Labor Code 226.7. Every hour below is owed on top of hours
        worked.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <span className="block text-3xl font-bold leading-none text-foreground">{f2(total)}</span>
          <span className="mt-1 block text-sm font-bold text-foreground">Penalty hours owed</span>
          <span className="mt-1 block text-xs text-muted">
            On top of {batch.timesheets.length}{" "}people&apos;s hours worked.
          </span>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <span className="block text-3xl font-bold leading-none text-foreground">{f2(meal)}</span>
          <span className="mt-1 flex items-center gap-2 text-sm font-bold text-foreground">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: "var(--pen-meal)" }} />
            Meal period premiums
          </span>
          <span className="mt-1 block text-xs text-muted">
            {meal} days with no meal period, or one that started too late.
          </span>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <span className="block text-3xl font-bold leading-none text-foreground">{f2(rest)}</span>
          <span className="mt-1 flex items-center gap-2 text-sm font-bold text-foreground">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: "var(--pen-rest)" }} />
            Rest break premiums
          </span>
          <span className="mt-1 block text-xs text-muted">
            {rest} days short at least one rest break.
          </span>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <span className="block text-3xl font-bold leading-none text-foreground">
            {people.length}
            <span className="text-lg text-faint"> of {batch.timesheets.length}</span>
          </span>
          <span className="mt-1 block text-sm font-bold text-foreground">People affected</span>
          <span className="mt-1 block text-xs text-muted">
            {batch.timesheets.length - people.length} came through the period with none.
          </span>
        </div>
      </div>

      {/* ---------- every day ---------- */}
      <section className="mt-6 rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">Every day of the period</h2>
            <p className="mt-1 text-xs text-muted">
              Penalty hours falling on each date. Weekend dates are greyed.
            </p>
          </div>
          {legend}
        </div>

        <div className="mt-7 pl-8">
          <div className="relative flex items-end gap-1.5">
            {[0, top / 2, top].map((tick) => (
              <div
                key={tick}
                className="absolute inset-x-0 h-px bg-border"
                style={{ bottom: `${(tick / top) * H}px` }}
              >
                <span className="absolute -top-2 right-full mr-2 text-[10px] tabular-nums text-faint">
                  {tick}
                </span>
              </div>
            ))}
            {days.map((x) => {
              const tot = x.meal + x.rest;
              return (
                <div key={x.date} className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div
                    className="relative mx-auto flex w-6 flex-col justify-end"
                    style={{ height: `${H}px` }}
                    title={`${x.label} ${x.dow} - ${x.meal} meal, ${x.rest} rest, ${tot} penalty hours`}
                  >
                    {tot === maxDay && (
                      <span className="absolute -top-4 w-full text-center text-[11px] tabular-nums text-foreground">
                        {tot}
                      </span>
                    )}
                    <div
                      className="mb-0.5 rounded-t"
                      style={{ height: `${(x.rest / top) * H}px`, backgroundColor: "var(--pen-rest)" }}
                    />
                    <div
                      style={{ height: `${(x.meal / top) * H}px`, backgroundColor: "var(--pen-meal)" }}
                    />
                  </div>
                  <div className={`text-center text-[10px] leading-tight ${x.weekend ? "text-faint" : "text-muted"}`}>
                    {x.dow}
                    <span className="block text-[9px] opacity-70">{x.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- why ---------- */}
      <section className="mt-6 rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">Why they are owed</h2>
            <p className="mt-1 text-xs text-muted">
              Every one of the {total} hours, grouped by the reason behind it.
            </p>
          </div>
          {legend}
        </div>
        <div className="mt-4 space-y-1">
          {reasonRows.map((r) => (
            <div key={`${r.kind}-${r.text}`} className="grid grid-cols-[minmax(0,1fr)_2fr_2.5rem] items-center gap-3 sm:grid-cols-[18rem_1fr_2.5rem]">
              <div className="truncate text-right text-xs text-foreground" title={r.text}>{r.text}</div>
              <div className="flex h-3">
                <Bar
                  pct={(r.n / maxReason) * 100}
                  color={r.kind === "meal" ? "var(--pen-meal)" : "var(--pen-rest)"}
                  rounded="rounded-sm"
                />
              </div>
              <div className="text-right text-xs tabular-nums text-foreground">{r.n}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- who, and their days ---------- */}
      <section className="mt-6 rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">Who carries them</h2>
            <p className="mt-1 text-xs text-muted">
              All {people.length} people with a penalty, most first, and every date they are owed
              for. Hover a date for what was missed that day.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: "var(--pen-meal)" }} />
              Meal
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: "var(--pen-rest)" }} />
              Rest
            </span>
            <span className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-sm"
                style={{ background: "linear-gradient(90deg, var(--pen-meal) 50%, var(--pen-rest) 50%)" }}
              />
              Both
            </span>
          </div>
        </div>

        <div className="mt-4 divide-y divide-border/60">
          {people.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[minmax(0,1fr)_2.25rem] items-start gap-x-3 gap-y-1 py-1.5 sm:grid-cols-[9.5rem_1fr_2.25rem]"
            >
              <div className="truncate text-xs text-foreground sm:text-right">{p.name}</div>
              <div className="order-last flex flex-wrap gap-1 sm:order-none">
                {p.days.map((day) => (
                  <DateChip key={day.date} day={day} who={p.name} />
                ))}
              </div>
              <div className="text-right text-xs tabular-nums text-muted">{p.total}</div>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-6 text-xs text-muted">
        The same figures per person, with hours and totals, are on the{" "}
        <Link href={`/portal/admin/timesheets/${batch.id}/report`} className="text-accent underline">
          payout report
        </Link>
        .
      </p>
    </div>
  );
}
