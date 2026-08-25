import Link from "next/link";
import { OFFICES, OFFICE_FILTER_LABELS } from "@/lib/positions";

// which office's staff an admin list shows. unlike the timesheets switch
// (which navigates between two separate screens), this FILTERS the one screen
// via ?office= - most of these lists are MLS-office people, so one click
// narrows the roster and its downloads to one office. `extra` carries the
// page's other query params (a search, a period) across the switch.
export default function OfficeFilter({ basePath, current, extra = {} }) {
  const options = [
    { key: "", label: "All staff" },
    ...OFFICES.map((o) => ({ key: o, label: OFFICE_FILTER_LABELS[o] })),
  ];
  const href = (key) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(extra)) {
      if (v && v !== "all") params.set(k, v);
    }
    if (key) params.set("office", key);
    const s = params.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
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
              href={href(o.key)}
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
