import { ROLE_LABELS, roleBadgeClass } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";

// renders an author's display name with a small role badge next to it,
// plus a muted email badge so duplicate names (e.g. three "Brandon"s)
// are easy to tell apart. mirrors the style used in the portal header +
// dashboard greeting so the visual language is consistent.
//
// props:
//   - author:   { name, role, email } - pulled from prisma
//   - size:     "sm" | "md"           - md for posts, sm for comments
//   - showRole: only render the privilege-role badge when true. off by
//               default so roles never leak - the caller passes
//               canSeeRoles(viewer.role) (ADMIN/IT only). staff just see
//               the name.
export default function AuthorChip({ author, size = "md", showRole = false }) {
  if (!author) return null;
  const isSm = size === "sm";
  const nameClass = isSm
    ? "text-sm font-medium text-foreground"
    : "text-base font-semibold text-foreground";
  const roleBadge = isSm
    ? `ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${roleBadgeClass(author.role)}`
    : `ml-2 rounded px-2 py-0.5 text-xs font-medium ${roleBadgeClass(author.role)}`;
  const emailBadgeClass = isSm
    ? "ml-1.5 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-muted"
    : "ml-2 rounded bg-surface-3 px-2 py-0.5 text-xs font-medium text-muted";

  return (
    <span className="inline-flex flex-wrap items-center">
      <span className={nameClass}>{preferredName(author) || "—"}</span>
      {showRole && author.role && (
        <span className={roleBadge}>
          {ROLE_LABELS[author.role] ?? author.role}
        </span>
      )}
      {author.email && (
        <span className={emailBadgeClass}>{author.email}</span>
      )}
    </span>
  );
}
