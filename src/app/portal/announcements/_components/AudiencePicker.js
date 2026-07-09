"use client";

// shared audience picker for announcements: Everyone, or specific job titles, and
// under each title an optional "pick specific people" list. used by the create/edit
// form AND the Send-by-email dialog (field names are configurable so each context
// posts the names its server action expects).
//
// design: the actual posted audience is driven by STATE and written to hidden
// inputs, so expanding/collapsing a role never drops a selection. each role shows a
// tri-state box (empty / dash = some / check = all), a "N selected" badge + tint so
// you can see picks without expanding, a running total up top, and the list scrolls
// in a fixed height. whole roles post as titles (compact), the rest as user ids.
import { useEffect, useRef, useState } from "react";
import { POSITIONS } from "@/lib/positions";

function TriCheckbox({ checked, indeterminate, onChange, className }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className={className}
    />
  );
}

export default function AudiencePicker({
  everyoneName,
  titlesName,
  userIdsName,
  staffByTitle = {},
  defaultEveryone = true,
  defaultTitles = [],
  defaultUserIds = [],
  everyoneTotal = null,
  onChange,
  // when "Everyone" is on we normally dim the role/person list (it's moot). set
  // false to keep it crisp + clickable so the author can still narrow it down.
  dimWhenEveryone = true,
}) {
  const peopleOf = (t) => (staffByTitle[t] || []).map((p) => p.id);
  const uniq = (a) => [...new Set(a)];

  const [everyone, setEveryone] = useState(defaultEveryone !== false);
  const [userIds, setUserIds] = useState(() =>
    uniq([...(defaultUserIds || []), ...(defaultTitles || []).flatMap(peopleOf)]),
  );
  const [expanded, setExpanded] = useState(() => new Set(defaultTitles || []));
  const [search, setSearch] = useState({});

  // roles present in this picker's pool (non-empty), in POSITIONS order.
  const roles = POSITIONS.filter((t) => (staffByTitle[t] || []).length > 0);
  const selSet = new Set(userIds);
  const selCountOf = (t) => peopleOf(t).filter((id) => selSet.has(id)).length;
  const allSel = (t) => {
    const p = peopleOf(t);
    return p.length > 0 && p.every((id) => selSet.has(id));
  };

  // compact posted audience: whole roles as titles, everyone else as ids.
  const wholeRoles = roles.filter(allSel);
  const wholeIds = new Set(wholeRoles.flatMap(peopleOf));
  const individualIds = userIds.filter((id) => !wholeIds.has(id));

  useEffect(() => {
    onChange?.({ everyone, titles: wholeRoles, userIds: individualIds });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [everyone, userIds]);

  function toggleRole(t, checked) {
    setEveryone(false);
    const ids = peopleOf(t);
    setUserIds((prev) =>
      checked ? uniq([...prev, ...ids]) : prev.filter((id) => !ids.includes(id)),
    );
  }
  function togglePerson(id, checked) {
    setEveryone(false);
    setUserIds((prev) => (checked ? uniq([...prev, id]) : prev.filter((x) => x !== id)));
  }
  function toggleExpand(t) {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(t) ? n.delete(t) : n.add(t);
      return n;
    });
  }

  const totalSelected = userIds.length;

  return (
    <div>
      {/* hidden fields = the actual posted audience (state-driven) */}
      {everyone && <input type="hidden" name={everyoneName} value="on" />}
      {!everyone &&
        wholeRoles.map((t) => <input key={t} type="hidden" name={titlesName} value={t} />)}
      {!everyone &&
        individualIds.map((id) => (
          <input key={id} type="hidden" name={userIdsName} value={id} />
        ))}

      <div className="mb-2 flex justify-end">
        <span className="rounded-full border border-brand-light/30 bg-brand-light/10 px-2.5 py-0.5 text-xs font-semibold text-brand-dark">
          {everyone
            ? `Everyone${everyoneTotal != null ? ` · ${everyoneTotal}` : ""}`
            : totalSelected > 0
              ? `${totalSelected} selected`
              : "None selected"}
        </span>
      </div>

      <label className="flex items-center gap-2.5 rounded-lg border border-brand-light/40 bg-sky-50 px-3 py-2.5 dark:bg-sky-950/30">
        <input
          type="checkbox"
          checked={everyone}
          onChange={(e) => setEveryone(e.target.checked)}
          className="h-4 w-4 accent-brand"
        />
        <span className="flex-1 text-sm font-medium text-foreground">Everyone</span>
        <span className="text-xs text-muted">
          all staff{everyoneTotal != null ? ` · ${everyoneTotal}` : ""}
        </span>
      </label>

      <div className="my-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
        <span className="h-px flex-1 bg-border" /> or by role / person{" "}
        <span className="h-px flex-1 bg-border" />
      </div>

      <div
        className={`max-h-72 space-y-0.5 overflow-y-auto pr-1 ${
          everyone && dimWhenEveryone ? "pointer-events-none opacity-50" : ""
        }`}
      >
        {roles.map((t) => {
          const people = staffByTitle[t] || [];
          const n = selCountOf(t);
          const all = allSel(t);
          const part = n > 0 && !all;
          const isOpen = expanded.has(t);
          const q = (search[t] || "").toLowerCase();
          const shown = q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
          return (
            <div
              key={t}
              className={`rounded-lg ${n > 0 ? "bg-sky-50 dark:bg-sky-950/25" : ""}`}
            >
              <div className="flex items-center gap-2.5 px-2.5 py-2">
                <TriCheckbox
                  checked={all}
                  indeterminate={part}
                  onChange={(e) => toggleRole(t, e.target.checked)}
                  className="h-4 w-4 accent-brand"
                />
                <button
                  type="button"
                  onClick={() => toggleExpand(t)}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <span className="text-sm text-foreground">{t}</span>
                  <span className="text-xs text-faint">{people.length}</span>
                  {n > 0 && (
                    <span className="rounded-full bg-brand-light/15 px-2 py-0.5 text-[11px] font-semibold text-brand">
                      {n} selected
                    </span>
                  )}
                  <svg
                    viewBox="0 0 20 20"
                    className={`ml-auto h-4 w-4 flex-none text-faint transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              {isOpen && (
                <div className="mb-1.5 ml-9 border-l border-border pl-3">
                  {people.length > 8 && (
                    <input
                      value={search[t] || ""}
                      onChange={(e) => setSearch((s) => ({ ...s, [t]: e.target.value }))}
                      placeholder="Search this role…"
                      className="mb-2 block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-faint focus:border-brand focus:outline-none"
                    />
                  )}
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {shown.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 text-xs text-foreground"
                      >
                        <input
                          type="checkbox"
                          checked={selSet.has(p.id)}
                          onChange={(e) => togglePerson(p.id, e.target.checked)}
                          className="h-3.5 w-3.5 accent-brand"
                        />
                        <span className="truncate">{p.name}</span>
                      </label>
                    ))}
                    {shown.length === 0 && (
                      <span className="text-xs text-faint">no match</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="pt-2 text-xs text-muted">
        Check a role for everyone in it, or expand it to pick certain people.
      </p>
    </div>
  );
}
