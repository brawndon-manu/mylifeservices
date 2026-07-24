"use client";

import { useState } from "react";
import Link from "next/link";
import { PersonIcon, GroupIcon, PlanIcon, ShieldIcon } from "@/components/Icons";

// keyed off the setting id so lib/careers.js stays plain data (no jsx in it)
const SETTING_ICONS = {
  "one-on-one": PersonIcon,
  group: GroupIcon,
  "self-directed": PlanIcon,
  crisis: ShieldIcon,
};

// picks a role by the kind of work someone wants, instead of making them guess
// which of our five program names they belong under. selecting a setting
// reveals the matching role(s) with a straight path into the program-aware
// apply form.
export default function RoleMatcher({ settings, roles, chipGradient }) {
  // nothing picked = every role is on show. picking one filters down, and
  // clicking the same one again clears it back to all of them.
  const [picked, setPicked] = useState(null);
  const setting = settings.find((s) => s.id === picked);
  const matches = picked
    ? (setting?.slugs || []).map((slug) => roles.find((r) => r.slug === slug)).filter(Boolean)
    : roles;

  const toggle = (id) => setPicked((cur) => (cur === id ? null : id));

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {settings.map((s) => {
          const on = s.id === picked;
          const Icon = SETTING_ICONS[s.id];
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s.id)}
              className={`rounded-2xl border p-5 text-left transition ${
                on
                  ? "border-brand-light bg-brand-light/[0.08] ring-1 ring-brand-light"
                  : "border-border bg-surface hover:border-brand-light"
              }`}
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
                style={{ background: chipGradient }}
              >
                {Icon && <Icon className="h-5 w-5" />}
              </span>
              <span className="mt-3 block text-sm font-semibold text-foreground">
                {s.label}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted">
                {s.blurb}
              </span>
            </button>
          );
        })}
      </div>

      {/* say what's on screen, and give an obvious way back to all of them.
          clicking the picked card again does the same thing, but nobody would
          guess that on their own. */}
      <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-foreground">
          {picked
            ? `${matches.length} ${matches.length === 1 ? "role" : "roles"} for "${setting?.label}"`
            : `All ${roles.length} roles`}
        </p>
        {picked && (
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="text-sm font-semibold text-brand-dark underline underline-offset-2 transition hover:text-brand"
          >
            Show all roles
          </button>
        )}
      </div>

      <div className="mt-3 space-y-3" aria-live="polite">
        {matches.map((role) => (
          <div
            key={role.slug}
            className="rounded-2xl border border-brand-light/40 bg-brand-light/[0.07] p-6"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                {role.name}
              </h3>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                Hiring
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted">
              {role.roleDescription}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={`/careers/apply?program=${role.slug}`}
                className="inline-flex items-center justify-center rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Apply for this role
              </Link>
              <Link
                href={`/careers/${role.slug}`}
                className="inline-flex items-center justify-center rounded-md border border-border-strong px-5 py-2.5 text-sm font-semibold text-foreground transition hover:border-brand-light hover:text-brand-dark"
              >
                What the job involves
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
