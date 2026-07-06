// small "NEW" pill for freshly-shipped features. reused across cards so new
// stuff is easy to spot. subtle enough to read in light + dark.
export default function NewBadge({ className = "" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300 ${className}`}
    >
      new
    </span>
  );
}
