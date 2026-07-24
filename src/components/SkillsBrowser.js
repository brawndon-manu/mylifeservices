"use client";

import { useState } from "react";

// the full skills list, browsed instead of scrolled. on desktop it's two panes:
// a sticky rail of categories on the left, the picked one on the right, so the
// section stays about one screen tall no matter how many skills there are. on
// mobile there's no room for two panes, so it collapses to an accordion.
export default function SkillsBrowser({ categories, chipGradient }) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(null); // mobile accordion
  const total = categories.reduce((n, c) => n + c.items.length, 0);
  const current = categories[active];

  return (
    <section id="skills" className="scroll-mt-24 border-t border-border bg-surface-2">
      <div className="mx-auto max-w-7xl px-6 py-14 sm:py-16">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Everything we work on
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          {/* keep the text right after {categories.length} on one line - jsx
              trims the leading space off a chunk that wraps, so it renders
              "11areas" if this gets reflowed */}
          {total} skills across {categories.length} areas, and this is a starting point,{" "}
          not a limit. Nobody works on all of them. We start with the ones you care
          about, and the plan is yours to change. Pick an area to see what&apos;s
          inside it.
        </p>

        {/* ---------- desktop: two panes ---------- */}
        <div className="mt-8 hidden overflow-hidden rounded-2xl border border-border bg-surface shadow-sm md:grid md:grid-cols-[240px_1fr]">
          <div className="border-r border-border bg-surface-2 py-2" role="tablist" aria-label="Skill areas">
            {categories.map((cat, i) => {
              const on = i === active;
              return (
                <button
                  key={cat.name}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-controls="skills-panel"
                  onClick={() => setActive(i)}
                  className={`block w-full border-l-[3px] px-4 py-2.5 text-left text-sm transition ${
                    on
                      ? "border-brand-light bg-surface font-semibold text-brand-dark"
                      : "border-transparent text-muted hover:bg-surface hover:text-foreground"
                  }`}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>

          <div id="skills-panel" role="tabpanel" className="p-7">
            <h3 className="text-xl font-semibold tracking-tight text-foreground">
              {current.name}
            </h3>
            <p className="mt-1 text-xs font-medium text-faint">
              {current.items.length} skills
            </p>
            <ul className="mt-5 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
              {current.items.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-muted">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-brand-light" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ---------- mobile: accordion ---------- */}
        <div className="mt-8 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface md:hidden">
          {categories.map((cat, i) => {
            const on = i === open;
            return (
              <div key={cat.name}>
                <button
                  type="button"
                  aria-expanded={on}
                  onClick={() => setOpen(on ? null : i)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-xs font-bold text-white"
                    style={{ background: chipGradient }}
                  >
                    {cat.items.length}
                  </span>
                  <span className="flex-1 text-sm font-semibold text-foreground">{cat.name}</span>
                  <span
                    aria-hidden="true"
                    className={`flex-none text-faint transition-transform ${on ? "rotate-180" : ""}`}
                  >
                    ▾
                  </span>
                </button>
                {on && (
                  <ul className="space-y-2.5 px-4 pb-4 pl-14">
                    {cat.items.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted">
                        <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-brand-light" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {/* the list reads as exhaustive if we don't say otherwise, and it isn't */}
        <div className="mt-6 rounded-2xl border border-brand-light/40 bg-brand-light/[0.07] p-6 sm:p-7">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            Don&apos;t see what you need?
          </h3>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-muted">
            This list is what comes up most often, not the whole of what we do.
            If a skill helps someone live more independently, we can work on it,
            whether or not it&apos;s written here. Tell us what you&apos;re trying
            to do and we&apos;ll build the plan around it.
          </p>
        </div>
      </div>
    </section>
  );
}
