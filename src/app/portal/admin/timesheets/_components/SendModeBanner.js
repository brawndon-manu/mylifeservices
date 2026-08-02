// always-visible statement of where timesheet emails actually go. this screen
// can mail 60+ people their own payroll document, so the mode is never implicit.
export default function SendModeBanner({ mode }) {
  if (mode.live) {
    return (
      <div className="mt-6 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 dark:border-rose-900/60 dark:bg-rose-950/30">
        <p className="text-sm font-semibold text-rose-800 dark:text-rose-300">
          LIVE SENDING IS ON
        </p>
        <p className="mt-1 text-sm text-rose-700 dark:text-rose-200/80">
          Emails go to staff at their real addresses. Double-check the matches
          before you send.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/30">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
        Test mode - nothing reaches staff
      </p>
      <p className="mt-1 text-sm text-amber-800 dark:text-amber-200/80">
        Every timesheet email is redirected to{" "}
        <span className="font-medium">{mode.recipients.join(", ")}</span>. The
        message shows who it was meant for. To send for real, set{" "}
        <code className="rounded bg-amber-100 px-1 py-0.5 text-xs dark:bg-amber-900/50">
          TIMESHEET_LIVE_SEND
        </code>{" "}
        in the environment.
      </p>
    </div>
  );
}
