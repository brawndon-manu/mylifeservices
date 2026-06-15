"use client";

import { useState } from "react";
import { setPreviewRole, clearPreviewRole } from "../preview-actions";
import { previewableRoles } from "@/lib/preview";
import { ROLE_LABELS } from "@/lib/roles";

// IT/SUPER-only floating widget for previewing the portal as a lower role.
// collapsed it's a small pill (amber while a preview is active); clicking it
// opens a panel to pick a role / exit. `realRole` decides whether it renders.
export default function PreviewBar({ realRole, effectiveRole, previewing }) {
  const [open, setOpen] = useState(false);
  const options = previewableRoles(realRole);
  if (options.length === 0) return null;

  const label = ROLE_LABELS[effectiveRole] ?? effectiveRole;

  return (
    <div className="fixed bottom-4 right-4 z-50 print:hidden">
      {open ? (
        <div className="w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <EyeIcon className="h-4 w-4 text-brand-dark" />
              Preview mode
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Collapse"
              className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l8 8M14 6l-8 8" />
              </svg>
            </button>
          </div>

          {previewing && (
            <p className="mb-3 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">
              Viewing as <strong>{label}</strong>
            </p>
          )}

          <form action={setPreviewRole} className="space-y-2">
            <label htmlFor="preview-role" className="block text-xs font-medium text-slate-600">
              View as
            </label>
            <select
              id="preview-role"
              name="role"
              key={effectiveRole}
              defaultValue={effectiveRole}
              className="block w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              {options.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r] ?? r}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="w-full rounded-md bg-brand-light px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Apply
            </button>
          </form>

          {previewing && (
            <form action={clearPreviewRole} className="mt-2">
              <button
                type="submit"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Exit preview
              </button>
            </form>
          )}

          <p className="mt-3 text-[11px] leading-snug text-slate-400">
            IT / Super tool. Your real access is unchanged.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold shadow-lg transition ${
            previewing
              ? "bg-amber-400 text-amber-950 hover:bg-amber-300"
              : "bg-slate-900 text-white hover:bg-slate-800"
          }`}
        >
          <EyeIcon className="h-4 w-4" />
          {previewing ? `Viewing as ${label}` : "Preview"}
        </button>
      )}
    </div>
  );
}

function EyeIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
