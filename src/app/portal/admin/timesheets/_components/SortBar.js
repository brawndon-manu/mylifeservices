import Link from "next/link";
import { SORTS, DEFAULT_SORT } from "@/lib/timesheet/people-sort";

// HOW THE ALL-EMPLOYEES LIST IS ORDERED, as one row of links.
//
// A server component for the same reason OfficeSwitch is: the active order is
// known at render, so it arrives as a prop and this ships no client bundle for
// what is a handful of links and a label.
//
// LINKS AND NOT A <select>. The order is in the URL, so a reviewer can send
// "everyone by premium hours" to somebody else and have them open the same
// screen - a select holding the state in the browser cannot be shared, and this
// list is a worklist two people use at once.
//
// The default is left OUT of the URL rather than written as ?sort=name, so the
// plain address stays the plain address and there is one link for the list
// rather than two that render identically.
export default function SortBar({ basePath, current }) {
  const active = SORTS[current] ? current : DEFAULT_SORT;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted">
        Sort by
      </span>
      <div
        className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-surface-2 p-1"
        role="group"
        aria-label="Sort the list"
      >
        {Object.entries(SORTS).map(([key, s]) =>
          key === active ? (
            // the order you are already in is not a link to itself
            <span
              key={key}
              aria-current="true"
              title={s.hint}
              className="rounded-md bg-surface px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm"
            >
              {s.label}
            </span>
          ) : (
            <Link
              key={key}
              href={key === DEFAULT_SORT ? basePath : `${basePath}?sort=${key}`}
              title={s.hint}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {s.label}
            </Link>
          ),
        )}
      </div>
      {/* what the chosen order actually means, said once rather than only in a
          tooltip - a title attribute is invisible on a touch screen, and this
          list gets read on a phone. */}
      <span className="text-xs text-muted">{SORTS[active].hint}</span>
    </div>
  );
}
