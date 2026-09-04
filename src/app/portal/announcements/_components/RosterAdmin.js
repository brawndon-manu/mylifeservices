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

// EVERY MENU ROW ANSWERS ITS CLICK AT ONCE - the add-picker treatment
// (2026-08-30), extended to the kebab and Record response on Mánu's yes,
// 2026-09-02. A row marks itself the moment it is pressed and the server
// catches up underneath; a plain call, not a transition, for the reason the
// add picker documents above its own `pick`.
function useRowActs() {
  const [state, setState] = useState({});
  const run = (key, fn) => {
    if (state[key]) return;
    setState((s) => ({ ...s, [key]: "busy" }));
    Promise.resolve()
      .then(fn)
      .then(() => setState((s) => ({ ...s, [key]: "done" })))
      .catch(() => setState((s) => {
        const next = { ...s };
        delete next[key];
        return next;
      }));
  };
  return [state, run];
}

// the status the row wears while its action runs and once it lands
function RowStatus({ state, busy, done }) {
  if (state === "busy") return <span className="ml-auto flex-none text-xs text-faint">{busy}&hellip;</span>;
  if (state === "done") {
    return <span className="ml-auto flex-none text-xs font-semibold text-emerald-600 dark:text-emerald-400">{done} &#10003;</span>;
  }
  return null;
}

// kebab for a going person: move their pick to another session, or remove them.
export function PersonKebab({ postId, userId, currentOptionId, moveTargets, move, remove }) {
  const shown = useOverrideShown();
  const [acts, run] = useRowActs();
  if (!shown) return null;
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
      {/* stays open through the click, so the row can say what it is doing */}
      <div onClick={(e) => e.stopPropagation()}>
        {moveTargets.length > 0 && (
          <>
            <p className={SUBHEAD}>Move to another session</p>
            {moveTargets.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={!!acts[t.id]}
                onClick={() => run(t.id, () => move(postId, userId, currentOptionId, t.id))}
                className={ITEM}
              >
                <span className="text-muted">&#8646;</span>
                <span className="truncate">
                  {t.seriesLabel ? `${t.seriesLabel}: ` : ""}
                  {t.label}
                </span>
                <RowStatus state={acts[t.id]} busy="Moving" done="Moved" />
              </button>
            ))}
            <div className="my-1 h-px bg-border" />
          </>
        )}
        <button
          type="button"
          disabled={!!acts.remove}
          onClick={() => run("remove", () => remove(postId, userId))}
          className={`${ITEM} text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40`}
        >
          <span>&times;</span> Remove from meeting
          <RowStatus state={acts.remove} busy="Removing" done="Removed" />
        </button>
      </div>
    </Dropdown>
  );
}

// "+ Add someone to this session" - a searchable list of audience people not
// already going to this session (walk-ins). adds them going + marks the ack.
//
// EACH CLICK ANSWERS IMMEDIATELY. Mánu 2026-08-30, placing people into the new
// training week: "it works but it takes so long and so many clcking for it to
// go through." The row used to be a plain form submit, so a click sat silent
// through two page re-renders before anything moved, and adding five people
// meant five open-type-click-wait rounds. Now a click marks the row at once,
// the search clears and refocuses for the next name, and the server catches up
// underneath - several adds can be in flight together.
export function AddToSession({ postId, optionId, candidates, add }) {
  // ALWAYS SHOWN - Mánu 2026-09-04: "lets always leave add person to session
  // the way it looks when manual override is on." The other override tools
  // stay behind the toggle; adding someone is everyday roll-call work.
  const [q, setQ] = useState("");
  // userId -> "adding" | "added", for the people added from THIS popover. The
  // refreshed candidate list eventually drops them; until it lands they stay
  // visible with their check so the list does not jump under the pointer.
  const [state, setState] = useState({});
  // THE ADDED ROWS ARE PINNED, 2026-09-04. The comment below always promised
  // "they stay visible with their check", but the list rendered purely from
  // the candidates prop - so when the page refresh landed and dropped the
  // now-invited person from candidates, their row VANISHED mid-check. Mánu:
  // "this check doesnt work consistently." The people added from this
  // popover are kept here and unioned in, so the check stays put for as long
  // as the popover lives.
  const [pinned, setPinned] = useState([]);
  const inputRef = useRef(null);
  const ids = new Set(candidates.map((c) => c.id));
  const all = [...candidates, ...pinned.filter((c) => !ids.has(c.id))];
  const list = q
    ? all.filter((c) => c.displayName.toLowerCase().includes(q.toLowerCase()))
    : all;
  const pick = (c) => {
    if (state[c.id] === "adding" || state[c.id] === "added") return;
    setState((s) => ({ ...s, [c.id]: "adding" }));
    setPinned((p) => (p.some((x) => x.id === c.id) ? p : [...p, c]));
    setQ("");
    inputRef.current?.focus();
    // A PLAIN CALL, NOT A TRANSITION. Wrapped in startTransition, the action's
    // route refresh - seconds of server render on this page - became part of
    // the pending transition, and the SECOND consecutive add's row painted
    // nothing until the first one's refresh landed. Mánu 2026-08-30: "works
    // one time then ... it doesnt reproduce the same visual." The row now
    // updates the moment the server answers, and the refresh arrives whenever
    // it arrives.
    add(postId, c.id, optionId)
      .then(() => setState((s) => ({ ...s, [c.id]: "added" })))
      // a refusal used to wipe the row silently, which read as the check
      // simply not working - now it says so and the row can be pressed again
      .catch(() => setState((s) => ({ ...s, [c.id]: "failed" })));
  };
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
          ref={inputRef}
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
              <button key={c.id} type="button" onClick={() => pick(c)} disabled={state[c.id] === "adding" || state[c.id] === "added"} className={ITEM}>
                <Avatar name={c.displayName} image={c.image} size={22} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{c.displayName}</span>
                  {c.title && <span className="block truncate text-xs text-muted">{c.title}</span>}
                </span>
                {state[c.id] === "adding" && <span className="flex-none text-xs text-faint">Adding&hellip;</span>}
                {state[c.id] === "added" && (
                  <span className="flex-none text-xs font-semibold text-emerald-600 dark:text-emerald-400">Added &#10003;</span>
                )}
                {state[c.id] === "failed" && (
                  <span className="flex-none text-xs font-semibold text-rose-600 dark:text-rose-400">Didn&apos;t save - tap to retry</span>
                )}
              </button>
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
  const shown = useOverrideShown();
  const [acts, run] = useRowActs();
  if (!shown) return null;
  const cantRow = (label) => (
    <button
      type="button"
      disabled={!!acts.cant}
      onClick={() => run("cant", () => cantMake(postId, userId))}
      className={`${ITEM} text-rose-600 dark:text-rose-400`}
    >
      <span>&times;</span> {label}
      <RowStatus state={acts.cant} busy="Recording" done="Recorded" />
    </button>
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
          <div onClick={(e) => e.stopPropagation()}>
            <p className={SUBHEAD}>{hasSessions ? "Mark going to" : "Response"}</p>
            {hasSessions ? (
              sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={!!acts[s.id]}
                  onClick={() => run(s.id, () => addToSession(postId, userId, s.id))}
                  className={ITEM}
                >
                  <span className="truncate">
                    {s.seriesLabel ? `${s.seriesLabel}: ` : ""}
                    {s.label}
                  </span>
                  <RowStatus state={acts[s.id]} busy="Recording" done="Recorded" />
                </button>
              ))
            ) : (
              <button
                type="button"
                disabled={!!acts.going}
                onClick={() => run("going", () => setGoing(postId, userId))}
                className={ITEM}
              >
                Going
                <RowStatus state={acts.going} busy="Recording" done="Recorded" />
              </button>
            )}
            <div className="my-1 h-px bg-border" />
            {cantRow("Can't make it")}
          </div>
        )}
      </Dropdown>
    </span>
  );
}

// series: pick one date per series, then Confirm going. stops click-propagation
// so interacting doesn't close the dropdown.
function SeriesRecord({ postId, userId, seriesGroups, record, cantMake }) {
  const [picks, setPicks] = useState({});
  const [acts, run] = useRowActs();
  const done = seriesGroups.filter((g) => picks[g.id]).length;
  const allPicked = done === seriesGroups.length;
  // the whole-response action reads its optionIds off a FormData, so the
  // instant path hands it the same shape the old hidden inputs carried
  const confirm = () => run("confirm", () => {
    const fd = new FormData();
    for (const g of seriesGroups) fd.append("optionId", picks[g.id] || "");
    return record(postId, userId, fd);
  });
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div>
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
          type="button"
          disabled={!allPicked || !!acts.confirm}
          onClick={confirm}
          className="mt-1 w-full rounded-md bg-brand-light px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand disabled:opacity-40"
        >
          {acts.confirm === "busy"
            ? "Recording..."
            : acts.confirm === "done"
              ? "Recorded \u2713"
              : `Confirm going (${done}/${seriesGroups.length})`}
        </button>
      </div>
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        disabled={!!acts.cant}
        onClick={() => run("cant", () => cantMake(postId, userId))}
        className={`${ITEM} text-rose-600 dark:text-rose-400`}
      >
        <span>&times;</span> Can&apos;t make any
        <RowStatus state={acts.cant} busy="Recording" done="Recorded" />
      </button>
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
