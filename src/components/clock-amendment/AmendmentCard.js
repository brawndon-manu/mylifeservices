import { firstLast, stageLine, amendmentStage } from "@/lib/clock-amendment/rules";

// THE THREE RECORDS OF ONE SHIFT, LINED UP, the way the Audit card lines them
// up: what was scheduled, what the clock caught, when the person who was there
// filed their note. Shared by the form the staff member signs, the screen the
// office approves from, and the upload screen where a form is raised, so none
// of them can disagree about what the evidence says.
//
// No hooks, no client state: it renders on the server for the two pages and
// inside the client component on the third.

const hrs = (min) => (min == null ? null : `${(min / 60).toFixed(2)}`);

const TONE = {
  draft: "text-muted",
  sent: "text-sky-700 dark:text-sky-300",
  filled: "text-amber-700 dark:text-amber-300",
  approved: "text-emerald-700 dark:text-emerald-400",
};

export default function AmendmentCard({ a, staffName, showNote = true, children = null }) {
  const note = a.note || null;
  const stage = amendmentStage(a);

  return (
    <article className="rounded-xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-base font-semibold text-foreground">{staffName}</span>
        <span className="shrink-0 text-right">
          <span className="block text-sm tabular-nums text-muted">{a.shiftDate}</span>
          <span className={`mt-0.5 flex items-center justify-end gap-1.5 text-sm font-medium ${TONE[stage]}`}>
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
            {stageLine(a)}
          </span>
        </span>
      </div>
      <p className="mt-0.5 text-sm">
        <span className="font-semibold text-foreground">{firstLast(a.clientName)}</span>
        {a.service && <span className="ml-3 text-muted">{a.service}</span>}
      </p>

      <AmendmentFigures a={a} />

      {showNote && note && <NoteOpen note={note} shiftDate={a.shiftDate} />}
      {children}
    </article>
  );
}

// THE FIGURES: the booking, the two punches drawn the way the Audit card draws
// them, and when the note was filed - the time is the figure that matters
// here, so it gets the big type. Then the note on its own line.
export function AmendmentFigures({ a, className = "mt-5" }) {
  const row = a.clockRow || {};
  const note = a.note || null;
  const scheduledMin = row.scheduledMin ?? null;

  return (
    <div className={className}>
      <dl className="grid grid-cols-3 gap-x-5 gap-y-3 pb-4">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-[.075em] text-faint">Scheduled</dt>
          <dd className="mt-1 text-[20px] font-medium leading-tight tabular-nums text-foreground sm:text-[23px]">
            {scheduledMin != null ? <>{hrs(scheduledMin)}<span className="ml-0.5 text-[13px] font-medium text-muted">h</span></> : "—"}
          </dd>
          <dd className="mt-0.5 text-[11px] tabular-nums text-muted">{a.scheduledIn || "?"}–{a.scheduledOut || "?"}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-[.075em] text-faint">Clock</dt>
          <Punch end="in" time={a.clockedIn} gps={row.gpsIn} />
          <Punch end="out" time={a.clockedOut} gps={row.gpsOut} />
          {row.reason && <dd className="mt-1 text-[11px] text-muted">Reason on the export: {row.reason}</dd>}
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-[.075em] text-faint">DSN submitted at</dt>
          {note?.signedAt ? (
            <>
              <dd className="mt-1 text-[20px] font-medium leading-tight tabular-nums text-foreground sm:text-[23px]">
                {note.signedAt.replace(/\s*[AP]M$/i, "")}
                <span className="ml-1 text-[13px] font-medium text-muted">{(note.signedAt.match(/[AP]M$/i) || [""])[0]}</span>
              </dd>
              {note.signedDate && note.signedDate !== a.shiftDate && (
                <dd className="mt-0.5 text-[11px] tabular-nums text-rose-600 dark:text-rose-400">on {note.signedDate}</dd>
              )}
            </>
          ) : note ? (
            <dd className="mt-1 text-[13px] font-medium leading-snug text-rose-600 dark:text-rose-400">no signature on the note</dd>
          ) : (
            <dd className="mt-1 text-[13px] font-medium leading-snug text-rose-600 dark:text-rose-400">no note found</dd>
          )}
        </div>
      </dl>

      <dl className="border-t border-border pt-4">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-[.075em] text-faint">Note</dt>
          {note ? (
            <dd className="mt-1 text-[16px] font-semibold text-foreground">
              <span className="mr-2 text-[11px] tracking-wide text-emerald-700 dark:text-emerald-400">DSN</span>{note.words} words
            </dd>
          ) : (
            <dd className="mt-1 text-[13px] font-semibold text-rose-600 dark:text-rose-400">No DSN for this visit</dd>
          )}
        </div>
      </dl>
      <p className="mt-4 text-[10px] text-faint">Scheduled: QSP booking · Clock: recorded punches · DSN: their Daily Service Note for this visit</p>
    </div>
  );
}

// ONE PUNCH, drawn the way the Audit card draws it: the end, a mark, the time
// in its short form, and whether the location was captured. A missing punch is
// a red cross and a dash, never a time, and GPS on a missing punch is a dash
// rather than a cross because there was no punch for it to be missing from.
const short = (t) => (t ? String(t).replace(/\s*([AP])M$/i, (m, p) => p.toLowerCase()) : null);

function Mark({ value, label }) {
  const description = value === "yes" ? "recorded" : value === "no" ? "missing" : "unavailable";
  return (
    <span
      aria-label={`${label}: ${description}`}
      title={`${label}: ${description}`}
      className={value === "yes" ? "text-emerald-600 dark:text-emerald-400" : value === "no" ? "text-rose-600 dark:text-rose-400" : "text-faint"}
    >
      {value === "yes" ? "✓" : value === "no" ? "✕" : "—"}
    </span>
  );
}

function Punch({ end, time, gps }) {
  const punched = time ? "yes" : "no";
  const located = time ? (gps === "yes" ? "yes" : gps === "no" ? "no" : null) : null;
  return (
    <dd className="mt-1 grid grid-cols-[26px_22px_64px_31px_20px] items-center text-[13px] tabular-nums text-muted">
      <span>{end}</span>
      <Mark value={punched} label={`Clock ${end}`} />
      <span className={time ? "text-foreground" : ""}>{short(time) || "—"}</span>
      <span>GPS</span>
      <Mark value={located} label={`${end} GPS`} />
    </dd>
  );
}

// THE DSN, OPEN. The objectives as the phone asks them, Yes with the comment
// filed and a quiet No where none was, then the summary. Notes the reader could
// not split into objectives keep the flat reading.
function NoteOpen({ note, shiftDate }) {
  const sections = Array.isArray(note.sections) ? note.sections.filter((s) => s.goal || s.comment) : [];
  const withComments = sections.filter((s) => s.comment).length;
  return (
    <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-faint">
        <span className="tracking-wide text-emerald-700 dark:text-emerald-400">DSN</span>
        <span>
          {note.words} words
          {sections.length ? ` · ${sections.length} ${sections.length === 1 ? "objective" : "objectives"}, ${withComments} with ${withComments === 1 ? "a comment" : "comments"}` : ""}
        </span>
        {note.highPriority && <span className="ml-auto rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">High Priority</span>}
      </div>
      {sections.map((s, i) => (
        <div key={i} className="mt-3">
          <p className="flex items-baseline gap-2 text-xs">
            <span className={s.comment ? "font-bold text-foreground" : "font-medium text-muted"}>{s.goal || "(objective)"}</span>
            <span className={`text-[10px] font-bold tracking-wide ${s.comment ? "text-emerald-600 dark:text-emerald-400" : "text-faint"}`}>{s.comment ? "YES" : "NO"}</span>
          </p>
          {s.comment && <p className="mt-1 text-sm leading-relaxed text-foreground">{s.comment}</p>}
        </div>
      ))}
      {note.summary && (
        <div className={`${sections.length ? "mt-4 border-t border-border pt-3" : "mt-3"}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-faint">Summary</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{note.summary}</p>
        </div>
      )}
      <p className="mt-3 text-xs text-faint">
        {note.signedAt ? `Filed ${note.signedAt}${note.signedDate && note.signedDate !== shiftDate ? ` on ${note.signedDate}` : ""}` : "Not signed on the note"}
        {note.page ? ` · page ${note.page} of the export` : ""}
      </p>
      {sections.length > 0 && (
        <p className="mt-2 text-[10px] leading-relaxed text-faint">Yes carries the comment the writer filed. A goal with no comment was marked No.</p>
      )}
    </div>
  );
}
