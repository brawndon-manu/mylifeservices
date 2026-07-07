"use client";

// admin-only override controls on the meeting roster: a per-person kebab (move a
// pick / remove), a walk-in "add someone to this session" picker, and a record-
// response menu for people who never answered. each item is a plain <form> that
// submits a server action (bound with its ids) and reloads - same pattern as the
// present/absent roll-call buttons, so it stays simple.
import { createContext, useContext, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

export function useOverrideShown() {
  return useContext(OverrideCtx).show;
}

// a light dropdown. the menu is portaled to <body> with fixed positioning so it
// isn't clipped by the roster card's overflow-hidden - it hangs over the card and
// shows every option. flips upward when the trigger sits low in the viewport.
function Dropdown({ trigger, children, align = "right", width = "w-56" }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);

  const place = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const up = r.bottom > window.innerHeight * 0.6;
    setPos({
      up,
      top: up ? undefined : r.bottom + 4,
      bottom: up ? window.innerHeight - r.top + 4 : undefined,
      right: window.innerWidth - r.right,
      left: r.left,
    });
  };
  const toggle = () => {
    if (!open) place();
    setOpen((v) => !v);
  };

  const style = pos
    ? {
        top: pos.top,
        bottom: pos.bottom,
        ...(align === "right" ? { right: pos.right } : { left: pos.left }),
      }
    : {};

  return (
    <span ref={ref} className="flex-none">
      <span onClick={toggle}>{trigger}</span>
      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
            <div
              style={style}
              className={`fixed z-[61] ${width} max-h-[70vh] overflow-y-auto rounded-xl border border-border-strong bg-surface p-1.5 shadow-lg`}
              onClick={() => setOpen(false)}
            >
              {children}
            </div>
          </>,
          document.body,
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

// for a person who never responded: record them going. a series meeting picks
// one date per series then confirms; a flat/single meeting picks a session (or
// "Going") directly. plus can't-make-it.
export function RecordResponse({
  postId,
  userId,
  sessions,
  hasSessions,
  isSeries = false,
  seriesGroups = [],
  addToSession,
  setGoing,
  cantMake,
  record,
}) {
  if (!useOverrideShown()) return null;
  const cantForm = (label) => (
    <form action={cantMake.bind(null, postId, userId)}>
      <button type="submit" className={`${ITEM} text-rose-600 dark:text-rose-400`}>
        <span>&times;</span> {label}
      </button>
    </form>
  );
  return (
    <span className="flex flex-none items-center gap-1.5">
      <Dropdown
        width="w-64"
        trigger={
          <button
            type="button"
            className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-brand hover:text-brand"
          >
            Record response &#9662;
          </button>
        }
      >
        {isSeries ? (
          <SeriesRecord
            postId={postId}
            userId={userId}
            seriesGroups={seriesGroups}
            record={record}
            cantMake={cantMake}
          />
        ) : (
          <>
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
            {cantForm("Can't make it")}
          </>
        )}
      </Dropdown>
    </span>
  );
}

// series: pick one date per series, then Confirm going. stops click-propagation
// so interacting doesn't close the dropdown.
function SeriesRecord({ postId, userId, seriesGroups, record, cantMake }) {
  const [picks, setPicks] = useState({});
  const done = seriesGroups.filter((g) => picks[g.id]).length;
  const allPicked = done === seriesGroups.length;
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <form action={record.bind(null, postId, userId)}>
        {seriesGroups.map((g) => (
          <input key={g.id} type="hidden" name="optionId" value={picks[g.id] || ""} />
        ))}
        {seriesGroups.map((g) => (
          <div key={g.id} className="mb-1">
            <p className={SUBHEAD}>{g.label}</p>
            {g.options.map((o) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-foreground hover:bg-surface-2"
              >
                <input
                  type="radio"
                  checked={picks[g.id] === o.id}
                  onChange={() => setPicks((p) => ({ ...p, [g.id]: o.id }))}
                  className="h-4 w-4 accent-brand"
                />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
          </div>
        ))}
        <button
          type="submit"
          disabled={!allPicked}
          className="mt-1 w-full rounded-md bg-brand-light px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand disabled:opacity-40"
        >
          Confirm going ({done}/{seriesGroups.length})
        </button>
      </form>
      <div className="my-1 h-px bg-border" />
      <form action={cantMake.bind(null, postId, userId)}>
        <button type="submit" className={`${ITEM} text-rose-600 dark:text-rose-400`}>
          <span>&times;</span> Can&apos;t make any
        </button>
      </form>
    </div>
  );
}

// add / remove invitees straight from the roster (no full edit). removable chips
// for the people added by hand; an "+ Add invitee" picker that can also email the
// new person. shown behind Manual override, under the responses box.
export function InviteeManager({ postId, added = [], candidates = [], add, remove }) {
  if (!useOverrideShown()) return null;
  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Invitees added by hand
        </p>
        <AddInvitee postId={postId} candidates={candidates} add={add} />
      </div>
      {added.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {added.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-2 px-2.5 py-1 text-xs text-foreground"
            >
              {p.displayName}
              <form action={remove.bind(null, postId, p.id)} className="flex">
                <button
                  type="submit"
                  aria-label={`Remove ${p.displayName}`}
                  className="text-base leading-none text-muted transition hover:text-rose-600"
                >
                  &times;
                </button>
              </form>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs text-faint">
          No one added by hand yet. People invited by Everyone or a role can&apos;t be
          removed here.
        </p>
      )}
    </div>
  );
}

function AddInvitee({ postId, candidates, add }) {
  const [q, setQ] = useState("");
  const list = q
    ? candidates.filter((c) => c.displayName.toLowerCase().includes(q.toLowerCase()))
    : candidates;
  return (
    <Dropdown
      align="right"
      width="w-72"
      trigger={
        <button
          type="button"
          className="rounded-md border border-dashed border-brand-light/50 px-2.5 py-1 text-xs font-semibold text-brand-light transition hover:bg-brand-light/10"
        >
          + Add invitee
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
            <p className="px-2 py-2 text-xs text-faint">everyone here is already invited</p>
          ) : (
            list.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2"
              >
                <Avatar name={c.displayName} image={c.image} size={22} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{c.displayName}</span>
                  {c.title && <span className="block truncate text-xs text-muted">{c.title}</span>}
                </span>
                <form action={add.bind(null, postId, c.id)}>
                  <button
                    type="submit"
                    className="rounded border border-border-strong px-2 py-0.5 text-xs font-medium text-muted transition hover:text-foreground"
                  >
                    Add
                  </button>
                </form>
                <form action={add.bind(null, postId, c.id)}>
                  <input type="hidden" name="email" value="on" />
                  <button
                    type="submit"
                    className="rounded border border-brand-light/50 px-2 py-0.5 text-xs font-semibold text-brand-light transition hover:bg-brand-light/10"
                  >
                    + email
                  </button>
                </form>
              </div>
            ))
          )}
        </div>
      </div>
    </Dropdown>
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
