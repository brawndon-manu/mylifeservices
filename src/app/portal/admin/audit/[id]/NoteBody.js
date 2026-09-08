// THE DSN, SHAPED LIKE THE FORM IT CAME FROM - Mánu 2026-09-07, showing the
// phone screens: "we get a list of their objectives and mark yes or no. if
// yes we give the explanation of what was done. summary is for if you did
// something that isnt listed in their objectives." So a note that carries
// rebuilt sections prints each objective under its own name with the
// writer's comment, a quiet No where no comment was filed, and the Summary
// under its own label. Notes parsed before the sections existed (and the
// supervisor .xls notes, which have no objectives) keep the flat reading.
//
// Shared by the card fold-out and Focused review so the two can never
// disagree about what a note says.
import styles from "../audit.module.css";

export default function NoteBody({ note }) {
  const sections = Array.isArray(note.sections) ? note.sections : null;
  if (!sections?.length) {
    return (
      <>
        <p className="text-sm leading-relaxed text-foreground">{note.summary}</p>
        {note.categories.length > 0 && (
          <p className="mt-2 text-xs text-faint">{note.categories.join(" · ")}</p>
        )}
        {note.comments.map((c, i) => (
          <p key={i} className="mt-2 text-sm leading-relaxed text-muted">{c}</p>
        ))}
        <NoteFoot note={note} />
      </>
    );
  }
  const withComments = sections.filter((s) => s.comment).length;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {note.source === "dsn" && <span className={styles.noteTag}>DSN</span>}
        <span className="text-[11px] text-faint">
          {note.words} words · {sections.length} {sections.length === 1 ? "objective" : "objectives"}, {withComments} {withComments === 1 ? "with a comment" : "with comments"}
        </span>
        {note.highPriority && (
          <span className="ml-auto rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
            High Priority
          </span>
        )}
      </div>
      {sections.map((s, i) => (
        <div key={i} className="mt-3">
          <p className="flex items-baseline gap-2 text-xs">
            <span className={s.comment ? "font-bold text-foreground" : "font-medium text-muted"}>{s.goal}</span>
            <span
              className={`text-[10px] font-bold tracking-wide ${
                s.comment ? "text-emerald-600 dark:text-emerald-400" : "text-faint"
              }`}
            >
              {s.comment ? "YES" : "NO"}
            </span>
          </p>
          {s.comment && <p className="mt-1 text-sm leading-relaxed text-foreground">{s.comment}</p>}
        </div>
      ))}
      {note.summary && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-faint">Summary</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{note.summary}</p>
        </div>
      )}
      <NoteFoot note={note} />
      <p className="mt-2 text-[10px] leading-relaxed text-faint">
        Yes carries the comment the writer filed. A goal with no comment was marked No.
      </p>
    </>
  );
}

function NoteFoot({ note }) {
  return (
    <p className="mt-3 text-xs text-faint">
      Signed {note.signedDate} {note.signedAt}
      {note.miles ? " · miles claimed" : ""}
      {note.page ? ` · page ${note.page} of the export` : ""}
    </p>
  );
}
