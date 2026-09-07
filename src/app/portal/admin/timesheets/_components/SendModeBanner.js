import { CircleCheck, TriangleAlert } from "lucide-react";

// where timesheet emails actually go. once live this is just a quiet status
// line - the real check before mailing 60 people is the confirm on Send all.
// it only gets loud when sends are being redirected, because a redirected batch
// that looks sent is the genuinely confusing state.
export default function SendModeBanner({ mode }) {
  if (mode.live) {
    return (
      <p className="flex items-start gap-2 py-3.5 text-[12.5px] text-muted">
        <CircleCheck
          size={14}
          strokeWidth={1.8}
          aria-hidden="true"
          className="mt-0.5 flex-none text-emerald-500"
        />
        <span>
          <span className="font-medium text-foreground">Live delivery.</span>{" "}
          Emails go to each staff member.
        </span>
      </p>
    );
  }
  // "local" means the live phrase IS set and the environment is holding it
  // shut. Without saying so this reads as a broken setting, and somebody goes
  // looking for a switch to flip.
  const local = mode.reason === "local";
  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-amber-100 px-4 py-3 dark:bg-amber-950/30">
      <TriangleAlert
        size={15}
        strokeWidth={1.8}
        aria-hidden="true"
        className="mt-0.5 flex-none text-amber-700 dark:text-amber-400"
      />
      <div className="text-[12.5px] leading-relaxed text-amber-800 dark:text-amber-200/80">
        <p className="font-semibold text-amber-900 dark:text-amber-300">
          {local
            ? "This isn't the live site - nothing can reach staff from here"
            : "Test mode - nothing reaches staff"}
        </p>
        <p className="mt-0.5">
          Every timesheet email is redirected to{" "}
          <span className="font-medium">{mode.recipients.join(", ")}</span>.
          {local
            ? " Live sending is switched on, but it only applies on the deployed site. A sign-in link built here would point at localhost and be useless to whoever received it."
            : ""}
        </p>
      </div>
    </div>
  );
}
