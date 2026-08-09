import { hm } from "@/lib/timesheet/anomalies";

// The three sources behind one day, each collapsed until asked for.
//
// The screen states things it can't prove: "QSP has: 3:15p 5:25p 5:15a 7:22p"
// and "schedule has 74.30" are both OUR transcription of documents the reader
// can't see. Someone about to correct payroll by hand has no way to check we
// read either one right - and the worst cases literally say "needs working out
// by hand", so they're opening the source anyway. This takes them there.
//
// Ordered the way the mental model runs: what QSP said, what the schedule said,
// what we produced. The first two are the ones anyone actually opens.

const f2 = (n) => (n == null ? "-" : (Math.round(n * 100) / 100).toFixed(2));

// `#page=N` is honoured by every PDF viewer worth the name and never reaches the
// server, so a deep link costs nothing beyond knowing the page number.
function pageLink(href, pages) {
  const first = (pages || [])[0];
  return first ? `${href}#page=${first}` : href;
}

// a plain join(" and ") reads "54 and 55 and 56" once someone spans three
// pages, which B. Rotter's timesheet does.
function pageList(pages) {
  if (pages.length <= 2) return pages.join(" and ");
  return `${pages.slice(0, -1).join(", ")} and ${pages[pages.length - 1]}`;
}

function Snippet({ title, pages, href, linkText, missing, children }) {
  return (
    <details className="group border-t border-border first:border-t-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs">
        <span
          aria-hidden="true"
          className="text-muted transition-transform group-open:rotate-90"
        >
          ▶
        </span>
        <span className="font-semibold text-foreground">{title}</span>
        {pages?.length > 1 && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            split across pages {pageList(pages)}
          </span>
        )}
        {pages?.length === 1 && <span className="text-faint">page {pages[0]}</span>}
      </summary>
      <div className="px-3 pb-3 pt-1">
        {missing ? (
          <p className="text-xs italic text-muted">{missing}</p>
        ) : (
          <>
            {children}
            {href && (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs font-medium text-brand hover:text-brand-dark"
              >
                {linkText} →
              </a>
            )}
          </>
        )}
      </div>
    </details>
  );
}

export default function Evidence({
  batchId,
  timesheetId,
  date,
  day,
  shifts,
  schedulePages,
  hasSource,
  hasSchedule,
}) {
  const punches = day?.punches || [];
  const sourcePages = day?.pages || [];

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-border bg-surface">
      <Snippet
        title="QSP timesheet"
        pages={sourcePages}
        href={hasSource ? pageLink(`/portal/admin/timesheets/${batchId}/source?doc=timesheet`, sourcePages) : null}
        linkText="Open the QSP export at this page"
        missing={
          punches.length
            ? null
            : "No punches were read for this day. Open the export to see what QSP actually holds."
        }
      >
        <p className="font-mono text-xs text-foreground">
          {punches.map((p) => hm(p.min)).join("  ")}
        </p>
        <p className="mt-1 text-xs text-muted">
          {punches.length} punch{punches.length === 1 ? "" : "es"}, read as{" "}
          {f2(day?.workedMin != null ? day.workedMin / 60 : null)} hrs on the clock
        </p>
      </Snippet>

      <Snippet
        title="QSP schedule"
        pages={schedulePages}
        href={hasSchedule ? pageLink(`/portal/admin/timesheets/${batchId}/source?doc=schedule`, schedulePages) : null}
        linkText="Open the schedule at this page"
        missing={
          !shifts?.length
            ? hasSchedule
              ? "Nothing scheduled for this day."
              : "No schedule was stored with this batch. Re-upload the period with the Employee Schedules PDF to get this."
            : null
        }
      >
        <ul className="space-y-0.5">
          {(shifts || []).map((s, i) => (
            <li
              key={i}
              className={`font-mono text-xs ${
                s.meal ? "text-muted line-through decoration-1" : "text-foreground"
              }`}
            >
              {s.text}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-muted">
          Meals struck through - they&apos;re unpaid, so they aren&apos;t in the
          scheduled total.
        </p>
      </Snippet>

      <Snippet
        title="Our generated sheet"
        href={`/portal/admin/timesheets/sheet/${timesheetId}/download`}
        linkText="Open the corrected timesheet"
      >
        <p className="text-xs text-foreground">
          {date}: <span className="font-semibold">{f2(day?.paidHours)} hrs</span> paid
          {day?.restMin ? ` (includes ${day.restMin} min of paid rest)` : ""}
          {day?.mealViolation ? " · meal premium" : ""}
          {day?.restViolation ? " · rest premium" : ""}
        </p>
        <p className="mt-1 text-xs text-muted">
          Derived from the two above. If they&apos;re right, this is right.
        </p>
      </Snippet>
    </div>
  );
}
