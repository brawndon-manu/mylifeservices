"use client";

// shared audience picker for announcements: Everyone, or specific job titles,
// and under each title an optional "pick specific people" dropdown so a role can
// be narrowed to certain individuals. used by the create/edit form AND the
// Send-by-email dialog (field names are configurable so each context posts the
// names its server action expects).
//
// smart selection: expanding "More options" or picking anything specific
// unchecks Everyone; checking a title auto-checks its people; unchecking a
// person drops the whole-role flag so it narrows to the remaining people.
import { useState } from "react";
import { POSITIONS } from "@/lib/positions";

export default function AudiencePicker({
  everyoneName,
  titlesName,
  userIdsName,
  staffByTitle = {},
  defaultEveryone = true,
  defaultTitles = [],
  defaultUserIds = [],
}) {
  const [everyone, setEveryone] = useState(defaultEveryone !== false);
  const [titles, setTitles] = useState(defaultTitles);
  const [userIds, setUserIds] = useState(defaultUserIds);
  // start expanded only when a specific audience is preset (editing / re-send).
  const [open, setOpen] = useState(defaultEveryone === false);

  const peopleOf = (title) => (staffByTitle[title] || []).map((p) => p.id);
  const uniq = (arr) => [...new Set(arr)];

  function handleOpen(isOpen) {
    setOpen(isOpen);
    if (isOpen) setEveryone(false);
  }
  function handleEveryone(checked) {
    setEveryone(checked);
    if (checked) {
      setTitles([]);
      setUserIds([]);
    } else {
      setOpen(true);
    }
  }
  function toggleTitle(title, checked) {
    setEveryone(false);
    const ids = peopleOf(title);
    if (checked) {
      setTitles((prev) => (prev.includes(title) ? prev : [...prev, title]));
      setUserIds((prev) => uniq([...prev, ...ids]));
    } else {
      setTitles((prev) => prev.filter((t) => t !== title));
      setUserIds((prev) => prev.filter((id) => !ids.includes(id)));
    }
  }
  function togglePerson(id, title, checked) {
    setEveryone(false);
    if (checked) {
      setUserIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    } else {
      setUserIds((prev) => prev.filter((x) => x !== id));
      // unchecking a person means it's no longer the whole role.
      setTitles((prev) => prev.filter((t) => t !== title));
    }
  }

  return (
    <div>
      <label className="flex items-center gap-2 rounded-md border border-brand-light/40 bg-sky-50 px-3 py-2 dark:bg-sky-950/30">
        <input
          type="checkbox"
          name={everyoneName}
          checked={everyone}
          onChange={(e) => handleEveryone(e.target.checked)}
          className="h-4 w-4 accent-brand"
        />
        <span className="flex-1 text-sm font-medium text-foreground">Everyone</span>
        <span className="text-xs text-muted">all staff</span>
      </label>

      <details
        className="mt-2"
        open={open}
        onToggle={(e) => handleOpen(e.currentTarget.open)}
      >
        <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:text-foreground [&::-webkit-details-marker]:hidden">
          More options
          <svg
            viewBox="0 0 20 20"
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>

        <div className="mt-2 space-y-1">
          {POSITIONS.map((title) => {
            const people = staffByTitle[title] || [];
            return (
              <div key={title}>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    name={titlesName}
                    value={title}
                    checked={titles.includes(title)}
                    onChange={(e) => toggleTitle(title, e.target.checked)}
                    className="h-4 w-4 accent-brand"
                  />
                  {title}
                  {people.length > 0 && (
                    <span className="text-xs text-muted">({people.length})</span>
                  )}
                </label>
                {people.length > 0 && (
                  <details className="ml-6 mt-0.5">
                    <summary className="cursor-pointer select-none text-xs text-muted hover:text-brand">
                      or pick specific people
                    </summary>
                    <div className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {people.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 text-xs text-foreground"
                        >
                          <input
                            type="checkbox"
                            name={userIdsName}
                            value={p.id}
                            checked={userIds.includes(p.id)}
                            onChange={(e) =>
                              togglePerson(p.id, title, e.target.checked)
                            }
                            className="h-3.5 w-3.5 accent-brand"
                          />
                          <span className="truncate">{p.name}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
          <p className="pt-1 text-xs text-muted">
            Check a title for the whole role, or expand it to pick certain people.
          </p>
        </div>
      </details>
    </div>
  );
}
