"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Clock,
  Calendar,
  ListChecks,
  Users,
  Briefcase,
  Laptop,
  PenLine,
  MessageSquareText,
  CircleCheck,
  CircleAlert,
  CalendarDays,
  Files,
  Image as ImageIcon,
  FlaskConical,
  Search,
  ChevronRight,
} from "lucide-react";

// icons resolved here by name so the server page can pass plain data.
const ICONS = {
  clock: Clock,
  calendar: Calendar,
  listChecks: ListChecks,
  users: Users,
  briefcase: Briefcase,
  laptop: Laptop,
  penLine: PenLine,
  messageSquare: MessageSquareText,
  circleCheck: CircleCheck,
  calendarDays: CalendarDays,
  files: Files,
  image: ImageIcon,
  flask: FlaskConical,
};

// the admin launcher: two packed columns of borderless groups, hairline rows,
// and a search box that filters rows live (title + description). the
// maintenance status sits under everything as a footer with the switch
// behind a disclosure, so the consequential button is never one stray
// click on a launcher page.
export default function AdminTools({ columns, maintenance, toggleMaintenance }) {
  const [query, setQuery] = useState("");
  const [maintOpen, setMaintOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = columns.map((groups) =>
    groups
      .map((g) => ({
        ...g,
        rows: g.rows.filter(
          (r) => !q || r.title.toLowerCase().includes(q) || r.body.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.rows.length > 0),
  );
  const empty = filtered.every((groups) => groups.length === 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">Admin</h1>
          <p className="mt-1 text-sm text-muted">People, services, and daily operations.</p>
        </div>
        <label className="flex w-full items-center gap-2 rounded-lg bg-fill px-3 py-2 transition-colors focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-brand sm:w-64">
          <Search size={15} strokeWidth={1.8} aria-hidden="true" className="flex-none text-faint" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find an admin tool"
            aria-label="Find an admin tool"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-faint"
          />
        </label>
      </div>

      {empty ? (
        <p className="mt-10 text-sm text-muted">No admin tools match.</p>
      ) : (
        <div className="mt-8 grid gap-x-12 lg:grid-cols-2">
          {filtered.map((groups, i) => (
            <div key={i} className="min-w-0">
              {groups.map((g) => (
                <section key={g.label} className="mb-8">
                  <h2 className="text-[17px] font-semibold tracking-tight text-foreground">
                    {g.label}
                  </h2>
                  <div className="mt-1 divide-y divide-sep">
                    {g.rows.map((r) => {
                      const Icon = ICONS[r.icon];
                      return (
                        <Link
                          key={r.href}
                          href={r.href}
                          className="flex items-center gap-3.5 py-3.5 pr-1 transition-colors hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                        >
                          <Icon
                            size={18}
                            strokeWidth={1.7}
                            aria-hidden="true"
                            className="flex-none text-muted"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-semibold text-foreground">
                              {r.title}
                            </span>
                            <span className="block text-[13px] text-muted">{r.body}</span>
                          </span>
                          <ChevronRight
                            size={16}
                            aria-hidden="true"
                            className="flex-none text-faint"
                          />
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ))}
        </div>
      )}

      {maintenance && (
        <div className="mt-2 border-t border-sep pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              {maintenance.on ? (
                <CircleAlert
                  size={18}
                  strokeWidth={1.8}
                  aria-hidden="true"
                  className="mt-0.5 flex-none text-amber-500"
                />
              ) : (
                <CircleCheck
                  size={18}
                  strokeWidth={1.8}
                  aria-hidden="true"
                  className="mt-0.5 flex-none text-emerald-500"
                />
              )}
              <span>
                <span className="block text-[15px] font-semibold text-foreground">
                  {maintenance.on ? "Public website is down" : "Public website is live"}
                </span>
                <span className="block text-[13px] text-muted">
                  The employee portal stays available during maintenance.
                </span>
              </span>
            </div>
            <button
              type="button"
              aria-expanded={maintOpen}
              onClick={() => setMaintOpen((v) => !v)}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13.5px] font-medium text-foreground transition-colors hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
            >
              Site maintenance
              <ChevronRight
                size={15}
                aria-hidden="true"
                className={`text-faint transition-transform ${maintOpen ? "rotate-90" : ""}`}
              />
            </button>
          </div>
          {maintOpen && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface p-4 shadow-sm night:ring-1 night:ring-border">
              <p className="max-w-xl text-[13px] leading-relaxed text-muted">
                {maintenance.on
                  ? "The public site is showing the maintenance page right now. The portal stays open, and staff can still get in with the bypass password."
                  : "Turns the public site into a maintenance page. The portal stays open, and staff can still get in with the bypass password. Takes a few seconds to apply."}
              </p>
              <form action={toggleMaintenance} className="flex-none">
                <input type="hidden" name="next" value={maintenance.on ? "off" : "on"} />
                <button
                  type="submit"
                  className={`rounded-lg bg-fill px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-fill-2 focus-visible:outline-2 focus-visible:outline-offset-2 ${
                    maintenance.on
                      ? "text-emerald-700 focus-visible:outline-emerald-600 dark:text-emerald-300"
                      : "text-amber-700 focus-visible:outline-amber-600 dark:text-amber-300"
                  }`}
                >
                  {maintenance.on ? "Bring the site back" : "Take the site down"}
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </>
  );
}
