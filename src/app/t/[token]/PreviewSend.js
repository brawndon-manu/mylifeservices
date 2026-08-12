"use client";

// SENDING SOMEBODY THEIR OWN LINK, FROM THE PAGE YOU ARE READING TO THEM.
//
// Mánu 2026-08-12: "have an option to send it out as an email so they can just
// sign it. because this is gonna be used if they can[not] get into it or
// whatever, and then I'll call them and go over it with them on the phone."
//
// That is the whole shape of it: the preview exists so somebody who cannot open
// their link can still be walked through their sheet, and a call like that ends
// with them needing the link. Everything else on this page is refused in preview
// mode; this is the one thing it may do, because it changes nothing about their
// answers - it only puts the door in front of them again.
//
// TWO STEPS, ALWAYS. The first click reveals who it is about to reach and
// whether the environment will really send it; the second sends. A single button
// that mails a real employee on one click is the wrong shape for a control that
// sits on a page an admin opens to LOOK at things - the muscle memory here is
// reading, not sending.

import { useState, useTransition } from "react";

export default function PreviewSend({
  action, timesheetId, name, email, mode, alreadySent,
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  // NOT SENDABLE, AND SAYING WHICH. A sheet nobody is matched to has no address
  // to send to, and the fix for that is on the batch screen rather than here.
  if (!email) {
    return (
      <p className="mt-3 border-t border-amber-300 pt-3 text-sm text-amber-800 dark:border-amber-800 dark:text-amber-300">
        No account is matched to this timesheet yet, so there is nobody to send
        it to. Match them on the batch screen first.
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-amber-300 pt-3 dark:border-amber-800">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-amber-400 px-3 py-1.5 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
        >
          {alreadySent ? "Send their link again" : "Email them their link"}
        </button>
      ) : (
        <form action={action}>
          <input type="hidden" name="timesheetId" value={timesheetId} />
          {/* the point of the button is usually that the first one did not
              arrive or could not be opened, so it must not skip an already-sent
              row the way a batch send does */}
          <input type="hidden" name="resend" value="on" />

          <p className="text-sm text-amber-900 dark:text-amber-200">
            {alreadySent ? "Send again to " : "Send to "}
            <b>{name}</b> at <span className="font-mono">{email}</span>?
          </p>

          {/* WHERE IT WILL ACTUALLY LAND. In test mode the address above is not
              the address it goes to, and finding that out afterwards is how a
              real send gets made by mistake in the other direction. */}
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            {mode?.live
              ? "Live - this really goes to them."
              : `${mode?.label || "Test mode"}${
                  mode?.recipients?.length ? ` (${mode.recipients.join(", ")})` : ""
                }`}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              onClick={() => start(() => {})}
              className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send it"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setOpen(false)}
              className="rounded-lg border border-amber-400 px-3 py-1.5 text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-60 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
