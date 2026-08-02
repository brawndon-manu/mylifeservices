"use client";

// the reconciliation desk: every parsed employee, who we think it is, the
// corrected figures, and per-row send. matching QSP's "Last, First" to portal
// accounts is never perfect, so nothing sends until a person is set here.
import { useState } from "react";
import Avatar from "@/components/Avatar";
import EmployeePicker from "./EmployeePicker";

const fmt = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);
const dt = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;

const METHOD = {
  exact: { label: "Exact", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  fuzzy: { label: "Best guess", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
  manual: { label: "Set by hand", cls: "bg-sky-100 text-brand" },
  unmatched: { label: "No match", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
};

export default function ReviewTable({ rows, candidates, batchId, assign, clear, send }) {
  const [filter, setFilter] = useState("all");

  const counts = {
    all: rows.length,
    needsMatch: rows.filter((r) => !r.user).length,
    unsent: rows.filter((r) => r.user && !r.sentAt).length,
    signed: rows.filter((r) => r.signedAt).length,
    toApprove: rows.filter((r) => r.signedAt && !r.approvedAt).length,
  };
  const shown = rows.filter((r) => {
    if (filter === "needsMatch") return !r.user;
    if (filter === "unsent") return r.user && !r.sentAt;
    if (filter === "signed") return !!r.signedAt;
    if (filter === "toApprove") return r.signedAt && !r.approvedAt;
    return true;
  });

  const chips = [
    ["all", "All"],
    ["needsMatch", "Needs a match"],
    ["unsent", "Not sent yet"],
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
                  {r.approvedAt ? (
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
                  {r.hasPdf && (
                    <a
                      href={`/portal/admin/timesheets/sheet/${r.id}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-brand transition hover:text-brand-dark"
                    >
                      {r.approvedAt ? "Approved PDF" : r.signedAt ? "Signed PDF" : "Preview PDF"} →
                    </a>
                  )}
                </div>
              </div>

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
