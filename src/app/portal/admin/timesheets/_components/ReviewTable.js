"use client";

// the reconciliation desk: every parsed employee, who we think it is, the
// corrected figures, and per-row send. matching QSP's "Last, First" to portal
// accounts is never perfect, so nothing sends until a person is set here.
import { useState } from "react";
import Avatar from "@/components/Avatar";
import EmployeePicker from "./EmployeePicker";
import RowDocuments from "./RowDocuments";
import { companyDate } from "@/lib/company-time";

const fmt = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);
const dt = (iso) =>
  iso ? companyDate(iso, { month: "short", day: "numeric" }) : null;

const METHOD = {
  exact: { label: "Exact", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  fuzzy: { label: "Best guess", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
  manual: { label: "Set by hand", cls: "bg-sky-100 text-brand" },
  unmatched: { label: "No match", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
};

export default function ReviewTable({
  rows,
  candidates,
  batchId,
  assign,
  clear,
  send,
  hasSource,
  hasSchedule,
}) {
  const [filter, setFilter] = useState("all");

  const counts = {
    all: rows.length,
    needsMatch: rows.filter((r) => !r.user).length,
    unsent: rows.filter((r) => r.user && !r.sentAt).length,
    signed: rows.filter((r) => r.signedAt).length,
    toApprove: rows.filter((r) => r.signedAt && !r.approvedAt).length,
    disputed: rows.filter((r) => r.disputed).length,
    // EVERY ONE OF THE FIVE QUESTIONS BLOCKS SIGNING, so an unanswered one is
    // not a detail - it is the reason a sheet will never come back.
    waiting: rows.filter((r) => (r.questionsAsked || 0) > (r.questionsAnswered || 0)).length,
    // and the ones who answered AGAINST us. Two of the five arrive with the
    // correction already applied, so a decline is what puts hours or a premium
    // back - it is the only answer that changes a figure after the fact.
    argued: rows.filter((r) => (r.questionsDeclined || 0) > 0).length,
  };
  const shown = rows.filter((r) => {
    if (filter === "needsMatch") return !r.user;
    if (filter === "unsent") return r.user && !r.sentAt;
    if (filter === "signed") return !!r.signedAt;
    if (filter === "toApprove") return r.signedAt && !r.approvedAt;
    if (filter === "disputed") return !!r.disputed;
    if (filter === "waiting") return (r.questionsAsked || 0) > (r.questionsAnswered || 0);
    if (filter === "argued") return (r.questionsDeclined || 0) > 0;
    return true;
  });

  const chips = [
    ["all", "All"],
    ["needsMatch", "Needs a match"],
    ["unsent", "Not sent yet"],
    ["waiting", "Waiting on an answer"],
    ["argued", "Corrected us"],
    ["disputed", "Reported a problem"],
    ["toApprove", "Needs approval"],
    ["signed", "Signed"],
  ];

  return (
    <div className="mt-8">
      <div className="flex flex-wrap gap-1.5">
        {chips.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              filter === k
                ? "border-brand-light bg-brand-light/10 text-brand-dark"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {label} {counts[k === "all" ? "all" : k]}
          </button>
        ))}
      </div>

      <ul className="mt-4 space-y-2.5">
        {shown.length === 0 && (
          <li className="rounded-xl border border-dashed border-border-strong bg-surface-2 p-8 text-center text-sm text-muted">
            Nothing here.
          </li>
        )}
        {shown.map((r) => {
          const method = METHOD[r.matchMethod] || METHOD.unmatched;
          return (
            <li
              key={r.id}
              className={`rounded-xl border bg-surface p-4 shadow-sm ${
                r.user ? "border-border" : "border-rose-300 dark:border-rose-900/60"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{r.sourceName}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${method.cls}`}>
                      {method.label}
                      {r.matchMethod === "fuzzy" && r.confidence ? ` ${r.confidence}%` : ""}
                    </span>
                    {r.partialWeek && (
                      <span
                        title="A workweek in this period is cut off by the pay-period boundary, so its over-40 overtime is provisional."
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      >
                        partial week
                      </span>
                    )}
                    {/* THE FIVE PRE-SIGNING QUESTIONS. Every one blocks signing,
                        so an unanswered question is the reason a sheet never
                        comes back - it belongs on the row, not two pages in. */}
                    {r.questionsAsked > 0 && r.questionsAnswered < r.questionsAsked && (
                      <span
                        title="This person has to answer these before they can sign. We took the cheapest reading in each case, so it does not stand until they confirm it."
                        className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                      >
                        waiting on {r.questionsAsked - r.questionsAnswered} of {r.questionsAsked}{" "}
                        {r.questionsAsked === 1 ? "answer" : "answers"}
                      </span>
                    )}
                    {/* answered AGAINST us. Two of the five arrive already
                        applied, so this is the answer that moved a figure back
                        after we had changed it. */}
                    {r.questionsDeclined > 0 && (
                      <span
                        title="They told us our correction was wrong. Hours or a premium have gone back on and the sheet was rebuilt."
                        className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      >
                        corrected us · {r.questionsDeclined}
                      </span>
                    )}
                    {r.questionsAsked > 0 && r.questionsAnswered === r.questionsAsked
                      && !r.questionsDeclined && (
                      <span
                        title="Every question on this sheet has been confirmed, so it can be signed."
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      >
                        all confirmed
                      </span>
                    )}
                    {/* a lunch that happened but started too late still owes an
                        hour. it reads as a mistake to anyone who remembers
                        taking their lunch, so it gets named on the row. */}
                    {r.mealLateDays > 0 && (
                      <span
                        title="A meal period has to BEGIN before the end of the fifth hour worked. Taken later, it still owes a premium under §226.7."
                        className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                      >
                        {/* §226.7 pays exactly one hour per day, so days and
                            hours are the same number - no decimals needed */}
                        lunch started late · {r.mealLateDays} {r.mealLateDays === 1 ? "day" : "days"} · {r.mealLateDays} {r.mealLateDays === 1 ? "hr" : "hrs"}
                      </span>
                    )}
                    {/* pays nothing at all, so it is the one thing worth
                        spotting without opening anything */}
                    {r.missingDays > 0 && (
                      <span
                        title="A day the schedule has that the timesheet has no punches for. It pays nothing."
                        className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                      >
                        {r.missingDays} scheduled {r.missingDays === 1 ? "day" : "days"} with no hours
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>
                      QSP {fmt(r.rawHours)} → <b className="text-foreground">{fmt(r.paidHours)}</b> hrs
                    </span>
                    {r.otHours > 0 && <span>OT {fmt(r.otHours)}</span>}
                    {r.doubleHours > 0 && <span>DT {fmt(r.doubleHours)}</span>}
                    {r.premiumHours > 0 && (
                      <span className="text-rose-600 dark:text-rose-400">
                        premium {fmt(r.premiumHours)} hrs
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-none flex-col items-end gap-1.5">
                  {r.disputed ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                      Reported a problem
                    </span>
                  ) : r.approvedAt ? (
                    <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                      Approved {dt(r.approvedAt)}
                    </span>
                  ) : r.signedAt ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      Signed {dt(r.signedAt)}
                    </span>
                  ) : r.sentAt ? (
                    <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-brand">
                      Sent {dt(r.sentAt)}
                      {r.dueAt ? ` · due ${dt(r.dueAt)}` : ""}
                    </span>
                  ) : (
                    <span className="text-[11px] text-faint">Not sent</span>
                  )}
                  {r.signedAt && !r.approvedAt && (
                    <a
                      href={`/portal/admin/timesheets/sheet/${r.id}/approve`}
                      className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-emerald-700"
                    >
                      Review &amp; approve →
                    </a>
                  )}
                  {r.hasPdf && <SheetLinks r={r} />}
                  <a
                    href={`/portal/admin/timesheets/sheet/${r.id}/report`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-muted transition hover:text-brand"
                  >
                    Hours &amp; penalties →
                  </a>
                  {/* WHAT THIS PERSON SEES, opened as them. Only rendered when
                      the server minted a token for it, which it only does for
                      SUPER - see the note beside `canPreview`. Read-only on the
                      far side: `?preview=1` blocks every write. */}
                  {r.previewToken && (
                    <>
                      <a
                        href={`/t/${r.previewToken}?preview=1`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-muted transition hover:text-brand"
                      >
                        Their timesheet review page →
                      </a>
                      <a
                        href={`/t/${r.previewToken}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-muted transition hover:text-brand"
                      >
                        Their generated sheet →
                      </a>
                    </>
                  )}
                </div>
              </div>

              {/* the two source documents, sitting with the figures they
                  explain rather than at the bottom with the send controls */}
              <RowDocuments
                batchId={batchId}
                docs={r.docs}
                hasSource={hasSource}
                hasSchedule={hasSchedule}
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  {r.user ? (
                    <>
                      <Avatar name={r.user.displayName} image={r.user.image} size={26} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {r.user.displayName}
                        </p>
                        <p className="truncate text-xs text-muted">{r.user.email}</p>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-rose-700 dark:text-rose-400">
                      Pick who this belongs to
                    </p>
                  )}
                </div>

                <div className="flex flex-none items-center gap-2">
                  <EmployeePicker
                    timesheetId={r.id}
                    candidates={candidates}
                    suggestions={r.suggestions}
                    assign={assign}
                    label={r.user ? "Change" : "Pick employee"}
                  />
                  {r.user && (
                    <form action={clear.bind(null, r.id)}>
                      <button
                        type="submit"
                        className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-muted transition hover:text-foreground"
                      >
                        Clear
                      </button>
                    </form>
                  )}
                  {r.user &&
                    (r.hasPdf ? (
                      <form action={send.bind(null, batchId)}>
                        <input type="hidden" name="timesheetId" value={r.id} />
                        <button
                          type="submit"
                          className="rounded-md bg-brand-light px-3 py-1 text-xs font-semibold text-white transition hover:bg-brand"
                        >
                          {r.sentAt ? "Resend" : "Send"}
                        </button>
                      </form>
                    ) : (
                      <span
                        title="The PDF for this timesheet was never stored, so there's nothing to link to. Re-upload the export."
                        className="rounded-md border border-rose-300 px-2.5 py-1 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:text-rose-400"
                      >
                        No PDF
                      </span>
                    ))}
                </div>
              </div>

              {r.sentAt && r.sentToEmail && r.intendedEmail && r.sentToEmail !== r.intendedEmail && (
                <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                  Test send: went to {r.sentToEmail}, meant for {r.intendedEmail}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// THE DOCUMENTS FOR ONE PERSON, each carrying the total it opens.
//
// Mánu 2026-08-09 wanted them side by side. They differ by every premium the
// engine assumed away - Aranda was 19.00 hours on one and 2.00 on another - so
// the figure belongs on the link rather than behind it.
//
// "IF ASSUMPTIONS HOLD" IS GONE, dropped 2026-08-12 with the thing it described.
// That basis existed because the engine APPLIED an assumption: an off-clock ten
// was paid on sight, so there was a reading of the sheet where those assumptions
// turned out right and a reading where they did not. The reversal the same day -
// "only add the time once they confirm it was taken there" - means the engine
// now assumes nothing, so the assumed and projected sheets are the same document
// with two names on it. Mánu: "we should remove the if assumptions hold and
// their generated sheet from the preview PDF."
//
// What is left is the honest pair: what the sheet says NOW, and what it says
// once the corrections on record are applied.
//
// AN UNSIGNED ROW SHOWS ONE LINK, because until they sign there is nothing to
// compare the projected sheet against. The old "where they agree, collapse to
// one" rule went with the third document: it existed because ten of the 59 owed
// nothing under any reading and got three identical links, which teaches people
// that the labels do not mean anything.
function SheetLinks({ r }) {
  const base = `/portal/admin/timesheets/sheet/${r.id}/download`;
  const f2 = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);
  // a signed or approved copy is a stored artefact of the sheet as it stood,
  // and it is always the projected one. Say which it is.
  const settled = r.approvedAt ? "Approved PDF" : r.signedAt ? "Signed PDF" : null;


  const link = (href, label, muted) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-xs font-medium transition ${
        muted ? "text-muted hover:text-brand" : "text-brand hover:text-brand-dark"
      }`}
    >
      {label} →
    </a>
  );

  // Nothing to compare against until they have signed, so a row with no
  // signature is one link whatever the figures say.
  if (!settled) {
    return (
      <div className="flex flex-col items-end">
        {link(`${base}?basis=projected`, `projected ${f2(r.premiumProjected)}`)}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">
        {settled ? "Timesheet" : "Preview PDF"}
      </span>
      {/* TWO DOCUMENTS, AND ONLY ONCE THERE ARE TWO. Mánu 2026-08-12: "i want
          to keep the projected timesheet before corrections. i want a new
          option for the final timesheet once theyve signed off on it."

          FINAL is the stored signed or approved artefact - the plain base URL,
          which the download route serves from the blob on the projected basis.
          It is first because it is the only one carrying a signature.

          PROJECTED is the sheet as it stood before any of their answers, kept
          deliberately so payroll can see what changed.

          The "as corrected" link that used to sit here is gone with it: it was a
          generated mid-flight reading of a sheet that now has a final version,
          and offering a third document differing from both was the thing that
          made this column hard to read. */}
      {link(base, r.approvedAt ? "Approved (final)" : "Final - signed")}
      {link(`${base}?basis=projected&original=1`, `projected ${f2(r.premiumProjected)}`, true)}
    </div>
  );
}
