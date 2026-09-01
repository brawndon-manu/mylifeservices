"use client";

// THE CLIENT LIST WITH A FILTER BOX. 264 names is too many to scroll blind,
// so the box narrows by client or staff name as you type; everything else is
// plain rows the server already built.
import { useState } from "react";
import Link from "next/link";

export default function SurveyList({ rows }) {
  const [q, setQ] = useState("");

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(needle) ||
          (r.staff || "").toLowerCase().includes(needle),
      )
    : rows;

  return (
    <div className="mt-8">
      <label htmlFor="survey-filter" className="sr-only">
        Filter by client or staff name
      </label>
      <input
        id="survey-filter"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter by client or staff name"
        className="w-full max-w-sm rounded-md border border-border bg-surface px-3.5 py-2 text-sm text-foreground placeholder:text-faint focus:border-brand focus:outline-none"
      />

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted">
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Assigned staff</th>
              <th className="px-4 py-3">Latest survey</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                <td className="px-4 py-3 text-muted">{r.staff || "—"}</td>
                <td className="px-4 py-3">
                  {r.latest ? (
                    <div>
                      <p className="text-foreground">
                        {r.latest.when}
                        {r.latest.who && <span> · {r.latest.who}</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {r.latest.by} · {r.latest.answered} of {r.latest.of} answered
                        {r.latest.count > 1 && (
                          <span className="font-semibold text-foreground">
                            {" "}
                            · {r.latest.count} on file
                          </span>
                        )}
                      </p>
                    </div>
                  ) : (
                    <span className="text-faint">Not yet surveyed</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-4 whitespace-nowrap">
                    {r.latest && (
                      <Link
                        href={`/portal/admin/satisfaction/report/${r.latest.id}/pdf`}
                        target="_blank"
                        className="font-medium text-brand transition hover:text-brand-dark"
                      >
                        PDF
                      </Link>
                    )}
                    <Link
                      href={`/portal/admin/satisfaction/${r.id}`}
                      className="font-medium text-brand transition hover:text-brand-dark"
                    >
                      Fill out →
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted">
                  No clients match &ldquo;{q}&rdquo;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {needle && shown.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          {shown.length} of {rows.length} clients shown.
        </p>
      )}
    </div>
  );
}
