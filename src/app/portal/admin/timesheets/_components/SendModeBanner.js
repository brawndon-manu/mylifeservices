// where timesheet emails actually go. once live this is just a quiet status
// line - the real check before mailing 60 people is the confirm on Send all.
// it only gets loud when sends are being redirected, because a redirected batch
// that looks sent is the genuinely confusing state.
export default function SendModeBanner({ mode }) {
  if (mode.live) {
    return (
      <p className="mt-4 flex items-center gap-2 text-xs text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Sending is live - staff receive these at their own email address.
      </p>
    );
  }
  return (
    <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/30">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
        Test mode - nothing reaches staff
      </p>
      <p className="mt-1 text-sm text-amber-800 dark:text-amber-200/80">
        Every timesheet email is redirected to{" "}
        <span className="font-medium">{mode.recipients.join(", ")}</span>.
      </p>
    </div>
  );
}
