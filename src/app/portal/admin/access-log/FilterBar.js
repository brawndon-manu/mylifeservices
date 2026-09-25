"use client";

// the filters send themselves: changing a select is the ask, and the search
// goes on Enter, so there is no Apply button to hunt for. a plain GET form
// underneath, so the page is a link like any other.
const FIELD =
  "rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground";

export default function FilterBar({ q, kind, result, range, kinds, results, ranges, csvHref }) {
  return (
    <form
      method="GET"
      onChange={(e) => {
        if (e.target.tagName === "SELECT") e.currentTarget.requestSubmit();
      }}
      className="mt-6 flex flex-wrap items-center gap-2"
    >
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder="Search a person or a record"
        aria-label="Search a person or a record"
        className={`${FIELD} w-full sm:w-64`}
      />
      <select name="kind" defaultValue={kind} aria-label="Kind of record" className={FIELD}>
        {kinds.map((k) => (
          <option key={k.key} value={k.key}>
            {k.label}
          </option>
        ))}
      </select>
      <select name="result" defaultValue={result} aria-label="Opened or refused" className={`${FIELD} hidden sm:block`}>
        {results.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </select>
      <select name="range" defaultValue={range} aria-label="When" className={FIELD}>
        {ranges.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </select>
      <span className="hidden flex-1 sm:block" />
      <a
        href={csvHref}
        className="hidden rounded-lg border border-border-strong px-3 py-2 text-sm font-semibold text-brand transition hover:bg-surface-2 sm:block"
      >
        Download CSV
      </a>
    </form>
  );
}
