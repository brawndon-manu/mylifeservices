import Link from "next/link";

// PREVIEW OR LIVE, AND WHOSE PAGE THIS IS, ON EVERY REVIEWER VIEW.
//
// Two modes that look identical and differ in whether a click reaches a real
// payroll record cannot be told apart by the page content - same layout, same
// questions, somebody else's hours. So the mode is named, the person is named
// beside it, and the two states are coloured differently rather than flagged
// with a word: amber for the one where nothing counts, rose for the one where
// everything does.
//
// Plain links rather than a client toggle. The mode decides what the SERVER
// hands back - which actions are wired to the real thing and which to the
// refusal - so it has to be a request, and a full navigation is the honest way
// to show that the page you get is a different page.
export default function ModeBar({ token, live, name, period }) {
  const tab = (on, label, tone) => {
    const base = "px-5 py-2 text-xs font-bold uppercase tracking-wide transition";
    const idle = "bg-surface-2 text-muted hover:text-foreground";
    const active = tone === "rose"
      ? "bg-rose-900 text-rose-100 dark:bg-rose-900 dark:text-rose-100"
      : "bg-amber-900 text-amber-100 dark:bg-amber-900 dark:text-amber-100";
    return `${base} ${on ? active : idle}`;
  };
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="inline-flex overflow-hidden rounded-lg border border-border-strong">
        <Link href={`/t/${token}`} className={tab(!live, "Preview", "amber")}>
          Preview
        </Link>
        <Link href={`/t/${token}?live=1`} className={tab(live, "Live", "rose")}>
          Live
        </Link>
      </div>
      <span className="text-sm text-muted">
        {name}
        {period ? <> &middot; <b className="font-semibold text-foreground">{period}</b></> : null}
      </span>
    </div>
  );
}
