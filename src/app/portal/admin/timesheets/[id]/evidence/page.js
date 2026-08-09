import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { premiumEvidence } from "@/lib/timesheet/premium-evidence";
import BackLink from "@/components/BackLink";

export const metadata = { title: "Premium evidence", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// blue is a meal period and yellow is a rest break, the same key the signed
// sheet uses. the SUMMARY bar deliberately stays neutral grey: hue already
// means meal vs rest, so it is not free to also mean settled vs open.
const HUE = { meal: "var(--pen-meal)", rest: "var(--pen-rest)" };
// hatching is what carries "this is not settled", so it works without colour
const hatch = (c) =>
  `repeating-linear-gradient(135deg, ${c} 0 5px, rgba(0,0,0,.55) 5px 10px)`;

const GROUPS = [
  { key: "witnessed", title: "Witnessed", sub: "a source document says so",
    hint: "Nothing anyone decides moves these." },
  { key: "ruled", title: "Settled by a ruling", sub: "no document says it, a person decided it",
    hint: "Owed, and not in question. Kept apart from the ones above because a ruling and a record are not the same kind of evidence." },
  { key: "open", title: "Rests on a decision", sub: "no document settles it either way",
    hint: "Charged today, because the reading that pays the employee is the safe one. Each needs a person, not code." },
  { key: "cleared", title: "Cleared", sub: "answered, and no longer owed",
    hint: "Not deleted. Every one of these days prints the reason on the timesheet the employee signs." },
];

function Row({ b, max }) {
  const solid = b.group === "witnessed";
  return (
    <div className="grid grid-cols-[34px_minmax(0,1fr)_120px_44px_74px] items-start gap-3 border-t border-border py-3 sm:grid-cols-[34px_minmax(0,1fr)_180px_44px_74px]">
      <div
        className={`rounded-[5px] py-[3px] text-center text-[10.5px] font-bold leading-none ${
          solid ? "text-black" : "border border-dashed border-border-strong text-foreground"
        }`}
        style={solid ? { background: HUE[b.kind] } : undefined}
      >
        {b.code}
      </div>
      <div className="text-[13px] leading-snug">
        {b.label}
        {b.note && <span className="mt-1 block text-[11.5px] italic text-faint">{b.note}</span>}
      </div>
      <div className="pt-1">
        <div
          className="h-[11px] rounded-[3px]"
          style={{
            width: `${max ? (b.days / max) * 100 : 0}%`,
            minWidth: b.days ? "3px" : 0,
            background: solid ? HUE[b.kind] : hatch(HUE[b.kind]),
          }}
        />
      </div>
      <div className={`text-right text-sm font-bold tabular-nums ${b.group === "cleared" ? "line-through" : ""}`}>
        {b.days}
      </div>
      <div className="pt-[2px] text-right text-[11.5px] text-faint">
        {b.people} {b.people === 1 ? "person" : "people"}
      </div>
    </div>
  );
}

export default async function EvidencePage({ params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");
  const { id } = await params;

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    include: { timesheets: { orderBy: { sourceName: "asc" } } },
  });
  if (!batch) notFound();

  const { buckets, neverPunched, totals } = premiumEvidence(batch.timesheets);
  const max = Math.max(1, ...buckets.map((b) => b.days));
  const pct = totals.owed ? (totals.settled / totals.owed) * 100 : 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <BackLink href={`/portal/admin/timesheets/${batch.id}`}>Back to the pay period</BackLink>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-accent">Premium hours</p>
      <h1 className="mt-1 text-3xl font-bold">
        {batch.periodFrom} to {batch.periodTo}
      </h1>
      <p className="mt-2 max-w-[66ch] text-sm text-muted">
        One hour for a missed meal period and one for missed rest breaks, one of each at most per
        workday, under Labor Code 226.7. Every hour here is owed on top of hours worked. What this
        page adds: each hour says what evidence stands behind it.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <span className="block text-3xl font-bold leading-none tabular-nums">{totals.owed}</span>
          <span className="mt-1 block text-sm font-bold">Premium hours owed</span>
          <span className="mt-1 block text-xs text-muted">
            Was {totals.gross} before {totals.cleared} were cleared by signed waivers.
          </span>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <span className="block text-3xl font-bold leading-none tabular-nums">{totals.settled}</span>
          <span className="mt-1 block text-sm font-bold">Not in question</span>
          <span className="mt-1 block text-xs text-muted">
            {totals.witnessed} witnessed by a document, {totals.ruled} settled by a ruling.
          </span>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <span className="block text-3xl font-bold leading-none tabular-nums">{totals.open}</span>
          <span className="mt-1 block text-sm font-bold">Rests on a decision</span>
          <span className="mt-1 block text-xs text-muted">
            Neither of them ours to answer.
          </span>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex h-[26px] overflow-hidden rounded-md border border-border">
          <div className="bg-foreground/80" style={{ width: `${pct}%` }} />
          <div
            className="border-l border-border-strong"
            style={{
              width: `${100 - pct}%`,
              background:
                "repeating-linear-gradient(135deg, var(--faint) 0 5px, transparent 5px 10px)",
            }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[11.5px] text-muted">
          <span>{totals.settled} not in question</span>
          <span>{totals.open} awaiting an answer</span>
        </div>
      </div>

      {GROUPS.map((g) => {
        const rows = buckets.filter((b) => b.group === g.key && b.days > 0)
          .sort((a, b) => b.days - a.days);
        if (!rows.length) return null;
        return (
          <section key={g.key}>
            <h2 className="mt-8 text-[13px] font-bold uppercase tracking-wide">
              {g.title}
              <span className="ml-2 text-xs font-semibold normal-case tracking-normal text-faint">
                {g.sub}
              </span>
            </h2>
            <p className="mb-3 mt-1 text-xs text-muted">{g.hint}</p>
            {rows.map((b) => <Row key={b.code} b={b} max={max} />)}
          </section>
        );
      })}

      {neverPunched.length > 0 && (
        <section>
          <h2 className="mt-8 text-[13px] font-bold uppercase tracking-wide">
            Not a wage question
            <span className="ml-2 text-xs font-semibold normal-case tracking-normal text-faint">
              a setup problem, kept out of the figures
            </span>
          </h2>
          <p className="mb-3 mt-1 text-xs text-muted">
            Nobody here punched a break on a single day of the period, yet had days that owed one.
            The premium is charged either way and none of this changes an hour. It is listed so a
            configuration problem does not go on hiding inside a wage figure.
          </p>
          {neverPunched.map((x) => (
            <div
              key={x.name}
              className="grid grid-cols-[34px_minmax(0,1fr)_44px_74px] items-start gap-3 border-t border-border py-3"
            >
              <div className="rounded-[5px] border border-dashed border-border-strong py-[3px] text-center text-[10.5px] font-bold leading-none">
                QS
              </div>
              <div className="text-[13px] leading-snug">
                {x.name}
                <span className="mt-1 block text-[11.5px] italic text-faint">
                  {x.days} {x.days === 1 ? "day" : "days"} in the period, {x.owed} of them owing a
                  rest, and not one break punched.{" "}
                  {x.owed >= 10
                    ? "That many consecutive skipped breaks is possible; never being set up on QSClock is likelier."
                    : "Too few days to read anything into on its own."}
                </span>
              </div>
              <div className="text-right text-sm font-bold tabular-nums">{x.owed}</div>
              <div className="pt-[2px] text-right text-[11.5px] text-faint">days</div>
            </div>
          ))}
        </section>
      )}

      <p className="mt-7 border-t border-border pt-3 text-xs text-muted">
        If both open questions came back in the company&apos;s favour the total would be{" "}
        <b className="text-foreground">{totals.settled}</b>. If they came back the other way it
        stays <b className="text-foreground">{totals.owed}</b>.
      </p>
    </div>
  );
}
