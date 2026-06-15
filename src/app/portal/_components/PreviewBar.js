import { setPreviewRole, clearPreviewRole } from "../preview-actions";
import { previewableRoles } from "@/lib/preview";
import { ROLE_LABELS } from "@/lib/roles";

// IT/SUPER-only bar for previewing the portal as a different (lower) role.
// turns amber while a preview is active so it's obvious you're not seeing
// your normal view. `realRole` decides whether it renders; `effectiveRole`
// is what's currently shown.
export default function PreviewBar({ realRole, effectiveRole, previewing }) {
  const options = previewableRoles(realRole);
  if (options.length === 0) return null;

  const barClass = previewing
    ? "bg-amber-400 text-amber-950"
    : "bg-slate-800 text-slate-100";

  return (
    <div className={barClass}>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-2 text-sm">
        <span className="font-semibold">
          {previewing
            ? `Previewing as ${ROLE_LABELS[effectiveRole] ?? effectiveRole}`
            : "Preview mode"}
        </span>

        <form action={setPreviewRole} className="flex items-center gap-2">
          <label htmlFor="preview-role" className="text-xs opacity-80">
            View as
          </label>
          <select
            id="preview-role"
            name="role"
            defaultValue={effectiveRole}
            className="rounded border-0 bg-white/90 px-2 py-1 text-xs font-medium text-slate-900"
          >
            {options.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r] ?? r}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded bg-black/20 px-2.5 py-1 text-xs font-semibold transition hover:bg-black/30"
          >
            Apply
          </button>
        </form>

        {previewing && (
          <form action={clearPreviewRole}>
            <button
              type="submit"
              className="rounded bg-black/25 px-2.5 py-1 text-xs font-semibold transition hover:bg-black/35"
            >
              Exit preview
            </button>
          </form>
        )}

        <span className="ml-auto text-xs opacity-80">
          IT / Super tool · your real access is unchanged
        </span>
      </div>
    </div>
  );
}
