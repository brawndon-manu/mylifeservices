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
    <div className="mt-6 rounded-xl border border-sky-200 bg-sky-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
        About {category.toLowerCase()}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-800">
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
            className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
            >
              ×
            </button>
            <h3 className="pr-8 text-xl font-semibold tracking-tight text-slate-900">{lm.title}</h3>
            {lm.intro && (
              <p className="mt-3 text-sm leading-relaxed text-slate-700">{lm.intro}</p>
            )}
            {lm.sectionTitle && (
              <h4 className="mt-6 text-sm font-semibold text-brand-dark">{lm.sectionTitle}</h4>
            )}
            {lm.sectionIntro && (
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{lm.sectionIntro}</p>
            )}

            {Array.isArray(lm.steps) && lm.steps.length > 0 && (
              <ol className="mt-5">
                {lm.steps.map((s, i) => (
                  <li key={i} className="relative pb-6 pl-12 last:pb-0">
                    {i < lm.steps.length - 1 && (
                      <span
                        aria-hidden
                        className="absolute bottom-0 left-[15px] top-9 border-l border-dotted border-slate-300"
                      />
                    )}
                    <span className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-sm font-bold text-slate-600">
                      {i + 1}
                    </span>
                    <p className="font-semibold text-slate-900">{s.title}</p>
                    {s.sub && <p className="mt-0.5 text-xs italic text-slate-400">{s.sub}</p>}
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{s.body}</p>
                  </li>
                ))}
              </ol>
            )}

            {lm.safetyNet && (
              <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm leading-relaxed text-emerald-800">
                <span className="font-semibold text-emerald-900">Safety net:</span> {lm.safetyNet}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
