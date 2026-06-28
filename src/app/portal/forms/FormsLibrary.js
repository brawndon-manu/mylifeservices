"use client";

// the interactive part of the Forms page: a live search box + forms grouped by
// category into cards. fillable forms get a "Fill out" action; everything has a
// download of the blank template.
import { useMemo, useState } from "react";
import Link from "next/link";
import { FORM_CATEGORIES } from "@/lib/forms";

export default function FormsLibrary({ forms }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return forms;
    return forms.filter((f) =>
      [f.title, f.description, f.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(s),
    );
  }, [forms, query]);

  const grouped = useMemo(() => {
    const byCat = new Map();
    for (const f of filtered) {
      const c = f.category || "Other";
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c).push(f);
    }
    const ordered = [
      ...FORM_CATEGORIES.filter((c) => byCat.has(c)),
      ...[...byCat.keys()].filter((c) => !FORM_CATEGORIES.includes(c)),
    ];
    return ordered.map((c) => [c, byCat.get(c)]);
  }, [filtered]);

  return (
    <>
      <div className="mt-6">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search forms"
          aria-label="Search forms"
          className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <p className="mt-2 text-xs text-faint">
          {filtered.length} {filtered.length === 1 ? "form" : "forms"}
        </p>
      </div>

      {grouped.length === 0 ? (
        <p className="mt-8 text-sm text-muted">No forms match your search.</p>
      ) : (
        <div className="mt-6 space-y-10">
          {grouped.map(([cat, items]) => (
            <div key={cat}>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                {cat}{" "}
                <span className="ml-1 text-sm font-normal text-faint">
                  ({items.length})
                </span>
              </h2>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {items.map((f) => (
                  <FormCard key={f.id} form={f} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function FormCard({ form }) {
  return (
    <li className="flex flex-col rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <FileIcon className="mt-0.5 h-5 w-5 flex-none text-muted" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-foreground">{form.title}</p>
            {form.fillable ? (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-brand dark:bg-sky-950/50 dark:text-sky-300">
                Fillable
              </span>
            ) : (
              <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-muted">
                Document
              </span>
            )}
          </div>
          {form.description && (
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {form.description}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 pt-1">
        {form.fillable && (
          <Link
            href={`/portal/forms/${form.id}/fill`}
            className="rounded-md bg-brand-light px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand"
          >
            Fill out
          </Link>
        )}
        <a
          href={form.fileUrl}
          download
          className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-surface-2"
        >
          <DownloadIcon className="h-4 w-4" />
          {form.fillable ? "Blank PDF" : "Download"}
        </a>
      </div>
    </li>
  );
}

function FileIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}

function DownloadIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}
