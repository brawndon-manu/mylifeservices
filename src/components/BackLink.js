import Link from "next/link";

// small "← Back to X" link for the top of a section page, so every page
// reachable from a dashboard card has a one-click way back. used for both the
// main dashboard and the admin dashboard.
export default function BackLink({ href, children }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm font-medium text-muted transition hover:text-brand"
    >
      <span aria-hidden="true">←</span> {children}
    </Link>
  );
}
