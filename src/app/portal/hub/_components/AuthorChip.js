import { ROLE_LABELS } from "@/lib/roles";

// renders an author's display name with a small role badge next to it.
// mirrors the style used in the portal header + dashboard greeting so
// the visual language is consistent across the portal.
//
// props:
//   - author: { name, role } — pulled from prisma
//   - size:   "sm" | "md"     — md for posts, sm for comments
export default function AuthorChip({ author, size = "md" }) {
  if (!author) return null;
  const isSm = size === "sm";
  const nameClass = isSm
    ? "text-sm font-medium text-slate-900"
    : "text-base font-semibold text-slate-900";
  const badgeClass = isSm
    ? "ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-brand"
    : "ml-2 rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-brand";

  return (
    <span className="inline-flex items-center">
      <span className={nameClass}>{author.name || "—"}</span>
      <span className={badgeClass}>
        {ROLE_LABELS[author.role] ?? author.role}
      </span>
    </span>
  );
}
