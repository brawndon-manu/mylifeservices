"use client";

// admin-only override controls on the meeting roster: a per-person kebab (move a
// pick / remove), a walk-in "add someone to this session" picker, and a record-
// response menu for people who never answered. each item is a plain <form> that
// submits a server action (bound with its ids) and reloads - same pattern as the
// present/absent roll-call buttons, so it stays simple.
import { createContext, useContext, useState } from "react";
import Avatar from "@/components/Avatar";

// the override controls stay hidden until an admin flips "Manual override" on, so
// the roster reads clean by default (roll-call Present/Absent stays visible).
const OverrideCtx = createContext({ show: false, setShow: () => {} });

export function OverrideProvider({ children }) {
  const [show, setShow] = useState(false);
  return <OverrideCtx.Provider value={{ show, setShow }}>{children}</OverrideCtx.Provider>;
}

export function OverrideToggle() {
  const { show, setShow } = useContext(OverrideCtx);
  return (
    <button
      type="button"
      onClick={() => setShow((v) => !v)}
      className={`flex-none rounded-md border px-2.5 py-1 text-xs font-medium transition ${
        show
          ? "border-brand bg-brand/10 text-brand"
          : "border-border-strong text-muted hover:border-brand hover:text-brand"
      }`}
    >
      {show ? "Done overriding" : "Manual override"}
    </button>
  );
}

function useOverrideShown() {
  return useContext(OverrideCtx).show;
}

// a light dropdown: a trigger + an absolutely-positioned panel with a full-screen
// backdrop that closes it on an outside click.
function Dropdown({ trigger, children, align = "right", width = "w-56" }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative flex-none">
      <span onClick={() => setOpen((v) => !v)}>{trigger}</span>
      {open && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`absolute z-50 mt-1 ${align === "right" ? "right-0" : "left-0"} ${width} rounded-xl border border-border-strong bg-surface p-1.5 shadow-lg`}
            onClick={() => setOpen(false)}
          >
            {children}
          </div>
        </>
      )}
    </span>
  );
}

const ITEM =
  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition hover:bg-surface-2";
const SUBHEAD =
  "px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint";

// kebab for a going person: move their pick to another session, or remove them.
export function PersonKebab({ postId, userId, currentOptionId, moveTargets, move, remove }) {
  if (!useOverrideShown()) return null;
  return (
    <Dropdown
      trigger={
        <button
          type="button"
          aria-label="More"
          className="flex h-6 w-7 items-center justify-center rounded-md border border-border-strong text-muted transition hover:text-foreground"
        >
          &#8942;
        </button>
      }
    >
      {moveTargets.length > 0 && (
        <>
          <p className={SUBHEAD}>Move to another session</p>
          {moveTargets.map((t) => (
            <form key={t.id} action={move.bind(null, postId, userId, currentOptionId, t.id)}>
              <button type="submit" className={ITEM}>
                <span className="text-muted">&#8646;</span>
                <span className="truncate">
                  {t.seriesLabel ? `${t.seriesLabel}: ` : ""}
                  {t.label}
                </span>
              </button>
            </form>
          ))}
          <div className="my-1 h-px bg-border" />
        </>
      )}
      <form action={remove.bind(null, postId, userId)}>
        <button type="submit" className={`${ITEM} text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40`}>
          <span>&times;</span> Remove from meeting
        </button>
      </form>
    </Dropdown>
  );
}

// "+ Add someone to this session" - a searchable list of audience people not
// already going to this session (walk-ins). adds them going + marks the ack.
export function AddToSession({ postId, optionId, candidates, add }) {
  const show = useOverrideShown();
  const [q, setQ] = useState("");
  if (!show) return null;
  const list = q
    ? candidates.filter((c) => c.displayName.toLowerCase().includes(q.toLowerCase()))
    : candidates;
  return (
    <Dropdown
      align="left"
      width="w-72"
      trigger={
        <button
          type="button"
          className="rounded-md border border-dashed border-brand-light/50 px-2.5 py-1 text-xs font-semibold text-brand-light transition hover:bg-brand-light/10"
        >
          + Add someone to this session
        </button>
      }
    >
      <div onClick={(e) => e.stopPropagation()} className="p-1">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people"
          className="mb-1 block w-full rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-sm text-foreground focus:border-brand focus:outline-none"
        />
        <div className="max-h-60 overflow-y-auto">
          {list.length === 0 ? (
            <p className="px-2 py-2 text-xs text-faint">nobody to add</p>
          ) : (
            list.map((c) => (
              <form key={c.id} action={add.bind(null, postId, c.id, optionId)}>
                <button type="submit" className={ITEM}>
                  <Avatar name={c.displayName} image={c.image} size={22} />
                  <span className="min-w-0">
                    <span className="block truncate">{c.displayName}</span>
                    {c.title && <span className="block truncate text-xs text-muted">{c.title}</span>}
                  </span>
                </button>
              </form>
            ))
          )}
        </div>
      </div>
    </Dropdown>
  );
}

// for a person who never responded: record them going (pick a session, or "going"
// on a single-session meeting), mark can't-make-it, or just mark acknowledged.
export function RecordResponse({
  postId,
  userId,
  sessions,
  hasSessions,
  requireAck,
  addToSession,
  setGoing,
  cantMake,
  markAck,
}) {
  if (!useOverrideShown()) return null;
  return (
    <span className="flex flex-none items-center gap-1.5">
      <Dropdown
        trigger={
          <button
            type="button"
            className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-brand hover:text-brand"
          >
            Record response &#9662;
          </button>
        }
      >
        <p className={SUBHEAD}>{hasSessions ? "Mark going to" : "Response"}</p>
        {hasSessions ? (
          sessions.map((s) => (
            <form key={s.id} action={addToSession.bind(null, postId, userId, s.id)}>
              <button type="submit" className={ITEM}>
                <span className="truncate">
                  {s.seriesLabel ? `${s.seriesLabel}: ` : ""}
                  {s.label}
                </span>
              </button>
            </form>
          ))
        ) : (
          <form action={setGoing.bind(null, postId, userId)}>
            <button type="submit" className={ITEM}>
              Going
            </button>
          </form>
        )}
        <div className="my-1 h-px bg-border" />
        <form action={cantMake.bind(null, postId, userId)}>
          <button type="submit" className={`${ITEM} text-rose-600 dark:text-rose-400`}>
            <span>&times;</span> Can&apos;t make it
          </button>
        </form>
      </Dropdown>
      {requireAck && (
        <form action={markAck.bind(null, postId, userId)}>
          <button
            type="submit"
            className="rounded-md border border-brand-light/50 px-2.5 py-1 text-xs font-semibold text-brand-light transition hover:bg-brand-light/10"
          >
            Mark acknowledged
          </button>
        </form>
      )}
    </span>
  );
}

// a single "Mark acknowledged" button for the (non-meeting) acknowledgment roster.
export function MarkAckButton({ postId, userId, markAck }) {
  if (!useOverrideShown()) return null;
  return (
    <form action={markAck.bind(null, postId, userId)} className="ml-auto flex-none">
      <button
        type="submit"
        className="rounded-md border border-brand-light/50 px-2.5 py-1 text-xs font-semibold text-brand-light transition hover:bg-brand-light/10"
      >
        Mark acknowledged
      </button>
    </form>
  );
}
