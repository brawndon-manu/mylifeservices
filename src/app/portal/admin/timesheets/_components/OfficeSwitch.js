import Link from "next/link";

// WHICH OFFICE'S PAYROLL YOU ARE LOOKING AT, and the one click to the other.
//
// This SWITCHES SCREENS, it does not filter one. The agency's list is scoped to
// program "MLS" and the day program's to "DP", and that separation is the whole
// point of there being two of them: two cards for the same fortnight, neither
// able to fold or supersede the other. A control that merged the lists and
// filtered them would quietly undo that, so this one only ever navigates.
//
// A server component on purpose. The active office is known at render on both
// pages, so it comes in as a prop rather than being worked out from the path in
// the browser - no client bundle for what is two links and a label.
const OFFICES = [
  { key: "MLS", label: "MLS", href: "/portal/admin/timesheets" },
  { key: "DP", label: "Day program", href: "/portal/admin/day-program" },
];

export default function OfficeSwitch({ current }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted">
        Offices
      </span>
      <div
        className="inline-flex gap-1 rounded-lg border border-border bg-surface-2 p-1"
        role="group"
        aria-label="Office"
      >
        {OFFICES.map((o) =>
          o.key === current ? (
            // the one you are on is not a link to itself. aria-current says so
            // out loud for anyone on a screen reader.
            <span
              key={o.key}
              aria-current="page"
              className="rounded-md bg-surface px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm"
            >
              {o.label}
            </span>
          ) : (
            <Link
              key={o.key}
              href={o.href}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {o.label}
            </Link>
          )
        )}
      </div>
    </div>
  );
}
