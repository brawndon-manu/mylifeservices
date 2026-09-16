"use client";

import { useEffect, useState, useTransition } from "react";
import styles from "./DataChecks.module.css";
import { setCheckNote } from "./flag-actions";
import { NOTE_MAX } from "@/lib/timesheet/check-notes";
import { useReadOnly } from "../ReadOnly";

// THE ONE NOTE ON A FINDING, read and rewritten in place.
//
// Mánu 2026-09-15: "can you make it so we can add notes that can be edited for
// the data checks page". One note rather than the people page's thread, his
// pick off the mock: a thread grows down a sixty-row screen and has to be read
// in order, a note is the current answer and can be corrected when it stops
// being true.
//
// NO BOX AROUND IT. The row already carries the day panel and the documents
// panel, both on their own surface, and a third would be a card inside a card.
// A hairline and the spacing say where it starts.
//
// CLOSED UNTIL THERE IS SOMETHING TO SAY, like the people page's comments:
// sixty rows each holding an open textarea is a wall of empty boxes. A note that
// exists is always open, because a note nobody sees is a note nobody wrote.
export default function CheckNote({ batchId, personKey, findingKey, note = null }) {
  // A REPLACED UPLOAD IS READ ONLY. The server refuses every write on one
  // regardless - this only stops the press being wasted, and says why.
  const readOnly = useReadOnly();

  const saved = note?.body ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(saved);
  const [error, setError] = useState(null);
  const [pending, start] = useTransition();

  // WHAT WE JUST WROTE, HELD UNTIL THE PAGE CATCHES UP.
  //
  // The action revalidates and the new props arrive a couple of seconds later -
  // two on this machine warm, longer on a cold route. Rendering `saved` straight
  // away puts the OLD sentence back on screen for those seconds, which is the
  // same defect the review page had on 2026-09-15: the answer visibly came
  // undone. So the card shows its own write until the props carry it.
  const [mine, setMine] = useState(null);
  useEffect(() => {
    if (mine != null && mine === saved) setMine(null);
  }, [mine, saved]);
  const body = mine != null ? mine : saved;

  const open = () => {
    if (readOnly) return;
    setDraft(body);
    setError(null);
    setEditing(true);
  };

  // Clearing the box and pressing Delete note are one act - see the action. Both
  // land here, so there is no second path to keep in step with this one.
  const write = (text) =>
    start(async () => {
      setError(null);
      const res = await setCheckNote({ batchId, personKey, findingKey, body: text });
      if (res?.ok) {
        setMine(res.body ?? "");
        setEditing(false);
        return;
      }
      setError(
        res?.error === "superseded"
          ? res.say
          : res?.error === "forbidden"
            ? "You cannot write notes on this batch."
            : "That did not save.",
      );
    });

  if (editing) {
    return (
      <div className={styles.noteEdit}>
        <textarea
          autoFocus
          value={draft}
          maxLength={NOTE_MAX}
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What should whoever picks this up next know?"
          className={styles.noteBox}
        />
        <div className={styles.noteActions}>
          {/* a form is not involved and these call an action from a handler, so
              they are buttons rather than submits */}
          <button type="button" className={styles.noteSave} disabled={pending} onClick={() => write(draft)}>
            {pending ? "Saving..." : "Save"}
          </button>
          <button type="button" className={styles.noteCancel} disabled={pending} onClick={() => { setEditing(false); setError(null); }}>
            Cancel
          </button>
          {body && (
            <button type="button" className={styles.noteDelete} disabled={pending} onClick={() => write("")}>
              Delete note
            </button>
          )}
        </div>
        <p className={styles.noteHint}>
          Anybody working this list can edit the note. It stays with the finding when the period is uploaded again.
        </p>
        {error && <p className={styles.noteError}>{error}</p>}
      </div>
    );
  }

  if (!body) {
    return (
      <>
        <button type="button" className={styles.noteAdd} onClick={open} disabled={!!readOnly}>
          Add a note
        </button>
        {error && <p className={styles.noteError}>{error}</p>}
      </>
    );
  }

  return (
    <div className={styles.note}>
      <p className={styles.noteBody}>{body}</p>
      <p className={styles.noteMeta}>
        {/* WHO AND WHEN ARE THE FOOTNOTE. The sentence is what somebody opened
            the row to read. While our own write is still ahead of the props the
            stored name and time belong to the version being replaced, so they
            stay off rather than naming the wrong edit. */}
        {mine != null
          ? "Edited just now"
          : `${note?.by || "somebody"} · edited ${note?.when}`}
        {!readOnly && (
          <>
            {" · "}
            <button type="button" onClick={open}>Edit</button>
          </>
        )}
      </p>
      {error && <p className={styles.noteError}>{error}</p>}
    </div>
  );
}
