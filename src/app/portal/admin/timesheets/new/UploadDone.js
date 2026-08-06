"use client";

// What the upload found, shown for a few seconds before the batch page takes
// over.
//
// The action used to redirect the moment the last sheet was written. That threw
// away everything it had just learned and dropped you on a screen whose main
// button is "Send all". This holds that knowledge on screen first, then fades
// into the batch page on its own.
//
// Nothing here blocks: it moves along by itself, and the link is on screen the
// whole time for anyone who would rather not wait.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SourceFiles from "./SourceFiles";

const HOLD_MS = 4200;   // long enough to read the headline and the warnings
const FADE_MS = 600;

const f2 = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);

export default function UploadDone({ href, summary, seconds, files }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const s = summary || {};
  const failed = s.failed || [];
  const support = s.support || {};
  const aliases = s.aliasQuestions || [];
  // applied on a guess, versus not found at all - different problems, different
  // things to do about them
  const estimated = aliases.filter((q) => q.kind === "estimated");
  const unmatched = aliases.filter((q) => q.kind !== "estimated");

  useEffect(() => {
    router.prefetch?.(href);
    const fade = setTimeout(() => setLeaving(true), HOLD_MS);
    const go = setTimeout(() => router.push(href), HOLD_MS + FADE_MS);
    return () => { clearTimeout(fade); clearTimeout(go); };
  }, [href, router]);

  return (
    <div
      className={`mt-6 rounded-2xl border bg-surface p-6 transition-all sm:p-7 duration-500 motion-reduce:transition-none ${
        leaving ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
      } ${failed.length ? "border-rose-300 dark:border-rose-900/60" : "border-emerald-300 dark:border-emerald-900/60"}`}
    >
      {/* the same four documents carried through from the waiting screen, so
          the card does not visibly reshuffle at the moment it lands */}
      <div className="mb-5">
        <SourceFiles files={files} />
      </div>

      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`grid h-7 w-7 flex-none place-items-center rounded-full text-sm font-bold ${
            failed.length
              ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
          }`}
        >
          {failed.length ? "!" : "✓"}
        </span>
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground" role="status">
            {failed.length
              ? `Finished with ${failed.length} problem${failed.length === 1 ? "" : "s"}.`
              : `Done. ${s.employees} corrected timesheet${s.employees === 1 ? "" : "s"} generated.`}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {s.periodFrom} to {s.periodTo} · nothing has been emailed to anyone.
          </p>
        </div>
        {seconds != null && (
          <span className="ml-auto shrink-0 tabular-nums text-xs text-faint">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat k="Employees" v={s.employees} />
        <Stat k="Pages read" v={s.pages} />
        <Stat k="Corrected hrs" v={f2(s.paidHours)} />
        <Stat k="Premium hrs" v={f2(s.premiumHours)} />
      </div>

      {failed.length > 0 && (
        <Note tone="bad">
          <b>{`${failed.length} sheet${failed.length === 1 ? "" : "s"} failed to render`}</b>
          {/* separated with a middot, not a comma - QSP prints "Last, First", so
              a comma-joined list of two people reads as four */}
          {` - ${failed.slice(0, 3).join(" · ")}${
            failed.length > 3 ? ` and ${failed.length - 3} more` : ""
          }. They have no PDF, so they can't be sent. Re-uploading is the fix.`}
        </Note>
      )}

      {s.scheduleError && (
        <Note tone="warn">
          <b>The schedule export didn&apos;t parse</b>, so the days that
          weren&apos;t clocked have nothing corroborating them.
        </Note>
      )}

      {/* QSP prints different names for the same person across its own reports.
          An exact link through the portal account is a fact and says nothing
          here. These are the ones worth a second pair of eyes. */}
      {estimated.length > 0 && (
        <Note tone="warn">
          <b>{`${estimated.length} name${estimated.length === 1 ? "" : "s"} matched on a best guess`}</b>
          {estimated.map((q, i) => (
            <span key={i} className="mt-1 block">
              {`"${q.sourceName}" was read as "${q.candidate}" in the ${q.report} report - a ${q.confidence}% name match, and the only candidate. Applied, but worth confirming.`}
            </span>
          ))}
        </Note>
      )}

      {unmatched.length > 0 && (
        <Note tone="warn">
          <b>{`${unmatched.length} ${
            unmatched.length === 1 ? "person has" : "people have"
          } no clock record under any name`}</b>
          {unmatched.map((q, i) => (
            <span key={i} className="mt-1 block">
              {`"${q.sourceName}" - ${
                q.candidate
                  ? `closest is "${q.candidate}" at ${q.confidence}%, too far to use`
                  : "nothing close enough to suggest"
              }. Their ${q.premiumHours} premium hours stay unverified.`}
            </span>
          ))}
        </Note>
      )}

      {support.unverified > 0 && (
        <Note tone="warn">
          <b>{f2(support.unverified)} premium hours need somebody to look</b> -
          not clocked, and no corroborating record. {f2(support.recorded)} are
          recorded by QSP and {f2(support.supported)} are corroborated.
        </Note>
      )}

      {s.punchDays > 0 && (
        <Note tone="bad">
          {/* built as one string, not text wrapped around an expression - JSX
              eats the space where a tag meets a line break, which is how this
              rendered as "people havepunch entries" the first time */}
          <b>{`${s.punchPeople} ${s.punchPeople === 1 ? "person has" : "people have"} punch entries that can't be right`}</b>
          {` - ${s.punchDays} day${s.punchDays === 1 ? "" : "s"}. Read the checks before sending anything.`}
        </Note>
      )}

      {failed.length === 0 && s.punchDays === 0 && !s.scheduleError && (
        <Note tone="good">
          Every sheet rendered and nothing in the punch data contradicts itself.
        </Note>
      )}

      <p className="mt-4 text-xs text-muted">
        Taking you to the batch
        {" "}
        <a href={href} className="font-semibold text-brand underline underline-offset-4">
          now
        </a>
        .
      </p>
    </div>
  );
}

function Stat({ k, v }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-faint">{k}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{v}</p>
    </div>
  );
}

function Note({ tone, children }) {
  const cls =
    tone === "good"
      ? "border-emerald-300/60 bg-emerald-50/60 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200"
      : tone === "warn"
        ? "border-amber-300/60 bg-amber-50/60 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200"
        : "border-rose-300/60 bg-rose-50/60 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200";
  return <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${cls}`}>{children}</div>;
}
