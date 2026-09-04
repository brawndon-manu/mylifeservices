"use client";

// PRESENT / ABSENT WITHOUT THE PAGE RELOAD - Mánu 2026-09-04: "its so damn
// slow." These were two <form> posts that revalidated and redirected the
// whole announcement page per click. Now the mark lands in local state the
// instant it is pressed and the light write catches up underneath - the same
// shape the attendance board uses. Pressing the active mark clears it.
import { useState, useTransition } from "react";
import { markAttendance } from "../actions";

const BTN =
  "rounded-md border px-2 py-0.5 text-[11px] font-semibold transition";

export default function RollCallButtons({ postId, userId, optionId = null, attended = null }) {
  const [att, setAtt] = useState(attended);
  const [, start] = useTransition();
  const press = (status) => {
    const next = att === status ? "" : status;
    setAtt(next || null);
    start(async () => {
      try { await markAttendance(postId, userId, next, optionId); } catch {}
    });
  };
  return (
    <>
      <button
        type="button"
        onClick={() => press("present")}
        className={`${BTN} ${
          att === "present"
            ? "border-green-500 bg-green-500 text-white"
            : "border-border-strong text-muted hover:border-green-500 hover:text-green-600"
        }`}
      >
        Present
      </button>
      <button
        type="button"
        onClick={() => press("absent")}
        className={`${BTN} ${
          att === "absent"
            ? "border-rose-500 bg-rose-500 text-white"
            : "border-border-strong text-muted hover:border-rose-500 hover:text-rose-600"
        }`}
      >
        Absent
      </button>
    </>
  );
}
