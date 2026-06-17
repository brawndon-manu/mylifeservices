"use client";

// "About <category>" callout shown at the top of a category's drilldown view.
// holds a short blurb + an optional glossary term (? bubble) + an optional
// "Learn more" button that spawns a dismissible card (modal) with a numbered
// process and a safety-net note. content comes from src/lib/resource-info.js.
import { useEffect, useState } from "react";
import HelpTip from "@/components/HelpTip";
import { categoryInfo } from "@/lib/resource-info";

export default function CategoryInfo({ category }) {
  const info = categoryInfo(category);
  const [open, setOpen] = useState(false);

  // close the learn-more card on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!info) return null;
  const lm = info.learnMore;

  return (
    <div className="mt-6 rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900/60 dark:bg-sky-950/40">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
        About {category.toLowerCase()}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-foreground">
        {info.blurb}
        {info.term && (
          <>
            {" "}
            <HelpTip label={`About ${info.term.label}`}>{info.term.definition}</HelpTip>
          </>
        )}
      </p>
      {lm && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 text-sm font-semibold text-brand transition hover:text-brand-dark"
        >
          Learn more about {lm.title} →
        </button>
      )}

      {open && lm && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/45 p-4 sm:p-10"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-2xl rounded-2xl bg-surface p-6 shadow-2xl sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-lg text-muted transition hover:bg-surface-3 hover:text-muted"
            >
              ×
            </button>
            <h3 className="pr-8 text-xl font-semibold tracking-tight text-foreground">{lm.title}</h3>
            {lm.intro && (
              <p className="mt-3 text-sm leading-relaxed text-muted">{lm.intro}</p>
            )}
            {lm.sectionTitle && (
              <h4 className="mt-6 text-sm font-semibold text-brand-dark">{lm.sectionTitle}</h4>
            )}
            {lm.sectionIntro && (
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{lm.sectionIntro}</p>
            )}

            {Array.isArray(lm.steps) && lm.steps.length > 0 && (
              <ol className="mt-5">
                {lm.steps.map((s, i) => (
                  <li key={i} className="relative pb-6 pl-12 last:pb-0">
                    {i < lm.steps.length - 1 && (
                      <span
                        aria-hidden
                        className="absolute bottom-0 left-[15px] top-9 border-l border-dotted border-border-strong"
                      />
                    )}
                    <span className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-border-strong bg-surface text-sm font-bold text-muted">
                      {i + 1}
                    </span>
                    <p className="font-semibold text-foreground">{s.title}</p>
                    {s.sub && <p className="mt-0.5 text-xs italic text-faint">{s.sub}</p>}
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
                  </li>
                ))}
              </ol>
            )}

            {lm.safetyNet && (
              <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm leading-relaxed text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                <span className="font-semibold text-emerald-900 dark:text-emerald-200">Safety net:</span> {lm.safetyNet}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
