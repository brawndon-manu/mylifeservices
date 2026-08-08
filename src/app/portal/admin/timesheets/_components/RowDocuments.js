// The two source documents behind one employee's row, each collapsed until
// asked for.
//
// Same idea as the checks screen's Evidence panel, but per PERSON rather than
// per day: the review list states figures nobody can check ("QSP 24.60 → 24.60
// hrs") and the operator has no way to see whether we read the export right.
// This puts them one click from the page it was read off.
//
// Our own generated sheet is deliberately NOT here - Preview PDF and Hours &
// penalties already sit on the right of the same row.

// `#page=N` is honoured by every PDF viewer worth the name and never reaches
// the server, so a deep link costs nothing beyond knowing the page number.
function pageLink(href, pages) {
  const first = (pages || [])[0];
  return first ? `${href}#page=${first}` : href;
}

// "54 and 55 and 56" is what a plain join(" and ") produces, and B. Rotter
// really does span three pages. one comma short of the end.
function pageList(pages) {
  if (pages.length <= 2) return pages.join(" and ");
  return `${pages.slice(0, -1).join(", ")} and ${pages[pages.length - 1]}`;
}

function Pages({ pages }) {
  if (!pages?.length) return null;
  if (pages.length === 1) return <span className="text-faint">page {pages[0]}</span>;
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
      split across pages {pageList(pages)}
    </span>
  );
}

function Snippet({ title, pages, note, href, linkText, missing, children }) {
  return (
    <details className="group border-t border-border first:border-t-0">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2 text-xs">
        <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-90">
          ▶
        </span>
        <span className="font-semibold text-foreground">{title}</span>
        <Pages pages={pages} />
        {note}
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

export default function RowDocuments({ batchId, docs, hasSource, hasSchedule }) {
  if (!docs) return null;
  const { sourcePages, schedulePages, days, clockHours, rosteredDays, missingDays, punchIssues } = docs;

  return (
    <details className="group/docs mt-3 border-t border-border pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-brand">
        <span
          aria-hidden="true"
          className="text-muted transition-transform group-open/docs:rotate-90"
        >
          ▶
        </span>
        What the documents say
      </summary>

      <div className="mt-2 overflow-hidden rounded-md border border-border bg-surface-2">
        <Snippet
          title="QSP timesheet"
          pages={sourcePages}
          note={
            punchIssues > 0 ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                {punchIssues} {punchIssues === 1 ? "day" : "days"} flagged
              </span>
            ) : null
          }
          href={
            hasSource
              ? pageLink(`/portal/admin/timesheets/${batchId}/source?doc=timesheet`, sourcePages)
              : null
          }
          linkText="Open the QSP export at this page"
          missing={
            days ? null : "No days were read for this employee. Open the export to see what QSP actually holds."
          }
        >
          <p className="text-xs text-foreground">
            {days} {days === 1 ? "day" : "days"},{" "}
            <span className="font-semibold">{clockHours}</span> hrs on the clock
          </p>
          <p className="mt-1 text-xs text-muted">
            What we read off this page. Everything on the row is derived from it.
          </p>
        </Snippet>

        <Snippet
          title="QSP schedule"
          pages={schedulePages}
          note={
            missingDays > 0 ? (
              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                {missingDays} with no hours
              </span>
            ) : null
          }
          href={
            hasSchedule
              ? pageLink(`/portal/admin/timesheets/${batchId}/source?doc=schedule`, schedulePages)
              : null
          }
          linkText="Open the schedule at this page"
          missing={
            !rosteredDays
              ? hasSchedule
                ? "Nothing rostered for this employee."
                : "No schedule was stored with this batch. Re-upload the period with the Employee Schedules PDF to get this."
              : null
          }
        >
          <p className="text-xs text-foreground">
            {rosteredDays} {rosteredDays === 1 ? "day" : "days"} rostered
          </p>
          {/* deliberately no scheduled-hours total. the premium grading card
              above says hours differing from the schedule is not counted
              against anything, because people work hours they were not
              scheduled - printing both totals side by side invites exactly the
              comparison the page tells you not to make. */}
          <p className="mt-1 text-xs text-muted">
            {missingDays > 0
              ? `${missingDays} rostered ${missingDays === 1 ? "day has" : "days have"} no hours on the timesheet, so ${missingDays === 1 ? "it pays" : "they pay"} nothing.`
              : "The schedule is the second opinion behind meal periods. It does not set the hours - the timesheet does."}
          </p>
        </Snippet>
      </div>
    </details>
  );
}
