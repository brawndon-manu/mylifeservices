"use client";

// PREVIEW OR LIVE, AND WHOSE PAGE THIS IS, ON EVERY REVIEWER VIEW - his
// reviewer-controls design, 2026-09-08. One card: the employee's name, the
// Preview | Live switch, a status line saying what the current mode does, and
// an overflow menu holding "About review modes" and the reset.
//
// THE SWITCH IS STILL TWO LINKS. The mode decides what the SERVER hands back -
// which actions are wired to the real thing and which to the refusal - so it
// has to be a request, and a full navigation is the honest way to show that
// the page you get is a different page.
//
// THE RESET LIVES IN THE MENU NOW, in both modes - it was preview-only, but it
// is an administrative action that never depended on the mode (it was always
// the one deliberate exception to preview's refusals), and the About dialog
// says so out loud. Its confirm re-reads the counts at click time through
// `timesheetResetImpact`, exactly as the old panel did - the rendered count
// goes stale while somebody works through their sheet on the phone.
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ellipsis, Eye, CircleDot, FlaskConical, Info, RotateCcw } from "lucide-react";
import { resetTimesheetAnswers, timesheetResetImpact } from "@/app/portal/admin/timesheets/actions";

export default function ReviewerBar({
  token, live, name, first, rehearsal = false,
  timesheetId, answers = 0, reasons = 0, signed = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [about, setAbout] = useState(false);
  const [impact, setImpact] = useState(null);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function openReset() {
    setMenuOpen(false);
    setChecking(true);
    setErr(null);
    try {
      setImpact(await timesheetResetImpact(timesheetId));
    } catch {
      // only the counts failed, so fall back to what the page knew rather
      // than refusing to open the confirm
      setImpact({ answers, reasons, signed });
    } finally {
      setChecking(false);
    }
  }

  const tab = (on, tone) =>
    `rounded-[7px] px-3.5 py-1.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
      on
        ? tone === "rose"
          ? "bg-rose-200 font-semibold text-rose-900 dark:bg-rose-900/70 dark:text-rose-200"
          : "bg-surface font-semibold text-foreground shadow-sm"
        : "font-medium text-muted hover:text-foreground"
    }`;

  return (
    <div className="mb-6 rounded-xl bg-surface px-5 py-4 shadow-sm night:ring-1 night:ring-border">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] text-muted">Reviewer controls</p>
          <p className="truncate text-[15px] font-semibold text-foreground">{name}</p>
        </div>
        <div className="flex flex-none items-center gap-2">
          <div className="inline-flex gap-0.5 rounded-[9px] bg-fill p-[2.5px]" role="group" aria-label="Review mode">
            <Link href={`/t/${token}`} aria-current={live ? undefined : "page"} className={tab(!live)}>
              Preview
            </Link>
            <Link href={`/t/${token}?live=1`} aria-current={live ? "page" : undefined} className={tab(live, "rose")}>
              Live
            </Link>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="More options"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-fill hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
            >
              <Ellipsis size={17} aria-hidden="true" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="nav-pop absolute right-0 top-full z-50 mt-1.5 w-56 rounded-xl border border-sep bg-surface p-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setAbout(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px] font-medium text-foreground transition-colors hover:bg-fill"
                >
                  <Info size={15} aria-hidden="true" className="text-muted" />
                  About review modes
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={checking}
                  onClick={openReset}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px] font-medium text-rose-700 transition-colors hover:bg-fill disabled:opacity-50 dark:text-rose-400"
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  {checking ? "Checking…" : "Reset this timesheet…"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* WHAT THE CURRENT MODE DOES, in one line. On a rehearsal batch the
          preview sentence would be a lie - everything there works for real -
          so that state says its own truth instead. */}
      <p className="mt-3 flex items-start gap-2 border-t border-sep pt-3 text-[13.5px] leading-relaxed text-muted">
        {live ? (
          <CircleDot size={15} aria-hidden="true" className="mt-0.5 flex-none text-rose-500" />
        ) : rehearsal ? (
          <FlaskConical size={15} aria-hidden="true" className="mt-0.5 flex-none text-amber-500" />
        ) : (
          <Eye size={15} aria-hidden="true" className="mt-0.5 flex-none text-faint" />
        )}
        <span>
          {live ? (
            <>
              <span className="font-semibold text-rose-700 dark:text-rose-400">Live.</span>{" "}
              Answers update {first}&apos;s record. Only {first} can sign.
            </>
          ) : rehearsal ? (
            <>
              <span className="font-semibold text-foreground">Preview, on a test batch.</span>{" "}
              Everything here works for real - answers save, the sheet rebuilds, the
              signature is stored. The only thing that differs is that any email it
              sends goes to one address.
            </>
          ) : (
            <>
              <span className="font-semibold text-foreground">Preview.</span>{" "}
              Answers aren&apos;t saved. Signing is unavailable.
            </>
          )}
        </span>
      </p>
      {err && (
        <p className="mt-2 text-xs text-rose-700 dark:text-rose-400">Could not reset: {err}</p>
      )}

      {about && (
        <Overlay onClose={() => setAbout(false)} labelledBy="review-modes-title">
          <p id="review-modes-title" className="text-lg font-semibold text-foreground">
            Reviewing with an employee
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            <b className="text-foreground">Preview</b> shows the employee&apos;s page.
            Question answers are not saved and signing is unavailable.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            <b className="text-foreground">Live</b> lets you record answers with the
            employee on the phone. Those answers update their actual record. Their
            signature must still come from them.
          </p>
          {rehearsal && (
            <p className="mt-3 text-sm leading-relaxed text-amber-700 dark:text-amber-400">
              This is a test batch, so both modes work for real and its emails go to
              one address.
            </p>
          )}
          <p className="mt-3 text-sm leading-relaxed text-rose-700 dark:text-rose-400">
            Reset is a separate administrative action and can change their record in
            either mode.
          </p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => setAbout(false)}
              className="rounded-[9px] bg-fill px-4 py-2 text-[13.5px] font-semibold text-foreground transition-colors hover:bg-fill-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Done
            </button>
          </div>
        </Overlay>
      )}

      {impact && (
        <Overlay onClose={() => !pending && setImpact(null)} labelledBy="reset-title">
          <p id="reset-title" className="text-lg font-semibold text-foreground">
            {impact.answers + impact.reasons > 0
              ? `Delete ${name}'s ${impact.answers + impact.reasons} answer${
                  impact.answers + impact.reasons === 1 ? "" : "s"
                }?`
              : `Rebuild ${name}'s sheet from the upload?`}
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
            <li>Their sheet goes back to the figures the upload produced.</li>
            {impact.reasons > 0 && (
              /* WHOSE WORDS GO AND WHOSE STAY. A reason a reviewer took off a
                 phone call is not the employee's to delete and not this
                 button's either, so it keeps its sentence and loses only their
                 tick - which puts it back to being a question for them. */
              <li>
                Anything <b className="text-foreground">they</b> wrote about a missed
                break goes. A reason <b className="text-foreground">we</b> recorded
                stays, and goes back to waiting on them to check it.
              </li>
            )}
            {impact.signed && (
              <li>
                <b className="text-foreground">Their signature goes too</b> &mdash; a
                rebuild un-signs, because the signed copy quotes figures that are
                about to change.
              </li>
            )}
            <li>Nobody else on the batch is touched.</li>
          </ul>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => setImpact(null)}
              className="rounded-[9px] px-4 py-2 text-[13.5px] font-medium text-muted transition-colors hover:bg-fill disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await resetTimesheetAnswers(timesheetId);
                  if (res?.ok) {
                    setImpact(null);
                    // the page is built from the sheet that just changed, so it
                    // has to be re-fetched rather than left showing the old
                    // questions
                    router.refresh();
                  } else {
                    setErr(res?.error || "failed");
                    setImpact(null);
                  }
                })
              }
              className="rounded-[9px] bg-rose-700 px-4 py-2 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-rose-800 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700"
            >
              {pending ? "Resetting…" : "Yes, reset it"}
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ onClose, labelledBy, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl night:ring-1 night:ring-border">
        {children}
      </div>
    </div>
  );
}
