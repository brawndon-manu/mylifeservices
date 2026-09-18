"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import PersonPicker from "./PersonPicker";

// RAISING ONE. Mánu's flow, 2026-09-18: "i select the staff; i write in the
// client, service, scheduled, clocked in and out if we have it or not, then we
// send it out."
//
// EVERYTHING THE OFFICE CAN SUPPLY, IT SUPPLIES. The form is stronger the less
// of it anybody has to remember later, so where their own service note for the
// visit exists it goes on here too and the recipient confirms rather than
// reconstructs.
//
// THE REASON IS NOT ASKED FOR HERE, which is not the same as not being asked.
// Collecting it is the point of the whole exercise, and it is required on the
// form the person who was actually there fills in - they are the only one who
// knows it, and a reason relayed through the office is a reason at second hand.
const ERRORS = {
  auth: "You do not have access to raise one of these.",
  who: "Pick the staff member and who it is going to.",
  shift: "The client, the service and the date are all needed.",
  date: "Write the date as MM/DD/YY.",
  failed: "Something went wrong saving that. Please try again.",
};

export default function NewAmendmentForm({ search, create }) {
  const [staff, setStaff] = useState(null);
  const [err, setErr] = useState(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setErr(null);
    start(async () => {
      const res = await create(form);
      if (res?.ok) router.push("/portal/admin/clock-amendments");
      else setErr(ERRORS[res?.error] || ERRORS.failed);
    });
  };

  const field =
    "min-h-[44px] w-full rounded-[9px] border border-border-strong bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-brand";
  const lbl = "block text-[12.5px] font-medium text-muted";

  return (
    <form onSubmit={submit} className="mt-7 space-y-7">
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-[13px] font-semibold text-foreground">Whose shift</h2>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
          The staff member the hours belong to. The finished copy goes to them whoever fills it in.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <PersonPicker
            name="staffId"
            label="Staff member"
            search={search}
            onPick={setStaff}
          />
          <PersonPicker
            name="recipientId"
            label="Send it to"
            hint="Them, or their supervisor."
            search={search}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-[13px] font-semibold text-foreground">The shift</h2>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
          As the office holds it. This is printed on the form, so they confirm it rather than write
          it out again.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={lbl} htmlFor="clientName">Person served</label>
            <input id="clientName" name="clientName" required className={`mt-1.5 ${field}`} />
          </div>
          <div>
            <label className={lbl} htmlFor="service">Service</label>
            <input id="service" name="service" required placeholder="ILS Service" className={`mt-1.5 ${field}`} />
          </div>
          <div>
            <label className={lbl} htmlFor="shiftDate">Date of the shift</label>
            <input
              id="shiftDate" name="shiftDate" required placeholder="09/07/26"
              inputMode="numeric" pattern="\d{2}/\d{2}/\d{2}"
              className={`mt-1.5 ${field}`}
            />
            <p className="mt-1 text-[11.5px] text-faint">MM/DD/YY, the way the timesheets write it.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={lbl} htmlFor="scheduledIn">Scheduled in</label>
            <input id="scheduledIn" name="scheduledIn" placeholder="9:00 AM" className={`mt-1.5 ${field}`} />
          </div>
          <div>
            <label className={lbl} htmlFor="scheduledOut">Scheduled out</label>
            <input id="scheduledOut" name="scheduledOut" placeholder="1:00 PM" className={`mt-1.5 ${field}`} />
          </div>
        </div>

        {/* WHAT THE CLOCK DID CATCH, IF ANYTHING. Left empty is not a blank
            somebody forgot - it is the fact the form exists to record. */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={lbl} htmlFor="clockedIn">Clocked in</label>
            <input id="clockedIn" name="clockedIn" placeholder="Leave empty if none" className={`mt-1.5 ${field}`} />
          </div>
          <div>
            <label className={lbl} htmlFor="clockedOut">Clocked out</label>
            <input id="clockedOut" name="clockedOut" placeholder="Leave empty if none" className={`mt-1.5 ${field}`} />
          </div>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
          Leave a clock field empty where there is no punch. An empty one reads as no punch, which is
          the thing being recorded.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-[13px] font-semibold text-foreground">Their service note for this visit</h2>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
          Optional, and the strongest thing on the form where it exists. A note written on the day,
          before anybody knew the clock had failed, is what turns this from a claim into a
          confirmation.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={lbl} htmlFor="dsnStart">Note says from</label>
            <input id="dsnStart" name="dsnStart" placeholder="9:30 AM" className={`mt-1.5 ${field}`} />
          </div>
          <div>
            <label className={lbl} htmlFor="dsnEnd">Note says to</label>
            <input id="dsnEnd" name="dsnEnd" placeholder="1:00 PM" className={`mt-1.5 ${field}`} />
          </div>
        </div>
        <div className="mt-4">
          <label className={lbl} htmlFor="dsnSummary">What the note says</label>
          <textarea
            id="dsnSummary" name="dsnSummary" rows={3}
            className={`mt-1.5 min-h-[76px] w-full rounded-[9px] border border-border-strong bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-brand`}
          />
        </div>
      </section>

      {err && (
        <p className="rounded-[9px] border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-700 dark:text-rose-300">
          {err}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <p className="mr-auto text-[11.5px] text-faint">
          {staff ? `For ${staff.label}.` : "Nothing is sent yet."}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="min-h-[44px] rounded-[9px] bg-brand px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save it"}
        </button>
      </div>
    </form>
  );
}
