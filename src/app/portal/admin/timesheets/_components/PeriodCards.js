import Link from "next/link";
import { companyDate } from "@/lib/company-time";
import { ChevronRight, Clock3, Flag, CircleCheck, CircleAlert, CalendarRange, FlaskConical } from "lucide-react";
import PeriodPresence, { BatchFaces, FoldedCount } from "./CardPresence";
import { batchState } from "@/lib/timesheet/batch-state";
import TestBatchBadge from "./TestBatchBadge";

// ONE CARD PER PAY PERIOD, exactly as the timesheets list has always drawn it -
// pulled out whole so the day program's list at /portal/admin/day-program is
// THE SAME cards over its own batches rather than a copy that drifts. The two
// lists never mix batches; the deep pages behind the links are shared anyway.
//
// THE DRESS IS THE APPROVED MOCK: calendar tile + humanized period name, a
// three-column status grid (Data readiness / Sent / Signed · of sent), flags
// underneath, earlier uploads folded below. Every value still comes off
// batchState and the timesheet rows - nothing here computes its own truth.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const parse = (s) => {
  const [m, d, y] = String(s || "").split("/").map(Number);
  return m && d && y ? { m, d, y: 2000 + y } : null;
};

// "09/01/26 to 09/15/26" -> "September 1–15" (+ the year for the subline).
// A cross-month period names both months; an unreadable one prints as stored.
function periodTitle(from, to) {
  const a = parse(from), b = parse(to);
  if (!a || !b) return { title: `${from} to ${to}`, year: null };
  const title =
    a.m === b.m && a.y === b.y
      ? `${MONTHS[a.m - 1]} ${a.d}–${b.d}`
      : `${MONTHS[a.m - 1]} ${a.d} – ${MONTHS[b.m - 1]} ${b.d}`;
  return { title, year: a.y };
}

// "09/05/26" -> "Sep 5"; anything unreadable prints as stored.
function shortDay(s) {
  const p = parse(s);
  return p ? `${MONTHS[p.m - 1].slice(0, 3)} ${p.d}` : s;
}

// "09/01/26".."09/06/26" -> "Sep 1–6"; months differ -> "Sep 28–Oct 2".
function shortRange(from, to) {
  const a = parse(from), b = parse(to);
  if (!a || !b) return `${from}–${to}`;
  return a.m === b.m && a.y === b.y
    ? `${MONTHS[a.m - 1].slice(0, 3)} ${a.d}–${b.d}`
    : `${shortDay(from)}–${shortDay(to)}`;
}

// the sentence-case reading of a batch state, presentation only - the state
// KEYS drive logic everywhere else and stay untouched.
const STATE_WORDS = {
  live: "Still coming in",
  "needs-decision": "Needs a decision",
  final: "Final",
  superseded: "Superseded",
};

function ReadinessValue({ state }) {
  const Icon = state.key === "final" ? CircleCheck : state.key === "needs-decision" ? Flag : Clock3;
  const tone =
    state.key === "final"
      ? "text-emerald-600 dark:text-emerald-400"
      : state.key === "needs-decision"
        ? "text-amber-600 dark:text-amber-400"
        : "text-faint";
  return (
    <p className="mt-1 flex items-center gap-1.5 text-[13.5px] font-medium text-foreground">
      <Icon size={14} strokeWidth={1.8} aria-hidden="true" className={`flex-none ${tone}`} />
      {STATE_WORDS[state.key] ?? state.key}
    </p>
  );
}

// what the readiness means for THIS period, in one line. reach + days-to-come
// for a period still filling, the lock question for one that reached its end,
// the lock fact once somebody attested it.
function readinessDetail(state) {
  if (!state.reach) return null;
  const through = `Through ${shortDay(state.reach)}`;
  if (state.key === "final") return `${through} · schedule locked`;
  if (state.key === "needs-decision") return `${through} · confirm schedule lock`;
  if (state.daysToCome) {
    return `${through} · ${state.daysToCome} day${state.daysToCome === 1 ? "" : "s"} to come`;
  }
  return through;
}

export default function PeriodCards({ periods }) {
  return (
    <ul className="mt-3 space-y-4">
      {periods.map((g) => {
        const b = g.current;
        const total = b.timesheets.length;
        const sent = b.timesheets.filter((t) => t.sentAt).length;
        const signed = b.timesheets.filter((t) => t.signedAt).length;
        const unmatched = b.timesheets.filter((t) => !t.userId).length;
        const state = batchState(b);
        const { title, year } = periodTitle(b.periodFrom, b.periodTo);
        const allSigned = sent > 0 && signed >= sent;
        const hasFlags = unmatched > 0 || b.partialPeriod || b.testMode || b.testOnly;
        return (
          <li key={g.key} className="overflow-hidden rounded-xl bg-surface shadow-sm night:ring-1 night:ring-border">
            {/* ONE POLL FOR THE WHOLE PERIOD, answered per upload. The card
                reads its own slice and each folded row reads its own, so a
                face lands on the upload somebody is actually in rather than
                on the newest one. Only while the period is unfinished: a
                poller per period per tab grows for ever. */}
            <PeriodPresence
              batchId={state.key === "final" ? null : b.id}
              alsoBatchIds={g.earlier.map((o) => o.id)}
            >
              <div className="relative">
                {/* THE FACES SIT OUTSIDE THE LINK. A card that is one big anchor
                    cannot hold a second interactive thing, and a tooltip inside
                    an anchor is swallowed by the navigation. Only the CURRENT
                    upload is watched, and only while the period is still open. */}
                <div className="pointer-events-none absolute right-4 top-[74px] z-10">
                  <div className="pointer-events-auto">
                    <BatchFaces batchId={b.id} />
                  </div>
                </div>

                <Link
                  href={`/portal/admin/timesheets/${b.id}`}
                  className="group block px-5 pb-4 pt-5 transition-colors hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                >
                  <div className="flex items-center gap-3.5 pr-6">
                    <span
                      aria-hidden="true"
                      className="flex h-[54px] w-12 flex-none flex-col items-center justify-center rounded-[9px] bg-surface-2 ring-1 ring-sep"
                    >
                      <span className="text-[11px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                        {parse(b.periodFrom) ? MONTHS[parse(b.periodFrom).m - 1].slice(0, 3) : ""}
                      </span>
                      <span className="text-[22px] font-medium leading-tight tracking-tight text-foreground">
                        {parse(b.periodFrom)?.d ?? ""}
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[17px] font-semibold tracking-tight text-foreground">
                        {title}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-faint">
                        {year ? `${year} · ` : ""}
                        {total} employee{total === 1 ? "" : "s"} &middot; {g.uploads} upload{g.uploads === 1 ? "" : "s"}
                      </p>
                    </div>
                    <ChevronRight
                      size={15}
                      aria-hidden="true"
                      className="absolute right-4 top-10 flex-none text-faint"
                    />
                  </div>

                  {/* WHEN THE EXPORT LANDED, TO THE MINUTE. The date alone made
                      two pulls of one fortnight on the same day
                      indistinguishable. Not when QSP generated the file -
                      nothing in the four exports records that - so it says
                      uploaded rather than exported. */}
                  <p className="mt-3.5 flex flex-wrap gap-x-4 text-[11.5px] text-faint">
                    <span>
                      Uploaded {companyDate(b.createdAt, {
                        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                      })}
                    </span>
                    <span>Most recent version</span>
                  </p>

                  <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-sep pt-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,1fr)]">
                    <div className="col-span-2 sm:col-span-1">
                      <p className="text-[11.5px] text-faint">Data readiness</p>
                      <ReadinessValue state={state} />
                      {readinessDetail(state) && (
                        <p className="mt-0.5 text-[11.5px] text-faint">{readinessDetail(state)}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[11.5px] text-faint">Sent</p>
                      <p className="mt-1 text-[13.5px] font-medium tabular-nums text-foreground">
                        {sent} / {total}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-faint">employees</p>
                    </div>
                    <div>
                      <p className="text-[11.5px] text-faint">Signed &middot; of sent</p>
                      <p
                        className={`mt-1 text-[13.5px] font-medium tabular-nums ${
                          allSigned ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                        }`}
                      >
                        {sent > 0 ? `${signed} / ${sent}` : "—"}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-faint">
                        {sent === 0
                          ? "Not sent yet"
                          : allSigned
                            ? "All sent sheets signed"
                            : `${sent - signed} awaiting signature`}
                      </p>
                    </div>
                  </div>

                  {hasFlags && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      {unmatched > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-rose-600 dark:text-rose-400">
                          <CircleAlert size={13} strokeWidth={1.8} aria-hidden="true" />
                          {unmatched} unmatched employee{unmatched === 1 ? "" : "s"}
                        </span>
                      )}
                      {/* a partial batch stops looking partial the moment you stop
                          remembering uploading it, and its hours are not a whole
                          period - so it says so wherever it is listed */}
                      {b.partialPeriod && (
                        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-amber-700 dark:text-amber-400">
                          <CalendarRange size={13} strokeWidth={1.8} aria-hidden="true" />
                          Partial
                          {b.partialFrom && b.partialThrough
                            ? ` · ${shortRange(b.partialFrom, b.partialThrough)}`
                            : b.partialThrough
                              ? ` · through ${shortDay(b.partialThrough)}`
                              : ""}
                        </span>
                      )}
                      {b.testMode && (
                        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-amber-700 dark:text-amber-400">
                          <FlaskConical size={13} strokeWidth={1.8} aria-hidden="true" />
                          Test sends
                        </span>
                      )}
                      <TestBatchBadge batch={b} size="sm" showAddress={false} />
                    </div>
                  )}
                </Link>
              </div>

              {/* EARLIER UPLOADS OF THE SAME FORTNIGHT, SHUT BY DEFAULT - the whole
                  point of folding them is that they are out of the way. A details
                  element rather than state, so it needs no client component and it
                  works before hydration. */}
              {g.earlier.length > 0 && (
                <details className="group/fold border-t border-sep bg-surface-2">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-2.5 text-[11.5px] font-medium text-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
                    <ChevronRight
                      size={12}
                      aria-hidden="true"
                      className="flex-none text-faint transition-transform group-open/fold:rotate-90"
                    />
                    {g.earlier.length} earlier upload{g.earlier.length === 1 ? "" : "s"} of this period
                    {/* a shut fold must not hide a person. The face itself is
                        on the row inside; this is only the reason to open it. */}
                    <FoldedCount batchIds={g.earlier.map((o) => o.id)} />
                  </summary>
                  <ul>
                    {g.earlier.map((o) => {
                      const os = batchState(o);
                      return (
                        <li key={o.id}>
                          <Link
                            href={`/portal/admin/timesheets/${o.id}`}
                            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-sep py-2.5 pl-10 pr-4 text-[11.5px] transition-colors hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                          >
                            <span className="min-w-0">
                              <span className="block text-[12px] font-medium text-foreground">
                                {companyDate(o.createdAt, {
                                  month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                                })}
                              </span>
                              <span className="mt-0.5 block text-faint">
                                Reached {os.reach ? shortDay(os.reach) : "—"} &middot; {o.timesheets.length} sheets
                              </span>
                            </span>
                            <span className="flex items-center gap-3">
                              <BatchFaces batchId={o.id} compact />
                              <span className="text-right text-faint">
                                {STATE_WORDS[os.key] ?? os.key}
                                <span className="block text-[10.5px]">Superseded</span>
                              </span>
                              <ChevronRight size={13} aria-hidden="true" className="flex-none text-faint" />
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </PeriodPresence>
          </li>
        );
      })}
    </ul>
  );
}
