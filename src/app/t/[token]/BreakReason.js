"use client";

// THE ONE THING WE NEED FROM THEM BEFORE A TIMESHEET CAN BE PUT TOGETHER.
//
// Two shapes, decided by whether anybody got a reason on the phone:
//
//   confirm  we wrote one down, so it is read back to them. We took it off a
//            call - it is somebody's memory of what was said and it is about to
//            be printed on their sheet, so they check it first.
//   write    nobody gathered one, so they write it themselves.
//
// SAYING NO KEEPS OURS. Both go on the bottom of the sheet, because deleting
// ours would hide that the record moved and that is the whole reason for asking.
//
// NO PREMIUM LANGUAGE ANYWHERE HERE. What is owed is admin's business; this page
// is collecting a fact.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function BreakReason({ token, ask, submitAction }) {
  const [text, setText] = useState("");
  const [changing, setChanging] = useState(false);
  const [err, setErr] = useState(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const send = (agree, said) =>
    start(async () => {
      setErr(null);
      const res = await submitAction({ token, findingKey: ask.findingKey, agree, text: said });
      if (res?.ok) { setChanging(false); setText(""); router.refresh(); }
      else setErr(res?.error === "empty" ? "Please write something first." : "That did not save. Try again?");
    });

  const label = ask.kind === "rest" ? "rest break" : "meal break";

  return (
    <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700/70 dark:bg-amber-950/30">
      <p className="font-mono text-xs font-bold text-amber-800 dark:text-amber-300">{ask.date}</p>

      {/* WE HAVE ONE, AND THEY HAVE NOT CHECKED IT YET */}
      {ask.mode === "confirm" && !changing && (
        <>
          <p className="mt-2 font-semibold text-foreground">
            You told us you did not take your {label} that day.
          </p>
          <p className="mt-2 rounded-lg border border-amber-300 bg-surface px-3 py-2 text-sm italic text-foreground dark:border-amber-800">
            &ldquo;{ask.reason}&rdquo;
          </p>
          <p className="mt-3 font-semibold text-foreground">Is that correct?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => send(true, null)}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              {pending ? "Saving…" : "Yes, that is right"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setChanging(true)}
              className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-sm font-semibold text-foreground transition hover:bg-surface-2 disabled:opacity-60"
            >
              No, that is not what I said
            </button>
          </div>
        </>
      )}

      {/* THEY SAID NO. Ours is struck rather than removed - it still goes on the
          sheet, and pretending otherwise would be the tidier lie. */}
      {ask.mode === "confirm" && changing && (
        <>
          <p className="mt-2 font-semibold text-foreground">
            You told us you did not take your {label} that day.
          </p>
          <p className="mt-2 rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm italic text-faint line-through">
            &ldquo;{ask.reason}&rdquo;
          </p>
          <p className="mt-3 font-semibold text-foreground">What is the right reason?</p>
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="In your own words."
            className="mt-2 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !text.trim()}
              onClick={() => send(false, text)}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              {pending ? "Saving…" : "Save this instead"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setChanging(false)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition hover:text-foreground disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* NOBODY GATHERED ONE */}
      {ask.mode === "write" && (
        <>
          <p className="mt-2 font-semibold text-foreground">
            You did not take your {label} that day. Can you tell us why?
          </p>
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="For example: the client would not settle and I could not leave them."
            className="mt-2 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
          />
          <div className="mt-2">
            <button
              type="button"
              disabled={pending || !text.trim()}
              onClick={() => send(true, text)}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </>
      )}

      {err && <p className="mt-2 text-sm font-semibold text-rose-700 dark:text-rose-400">{err}</p>}
    </div>
  );
}
