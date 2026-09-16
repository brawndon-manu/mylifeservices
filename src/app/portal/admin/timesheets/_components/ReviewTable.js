"use client";

// the reconciliation desk: every parsed employee, who we think it is, the
// corrected figures, and per-row send. matching QSP's "Last, First" to portal
// accounts is never perfect, so nothing sends until a person is set here.
import { useState } from "react";
import Avatar from "@/components/Avatar";
import EmployeePicker from "./EmployeePicker";
import RowDocuments from "./RowDocuments";
import SheetMenu from "./SheetMenu";
import { companyDate } from "@/lib/company-time";
import { EmployeeHours, EmployeePayDetails, EmployeeDownloads, TimesheetReviewButton } from "./EmployeeCardDetails";
import styles from "./EmployeeCard.module.css";
import { unconfirmedMatch } from "@/lib/timesheet/match-confirm";

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
  periodLabel,
  // THE PERIOD GATE REACHES THE ROWS TOO (Mánu 2026-09-09). It used to live only
  // on `SendPanel`, so Send all was shut on an open period while the Send button
  // on every row beside it mailed one person on a single click. Same sentence,
  // one confirm instead of two, and the server refuses either way without it.
  blocked = false,
  blockedWhy = null,
}) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  const counts = {
    all: rows.length,
    needsMatch: rows.filter((r) => !r.user).length,
    unsent: rows.filter((r) => r.user && !r.sentAt).length,
    // the chase list - sent, still unsigned. Not-sent-yet rows have their own
    // chip, so this one is exactly the people to ring or resend.
    notSigned: rows.filter((r) => r.sentAt && !r.signedAt).length,
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
    const term = query.trim().toLocaleLowerCase();
    const searchable = [r.sourceName, r.user?.displayName, r.user?.name, r.user?.email, r.user?.phone].filter(Boolean).join(" ").toLocaleLowerCase();
    if (term && !searchable.includes(term)) return false;
    if (filter === "needsMatch") return !r.user;
    if (filter === "unsent") return r.user && !r.sentAt;
    if (filter === "notSigned") return r.sentAt && !r.signedAt;
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
    ["notSigned", "Not signed"],
    ["waiting", "Waiting on an answer"],
    ["argued", "Corrected us"],
    ["disputed", "Reported a problem"],
    ["toApprove", "Needs approval"],
    ["signed", "Signed"],
  ];

  return (
    <div className={`mt-8 ${styles.roster}`}>
      <div className={styles.filters}>
        <input type="search" aria-label="Search employees" placeholder="Search employees" value={query} onChange={(event) => setQuery(event.target.value)} className={styles.search} />
        <select aria-label="Filter employees" value={filter} onChange={(event) => setFilter(event.target.value)} className={styles.filter}>
          {chips.map(([key, label]) => <option key={key} value={key}>{key === "all" ? "All employees" : label} ({counts[key]})</option>)}
        </select>
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
              className={`${styles.card} border bg-surface shadow-sm ${
                r.user ? "border-border" : "border-rose-300 dark:border-rose-900/60"
              }`}
            >
              <div className={styles.header}>
                <div className={styles.identity}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={styles.name}>{r.user?.displayName || r.sourceName.split(", ").reverse().join(" ")}</span>
                    {/* the office's per-sheet controls, beside the name on
                        Mánu's call 2026-09-02 - the review button sits on the right, and the bottom row
                        holds delivery. Opens rightward from here. */}
                    <SheetMenu
                      timesheetId={r.id}
                      held={r.held}
                      miles={r.miles}
                      milesRemoved={r.milesRemoved}
                      signed={!!r.signedAt}
                      align="left"
                    />
                    {r.held && (
                      <span
                        title={[r.heldByName && `Held by ${r.heldByName}`, r.heldReason]
                          .filter(Boolean).join(" - ") || undefined}
                        className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                      >
                        Signing held
                      </span>
                    )}
                    {/* ONLY WHEN THE MATCH IS NOT CLEAN. Mánu 2026-08-17: 99% of
                        people are an exact match, so an "Exact" pill on 58 of 59
                        rows is a badge that says nothing and hides the two that
                        do. Best guess, Set by hand and No match still show,
                        because those are the rows somebody has to look at. */}
                    {r.matchMethod !== "exact" && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${method.cls}`}>
                        {method.label}
                        {r.matchMethod === "fuzzy" && r.confidence ? ` ${r.confidence}%` : ""}
                      </span>
                    )}
                    {/* THE "partial week" PILL IS GONE. Mánu 2026-08-17: more or
                        less every period cuts a workweek at its boundary, so it
                        was on almost every row - a tag that is always true is
                        not a tag, it is noise on the line that carries the
                        name. `partialWeek` is still on the row and still means
                        the same thing; nothing computes differently. */}
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

                  <p className={styles.period}>{periodLabel}</p>
                  <div className={styles.status}>
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
                  </div>
                </div>
                <TimesheetReviewButton token={r.previewToken} />
              </div>
              <EmployeeHours row={r} />
              <EmployeePayDetails pay={r.pay} />
              <div className={styles.actions}>
                <a href={`/portal/admin/timesheets/sheet/${r.id}/report`} target="_blank" rel="noopener noreferrer" className={styles.report}>Hours &amp; penalties</a>
                <EmployeeDownloads row={r} batchId={batchId} hasSource={hasSource} hasSchedule={hasSchedule} />
              </div>

              {/* the two source documents, sitting with the figures they
                  explain rather than at the bottom with the send controls */}
              <RowDocuments
                batchId={batchId}
                docs={r.docs}
                hasSource={hasSource}
                hasSchedule={hasSchedule}
              />

              <div className={styles.contact}>
                <div className={styles.contactIdentity}>
                  {r.user ? (
                    <>
                      <Avatar name={r.user.displayName} image={r.user.image} size={26} />
                      <div className={styles.contactText}>
                        <p className="text-sm font-medium text-foreground">
                          {r.user.displayName}
                        </p>
                        <p className="text-xs text-muted">{r.user.email}</p>
                        {/* UNDER THE EMAIL, ON ITS OWN LINE, AND IT NEVER
                            TRUNCATES. Both are the same lesson All employees
                            already learned: sharing a line with a work email
                            ellipsised the number away in a narrow column, and a
                            phone number is short and is the thing you are most
                            likely to want to read off this row.
                            Plain and muted rather than the brand-coloured tel:
                            link All employees uses - the email beside it here is
                            plain text, and one of the pair turning into a link
                            would read as the other one being broken. */}
                        {r.user.phone && (
                          <p className="whitespace-nowrap text-xs text-muted">{r.user.phone}</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-rose-700 dark:text-rose-400">
                      Pick who this belongs to
                    </p>
                  )}
                </div>

                {/* same wrapped-line rule as the link block above: the
                    controls are the second item in a wrapping justify-between
                    row, so without `ml-auto` they sat 107px shy of the card
                    edge on every row at 375. */}
                <div className={styles.contactActions}>
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
                    (unconfirmedMatch(r) ? (
                      // A GUESS NEVER SENDS - see match-confirm.js. Picking the
                      // person (Change, the guessed account included) records
                      // the match manual and the button comes back.
                      <span
                        title="The match is the portal's guess. Press Change and pick the person - picking confirms it - and the sheet can send."
                        className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/25 dark:text-amber-300"
                      >
                        Confirm the match to send
                      </span>
                    ) : r.hasPdf ? (
                      <SendOneButton send={send} batchId={batchId} row={r} blocked={blocked} blockedWhy={blockedWhy} />
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

// THE PER-ROW SEND, IN PLACE - Mánu 2026-09-03. The old form's action ended in
// a redirect: every click reloaded the page, scrolled to the top and reset the
// filter tabs, on a list he works top to bottom. This calls the same action
// with `inline` and shows the outcome on the button itself.
//
// A SIGNED SHEET ASKS FIRST. Resending an already-signed review is nearly
// always a misclick, and the person on the other end gets an email asking for
// a signature they already gave.
function SendOneButton({ send, batchId, row, blocked = false, blockedWhy = null }) {
  const [state, setState] = useState("idle");
  // GREYED OUT, NOT HIDDEN - Mánu 2026-09-16: "lets grey out their ability to
  // send". `sendTimesheets` already refuses a salaried exempt person by its own
  // where clause, so the live button here was a press that could only ever do
  // nothing and then report that it had sent something. Disabled and saying why
  // is the honest version; hiding it would leave a blank cell that reads as a
  // row still waiting to be sent.
  // ON `row.user`, NOT ON THE ROW. The page builds the flag inside the matched
  // account (see the `user:` block in [id]/page.js), and the first version of
  // this read `row.salariedExempt`, which is undefined on every row - so the
  // button stayed live and the pin I wrote for it passed on nothing.
  const exempt = row.user?.salariedExempt === true;
  // pinned when the click happens - the revalidate stamps sentAt onto the row,
  // and the receipt must keep saying what the click did
  const [doneLabel, setDoneLabel] = useState("Sent");
  const label = exempt
    ? "Exempt"
    : state === "busy"
      ? "Sending..."
      : state === "done"
        ? doneLabel
        : state === "fail"
          ? "Didn't send"
          : row.sentAt
            ? "Resend"
            : "Send";
  const cls = exempt
    ? "bg-fill text-faint"
    : state === "done"
      ? "bg-emerald-600 text-white"
      : state === "fail"
        ? "bg-rose-600 text-white hover:bg-rose-700"
        : "bg-brand-light text-white hover:bg-brand";
  return (
    <button
      type="button"
      disabled={exempt || state === "busy"}
      title={exempt ? "Salaried and exempt: no signature is asked for, so no email goes out." : undefined}
      onClick={async () => {
        if (
          row.signedAt &&
          !window.confirm(
            `This sheet was signed ${dt(row.signedAt)}. Resending emails them the review link again. Resend it?`,
          )
        ) {
          return;
        }
        // THE PERIOD IS NOT CLOSED, SAID ONCE. The same sentence the panel
        // shows, and the same question it asks on its override, so going early
        // from a row is a decision rather than a click. The server refuses
        // without the `anyway` this sets - see `sendTimesheets`.
        if (blocked && !window.confirm(`${blockedWhy}\n\nSend anyway?`)) return;
        setState("busy");
        setDoneLabel(row.sentAt ? "Resent" : "Sent");
        try {
          const fd = new FormData();
          fd.set("timesheetId", row.id);
          fd.set("inline", "1");
          if (blocked) fd.set("anyway", "1");
          const res = await send(batchId, fd);
          setState(res?.ok ? "done" : "fail");
        } catch {
          setState("fail");
        }
      }}
      className={`rounded-md px-3 py-1 text-xs font-semibold transition disabled:opacity-60 ${cls}`}
    >
      {label}
    </button>
  );
}
