"use client";

// THE CLIENT LIST WITH A FILTER BOX - and, since 2026-09-02, the reviewers'
// marks. A star says prioritize this one; a flag carries its note, the shape
// a flagged shift has on the timesheet review. Chips narrow to starred /
// flagged / surveyed / not surveyed, and the sort can run on first or last
// name (the roster prints "Last, First", so last name is the natural order
// and first name is read out from after the comma).
//
// EVERY MARK ANSWERS ITS CLICK AT ONCE - the same optimistic pattern the
// roster picker uses: the row updates the moment it is pressed, the server
// catches up underneath, and a failure puts the mark back rather than lying.
import { useState } from "react";
import Link from "next/link";

const CHIPS = [
  { key: "all", label: "All" },
  { key: "starred", label: "Starred" },
  { key: "flagged", label: "Flagged" },
  { key: "surveyed", label: "Surveyed" },
  { key: "notsurveyed", label: "Not surveyed" },
];

// "Acuna, Jacob" -> "Jacob" for the first-name sort; a name with no comma
// sorts by what it is
const firstNameOf = (name) => {
  const i = String(name || "").indexOf(",");
  return i >= 0 ? name.slice(i + 1).trim() : String(name || "");
};

export default function SurveyList({ rows, mark }) {
  const [q, setQ] = useState("");
  const [chip, setChip] = useState("all");
  const [sortBy, setSortBy] = useState("last");
  // clientId -> { starred, flagged, note } written the moment a control is
  // pressed; the server-built row is the fallback under it
  const [local, setLocal] = useState({});
  // which row's flag note editor is open, and its draft text
  const [noteFor, setNoteFor] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");

  const stateOf = (r) => ({
    starred: local[r.id]?.starred ?? r.starred,
    flagged: local[r.id]?.flagged ?? r.flagged,
    note: local[r.id]?.note !== undefined ? local[r.id].note : r.note,
  });

  const send = (r, next) => {
    const prev = stateOf(r);
    setLocal((l) => ({ ...l, [r.id]: next }));
    mark({ clientId: r.id, ...next }).then(
      (res) => {
        if (!res?.ok) setLocal((l) => ({ ...l, [r.id]: prev }));
      },
      () => setLocal((l) => ({ ...l, [r.id]: prev })),
    );
  };

  const toggleStar = (r) => {
    const cur = stateOf(r);
    send(r, { ...cur, starred: !cur.starred });
  };

  const toggleFlag = (r) => {
    const cur = stateOf(r);
    if (cur.flagged) {
      // unflagging takes the note with it, the way clearing a flagged shift does
      send(r, { ...cur, flagged: false, note: null });
      if (noteFor === r.id) setNoteFor(null);
    } else {
      setNoteFor(r.id);
      setNoteDraft(cur.note || "");
    }
  };

  const saveFlag = (r) => {
    const cur = stateOf(r);
    send(r, { ...cur, flagged: true, note: noteDraft.trim() || null });
    setNoteFor(null);
  };

  const needle = q.trim().toLowerCase();
  const shown = rows
    .filter((r) => {
      if (
        needle &&
        !r.name.toLowerCase().includes(needle) &&
        !(r.staff || "").toLowerCase().includes(needle)
      ) {
        return false;
      }
      const cur = stateOf(r);
      if (chip === "starred") return cur.starred;
      if (chip === "flagged") return cur.flagged;
      if (chip === "surveyed") return !!r.latest;
      if (chip === "notsurveyed") return !r.latest;
      return true;
    })
    .sort((a, b) =>
      sortBy === "first"
        ? firstNameOf(a.name).localeCompare(firstNameOf(b.name))
        : a.name.localeCompare(b.name),
    );

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
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
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setChip(c.key)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                chip === c.key
                  ? "border-brand bg-brand text-white"
                  : "border-border-strong text-muted hover:border-brand hover:text-brand"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span>Sort</span>
          {[
            { key: "last", label: "Last name" },
            { key: "first", label: "First name" },
          ].map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setSortBy(o.key)}
              className={`rounded-full border px-3 py-1 font-semibold transition ${
                sortBy === o.key
                  ? "border-brand bg-brand text-white"
                  : "border-border-strong text-muted hover:border-brand hover:text-brand"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted">
              <th className="w-20 px-4 py-3" aria-label="Marks" />
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Assigned staff</th>
              <th className="px-4 py-3">Latest survey</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((r) => {
              const cur = stateOf(r);
              return (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleStar(r)}
                      aria-label={cur.starred ? "Unstar" : "Star"}
                      title={cur.starred ? "Unstar" : "Star"}
                      className={`text-lg leading-none transition ${
                        cur.starred ? "text-amber-500" : "text-faint hover:text-amber-500"
                      }`}
                    >
                      {cur.starred ? "★" : "☆"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFlag(r)}
                      aria-label={cur.flagged ? "Unflag" : "Flag"}
                      title={cur.flagged ? "Unflag" : "Flag"}
                      className={`ml-2 text-base leading-none transition ${
                        cur.flagged ? "text-rose-600 dark:text-rose-400" : "text-faint hover:text-rose-600"
                      }`}
                    >
                      {"⚑"}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {r.name}
                    {cur.flagged && cur.note && noteFor !== r.id && (
                      <span className="mt-0.5 block max-w-xs whitespace-normal border-l-2 border-rose-300 pl-2 text-xs font-normal italic text-muted">
                        {cur.note}
                      </span>
                    )}
                    {noteFor === r.id && (
                      <span className="mt-1.5 block max-w-xs whitespace-normal font-normal">
                        <input
                          autoFocus
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveFlag(r);
                            if (e.key === "Escape") setNoteFor(null);
                          }}
                          maxLength={500}
                          placeholder="Note for reviewers (optional)"
                          className="block w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground placeholder:text-faint focus:border-brand focus:outline-none"
                        />
                        <span className="mt-1.5 flex gap-2">
                          <button
                            type="button"
                            onClick={() => saveFlag(r)}
                            className="rounded bg-brand px-2.5 py-1 text-[11px] font-semibold text-white"
                          >
                            Flag
                          </button>
                          <button
                            type="button"
                            onClick={() => setNoteFor(null)}
                            className="text-[11px] text-muted underline hover:text-foreground"
                          >
                            Cancel
                          </button>
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{r.staff || "–"}</td>
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
              );
            })}
            {!shown.length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">
                  {needle ? `No clients match “${q}”.` : "No clients here."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {(needle || chip !== "all") && shown.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          {shown.length} of {rows.length} clients shown.
        </p>
      )}
    </div>
  );
}
