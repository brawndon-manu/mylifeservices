// WHICH PAYROLL A BATCH BELONGS TO. Renders only for the day program - MLS is
// the default everything has always been, and a badge that appears on every
// card says nothing. Purple, because every other pill colour on these cards
// already means something (rose = still coming in, amber = needs a decision,
// emerald = signatures).
export default function ProgramBadge({ batch, size = "md" }) {
  if (batch?.program !== "DP") return null;
  const sm = size === "sm";
  return (
    <span
      className={`inline-flex items-center rounded-full border border-violet-300 bg-violet-50 font-bold uppercase tracking-wide text-violet-800 dark:border-violet-700/70 dark:bg-violet-950/40 dark:text-violet-300 ${
        sm ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      }`}
    >
      Day Program
    </span>
  );
}
