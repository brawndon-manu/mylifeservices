"use client";

import { useState, useTransition } from "react";
import Avatar from "@/components/Avatar";
import { addRowComment, deleteRowComment } from "./flag-actions";

// NOTES BETWEEN THE PEOPLE WORKING THE LIST.
//
// Mánu 2026-08-13: "I also want to add a little comment section. Underneath each
// card."
//
// The status says where somebody is and the log says what was done. Neither can
// hold "her phone is broken, use the email" - that is a sentence, and this is
// where it goes.
//
// CLOSED UNTIL THERE IS SOMETHING TO SAY. Sixty cards each carrying an open
// textarea is a wall of empty boxes; the count on the toggle is what tells you a
// card has something worth reading. It opens automatically when there are
// comments, because a note nobody sees is a note nobody wrote.
export default function RowComments({ batchId, rowKey, comments = [] }) {
  const [open, setOpen] = useState(comments.length > 0);
  const [body, setBody] = useState("");
  const [error, setError] = useState(null);
  const [pending, start] = useTransition();

  const send = () => {
    const text = body.trim();
    if (!text) return;
    start(async () => {
      setError(null);
      const res = await addRowComment({ batchId, rowKey, body: text });
      if (res?.ok) setBody("");
      else setError(res?.error === "empty" ? "Write something first." : "That did not save.");
    });
  };

  const remove = (id) =>
    start(async () => {
      setError(null);
      const res = await deleteRowComment(id);
      if (!res?.ok) {
        setError(res?.error === "notyours" ? "That is somebody else's note." : "That did not delete.");
      }
    });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-[11px] font-medium text-brand hover:underline"
      >
        Add a note
      </button>
    );
  }

  return (
    <div className="mt-2 border-t border-border pt-2">
      {comments.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">
                <Avatar name={c.userName} image={c.userImage} size={18} />
              </span>
              <span className="min-w-0 flex-1 text-xs">
                {/* the sentence first, because that is what somebody is here to
                    read. Who and when are the footnote. */}
                <span className="block whitespace-pre-wrap break-words text-foreground">{c.body}</span>
                <span className="text-[11px] text-faint">
                  {c.userName || "somebody"} · {c.when}
                  {c.isMine && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        disabled={pending}
                        className="text-faint underline hover:text-rose-600 disabled:opacity-50"
                      >
                        delete
                      </button>
                    </>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-start gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter makes a new line. A note is usually one
            // sentence, so reaching for the mouse to post it is the wrong shape.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Add a note for whoever picks this up next"
          className="min-h-[2rem] flex-1 resize-y rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs text-foreground placeholder:text-faint focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || !body.trim()}
          className="shrink-0 rounded-md border border-border-strong bg-surface-2 px-2.5 py-1.5 text-[11px] font-semibold text-foreground disabled:opacity-40"
        >
          {pending ? "Saving..." : "Post"}
        </button>
      </div>
      {error && <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
