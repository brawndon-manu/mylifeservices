// FLAGGING FROM INSIDE THE THING ITSELF - Mánu 2026-09-11: "i want to add an
// option to flag the note for review", and 2026-09-12: "i also liked the flag
// for dsn... i like this shift needs a second look."
//
// Shared by the card and Focused review, for the reason NoteBody is: the two
// read the same shift, so they must offer the same thing to do about it.
//
// It toggles ONE kind on the shift's flag. It does not own the flag - the
// decide bar does - so it never touches the reason, the corrected figure, or
// the other kinds. Adding a kind to an undecided or approved shift flags it,
// which is the pile Mánu chose: "flagged above would hold all of those
// combined."
//
// `what` is the sentence the control says out loud, so a card carrying both a
// DSN and a schedule note offers two controls that read differently.
import { useState } from "react";
import { Flag } from "lucide-react";
import styles from "../audit.module.css";

export default function FlagAbout({ on, what, onLabel = "Flagged", onToggle, className = "" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (off) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const ok = await onToggle?.(off);
    setBusy(false);
    if (!ok) setError("Could not save. Please try again.");
  };

  return (
    <div className={className}>
      {error && <p role="alert" className={styles.bad}>{error}</p>}
      {on ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
          <span className="inline-flex items-center gap-1.5">
            <Flag size={12} aria-hidden="true" /> {onLabel}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(true)}
            className="font-semibold text-brand underline underline-offset-4 disabled:opacity-50"
          >
            {busy ? "Clearing…" : "Clear it"}
          </button>
        </p>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(false)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand underline underline-offset-4 disabled:opacity-50"
        >
          <Flag size={12} aria-hidden="true" /> {busy ? "Saving…" : what}
        </button>
      )}
    </div>
  );
}
