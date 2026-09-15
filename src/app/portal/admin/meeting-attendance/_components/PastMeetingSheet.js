"use client";

// THE SHEET THAT RECORDS A MEETING THAT ALREADY HAPPENED.
//
// What is deliberately NOT here is the point: no body, no audience picker, no
// format, no reminder lead, no night-before, no response deadline, no
// attestation form. None of it means anything once the meeting is over, and
// the announcement form demands most of it.
//
// SERIES ARE THE NORMAL SHAPE. Both real multi-date meetings run as a named
// series of two sessions with staff picking one - "Week 1" holding Session 1
// and Session 2 - and the old ones were run the same way, with a separate
// sign-in sheet per date. So attendance is marked ONE SESSION AT A TIME: pick
// the session, tick the people off that sheet, move to the next. The roster
// below never changes shape, and nobody has to remember which sheet a name
// came off.
import { useMemo, useState } from "react";
import { CalendarPlus, Check, Plus, Search, Trash2, X } from "lucide-react";
import DatePicker from "@/components/DatePicker";
import { MEETING_KINDS, ATTACH_ACCEPT, ATTACH_MAX_BYTES, ATTACH_MAX_COUNT } from "@/lib/announcements";
import { createPastMeeting } from "../past-meeting-actions";

const INPUT =
  "mt-1 w-full rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const LABEL = "block text-xs font-semibold text-foreground";

// ids exist only for this form. The server mints its own and maps the marks
// across, so nothing typed here reaches a stored record.
let seq = 0;
const nextId = () => `t${++seq}`;

const newSession = () => ({ id: nextId(), date: "" });
const newSeries = () => ({ id: nextId(), label: "", sessions: [newSession()] });

export default function PastMeetingSheet({ staff = [], docs = [] }) {
  const [open, setOpen] = useState(false);
  const [series, setSeries] = useState(() => [newSeries()]);
  const [q, setQ] = useState("");
  // { [sessionId]: { [userId]: "present" | "absent" } } - keyed by session even
  // when there is only one, so the single and series cases share one path
  const [marks, setMarks] = useState({});
  const [active, setActive] = useState(null);

  // every session that has a date on it, in the order they were entered
  const sessions = useMemo(() => {
    const out = [];
    for (const g of series) {
      let n = 0;
      for (const s of g.sessions) {
        if (!s.date) continue;
        n += 1;
        out.push({
          id: s.id,
          date: s.date,
          label: g.label ? `${g.label} · Session ${n}` : `Session ${n}`,
          bare: `Session ${n}`,
        });
      }
    }
    return out;
  }, [series]);

  const activeId = sessions.some((s) => s.id === active) ? active : sessions[0]?.id || null;
  const activeMarks = (activeId && marks[activeId]) || {};

  const countFor = (id, status) =>
    Object.values(marks[id] || {}).filter((v) => v === status).length;
  const totalMarked = useMemo(
    () => new Set(Object.values(marks).flatMap((m) => Object.keys(m))).size,
    [marks],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return staff;
    return staff.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        (s.title || "").toLowerCase().includes(needle),
    );
  }, [q, staff]);

  const mark = (userId, value) => {
    if (!activeId) return;
    setMarks((m) => {
      const forSession = { ...(m[activeId] || {}) };
      if (forSession[userId] === value) delete forSession[userId];
      else forSession[userId] = value;
      return { ...m, [activeId]: forSession };
    });
  };

  const patchSeries = (id, patch) =>
    setSeries((list) => list.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  const patchSession = (gid, sid, date) =>
    setSeries((list) =>
      list.map((g) =>
        g.id === gid
          ? { ...g, sessions: g.sessions.map((s) => (s.id === sid ? { ...s, date } : s)) }
          : g,
      ),
    );

  // dropping a date takes its marks with it, or the form would post attendance
  // for a session that is not being created
  const dropSession = (gid, sid) => {
    setSeries((list) =>
      list.map((g) =>
        g.id === gid ? { ...g, sessions: g.sessions.filter((s) => s.id !== sid) } : g,
      ),
    );
    setMarks((m) => {
      const { [sid]: _gone, ...rest } = m;
      return rest;
    });
  };

  const dropSeries = (gid) => {
    const g = series.find((x) => x.id === gid);
    setSeries((list) => (list.length > 1 ? list.filter((x) => x.id !== gid) : list));
    if (g) {
      setMarks((m) => {
        const next = { ...m };
        for (const s of g.sessions) delete next[s.id];
        return next;
      });
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3.5 py-1.5 text-sm font-semibold text-foreground transition hover:border-brand hover:text-brand"
      >
        <CalendarPlus size={15} aria-hidden="true" />
        Add a past meeting
      </button>
    );
  }

  return (
    <div className="mt-4 w-full rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex items-start gap-4 border-b border-border p-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold tracking-tight text-foreground">
            Add a past meeting
          </h2>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">
            A meeting that ran before the portal held them. It is a record, not a
            post: no email is sent, staff never see it, and no reminders go out.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="rounded-md p-1 text-muted transition hover:bg-surface-2 hover:text-foreground"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <form action={createPastMeeting}>
        <div className="space-y-5 p-5">
          <div>
            <label htmlFor="pm-title" className={LABEL}>
              What it was called
            </label>
            <input
              id="pm-title"
              name="title"
              type="text"
              required
              maxLength={200}
              placeholder="Workplace safety refresher"
              className={INPUT}
            />
          </div>

          {/* WHEN IT RAN. One date and it is one meeting. Name a series and give
              it two dates and it is the shape both real training meetings use:
              staff picked one of the two, and each had its own sign-in sheet. */}
          <div>
            <span className={LABEL}>When it ran</span>
            <div className="mt-1.5 space-y-2.5">
              {series.map((g, gi) => (
                <div key={g.id} className="rounded-xl border border-border bg-surface-2 p-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={g.label}
                      onChange={(e) => patchSeries(g.id, { label: e.target.value })}
                      maxLength={80}
                      placeholder={series.length > 1 ? `Series name, e.g. Week ${gi + 1}` : "Series name (optional, e.g. Week 1)"}
                      className="min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-[13px] font-medium text-foreground placeholder:font-normal placeholder:text-faint focus:border-brand focus:outline-none"
                    />
                    {series.length > 1 && (
                      <button
                        type="button"
                        onClick={() => dropSeries(g.id)}
                        aria-label="Remove this series"
                        className="rounded-md p-1.5 text-muted transition hover:bg-surface hover:text-rose-600 dark:hover:text-rose-400"
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 space-y-2">
                    {g.sessions.map((s, si) => (
                      <div key={s.id} className="flex items-end gap-2">
                        <div className="min-w-0 flex-1">
                          <DatePicker
                            label={`Session ${si + 1}`}
                            value={s.date}
                            onChange={(v) => patchSession(g.id, s.id, v)}
                            inputClassName="mt-1 w-full rounded-lg border border-border-strong bg-surface px-3 py-1.5 pr-10 text-sm text-foreground focus:border-brand focus:outline-none"
                          />
                        </div>
                        {g.sessions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => dropSession(g.id, s.id)}
                            aria-label={`Remove session ${si + 1}`}
                            className="mb-1 rounded-md p-1.5 text-muted transition hover:bg-surface hover:text-rose-600 dark:hover:text-rose-400"
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      patchSeries(g.id, { sessions: [...g.sessions, newSession()] })
                    }
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                  >
                    <Plus size={13} aria-hidden="true" /> Add a date to this series
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSeries((l) => [...l, newSeries()])}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:border-brand hover:text-brand"
            >
              <Plus size={13} aria-hidden="true" /> Add another series
            </button>
            <p className="mt-1.5 text-xs text-muted">
              One date on its own is a single meeting. Name a series and give it
              two dates when people picked one of the two.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pm-source" className={LABEL}>
                Where the attendance was kept{" "}
                <span className="font-normal text-faint">(optional)</span>
              </label>
              <input
                id="pm-source"
                name="meetingRecordSource"
                type="text"
                maxLength={120}
                placeholder="Google Doc, sign-in sheet"
                className={INPUT}
              />
            </div>
            <div>
              <span className={LABEL}>Kind</span>
              <div className="mt-1.5 inline-flex flex-wrap gap-1 rounded-xl border border-border-strong bg-surface-2 p-1">
                {MEETING_KINDS.map((k, i) => (
                  <label key={k} className="cursor-pointer">
                    <input
                      type="radio"
                      name="meetingKind"
                      value={k}
                      defaultChecked={i === 0}
                      className="peer sr-only"
                    />
                    <span className="block rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-muted transition peer-checked:bg-surface peer-checked:font-semibold peer-checked:text-foreground peer-checked:shadow-sm">
                      {k}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="pm-topics" className={LABEL}>
              Topics covered <span className="font-normal text-faint">(optional)</span>
            </label>
            <textarea
              id="pm-topics"
              name="meetingTopics"
              rows={4}
              placeholder={"Call-outs and missed sessions\nDocumenting a visit in QSP"}
              className={INPUT}
            />
            <p className="mt-1 text-xs text-muted">
              One topic per line. They print on the attendance report under what
              was covered.
            </p>
          </div>

          {/* SLIDES AND HANDOUTS. The library first, because every document
              ever attached to a post has come from there, and an upload for
              the deck that never made it into the library. */}
          <div>
            <span className={LABEL}>
              Slides and handouts <span className="font-normal text-faint">(optional)</span>
            </span>
            {docs.length > 0 && (
              <details className="mt-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  Attach from the forms library
                </summary>
                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                  {docs.map((f) => (
                    <label key={f.id} className="flex items-start gap-2 text-sm text-muted">
                      <input
                        type="checkbox"
                        name="attachFormIds"
                        value={f.id}
                        className="mt-0.5 h-4 w-4 accent-brand"
                      />
                      <span>
                        {f.title}
                        {f.category && (
                          <span className="ml-2 text-xs text-faint">{f.category}</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </details>
            )}
            <input
              name="attachments"
              type="file"
              multiple
              accept={ATTACH_ACCEPT.join(",")}
              className="mt-2 block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-brand-light file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-brand"
            />
            <p className="mt-1 text-xs text-muted">
              PDF only, up to {Math.round(ATTACH_MAX_BYTES / (1024 * 1024))} MB each
              and {ATTACH_MAX_COUNT} in total. They are carried inside the
              attendance report, not just linked from it.
            </p>
          </div>

          <div>
            <span className={LABEL}>Who was there</span>

            {sessions.length === 0 ? (
              <p className="mt-1.5 rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted">
                Put a date on it first, then tick off who was there.
              </p>
            ) : (
              <>
                {/* ONE SHEET AT A TIME. Each date had its own sign-in sheet, so
                    the switcher is the sheet you are holding. It shows its own
                    running counts, because a series is only finished when every
                    session has been through. */}
                {sessions.length > 1 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {sessions.map((s) => {
                      const on = s.id === activeId;
                      const p = countFor(s.id, "present");
                      const a = countFor(s.id, "absent");
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setActive(s.id)}
                          aria-pressed={on}
                          className={`rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] transition ${
                            on
                              ? "border-brand bg-brand/10 text-foreground"
                              : "border-border-strong text-muted hover:border-brand hover:text-foreground"
                          }`}
                        >
                          <span className="block font-semibold">{s.label}</span>
                          <span className="block text-[11px] text-muted">
                            {s.date || "no date"}
                            {p || a ? ` · ${p} present · ${a} absent` : " · nobody yet"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-2 overflow-hidden rounded-xl border border-border">
                  <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-2">
                    <Search size={15} aria-hidden="true" className="shrink-0 text-faint" />
                    <input
                      type="text"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder={`Search ${staff.length} staff by name`}
                      className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-faint focus:outline-none"
                    />
                    <span className="shrink-0 whitespace-nowrap text-xs text-muted">
                      {countFor(activeId, "present")} present · {countFor(activeId, "absent")} absent
                    </span>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {shown.length === 0 ? (
                      <p className="px-3 py-6 text-center text-sm text-muted">
                        Nobody matches that.
                      </p>
                    ) : (
                      shown.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center gap-3 border-t border-border px-3 py-2 first:border-t-0"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
                            {s.title && (
                              <p className="truncate text-[11.5px] text-faint">{s.title}</p>
                            )}
                          </div>
                          <span className="flex shrink-0 gap-1">
                            <Mark
                              on={activeMarks[s.id] === "present"}
                              tone="present"
                              onClick={() => mark(s.id, "present")}
                            >
                              Present
                            </Mark>
                            <Mark
                              on={activeMarks[s.id] === "absent"}
                              tone="absent"
                              onClick={() => mark(s.id, "absent")}
                            >
                              Absent
                            </Mark>
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  Anybody left unmarked is not on the record at all. Mark Absent
                  only where the old sheet names somebody who was expected and did
                  not come.
                </p>
              </>
            )}
          </div>

          {/* the shapes the server reads. JSON rather than repeated fields
              because both are nested, and the same reason the announcement form
              posts its own sessions as one string. */}
          <input
            type="hidden"
            name="sessions"
            value={JSON.stringify(
              series.map((g) => ({
                label: g.label,
                sessions: g.sessions.filter((s) => s.date).map((s) => ({ id: s.id, date: s.date })),
              })),
            )}
          />
          <input type="hidden" name="attendance" value={JSON.stringify(marks)} />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border bg-surface-2 px-5 py-3.5">
          <span className="text-[13px] text-muted">
            <b className="font-semibold text-foreground">{totalMarked}</b>{" "}
            {totalMarked === 1 ? "person" : "people"} on the record
            {sessions.length > 1 ? ` across ${sessions.length} sessions` : ""}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted transition hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!totalMarked || !sessions.length}
            className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save the record
          </button>
        </div>
      </form>
    </div>
  );
}

function Mark({ on, tone, onClick, children }) {
  const style = on
    ? tone === "present"
      ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-400"
    : "border-border-strong text-muted hover:border-brand hover:text-brand";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11.5px] font-semibold transition ${style}`}
    >
      {on && <Check size={11} strokeWidth={3} aria-hidden="true" />}
      {children}
    </button>
  );
}
