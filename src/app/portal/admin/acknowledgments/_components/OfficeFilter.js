import Link from "next/link";
import { OFFICES } from "@/lib/positions";
import { OFFICE_LABELS } from "../audit";

// which office's staff the roster shows. unlike the timesheets switch (which
// navigates between two separate screens), this FILTERS the one screen - an
// acknowledgment audience spans offices, and most ack posts are for the MLS
// office, so one click narrows the roster and its downloads to one office.
export default function OfficeFilter({ basePath, current }) {
  const options = [
    { key: "", label: "All staff" },
    ...OFFICES.map((o) => ({ key: o, label: OFFICE_LABELS[o] })),
  ];
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted">
        Office
      </span>
      <div
        className="inline-flex gap-1 rounded-lg border border-border bg-surface-2 p-1"
        role="group"
        aria-label="Office"
      >
        {options.map((o) =>
          o.key === current ? (
            <span
              key={o.key || "all"}
              aria-current="true"
              className="rounded-md bg-surface px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm"
            >
              {o.label}
            </span>
          ) : (
            <Link
              key={o.key || "all"}
              href={o.key ? `${basePath}?office=${o.key}` : basePath}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {o.label}
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
