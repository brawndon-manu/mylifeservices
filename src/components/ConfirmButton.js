"use client";

// submit button that asks for confirmation before its form's server action
// runs - used for destructive actions (delete / discard / remove). the confirm
// is a site-styled modal (matches the Publish + Send-email dialogs), not the
// native browser confirm(). the real submit lives inside the modal, and since
// this whole thing renders inside the surrounding <form action=...>, clicking
// it submits that form. API is unchanged from the old native version, so every
// existing usage upgrades automatically; pass title/body/confirmLabel to tailor.
import { useEffect, useState } from "react";

export default function ConfirmButton({
  message = "Are you sure?",
  title,
  body,
  confirmLabel = "Confirm",
  destructive = true,
  className,
  children,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        className={className}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl border border-border-strong bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-foreground">{title || message}</h3>
            {body && <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-muted transition hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={() => setOpen(false)}
                className={`rounded-lg px-4 py-2 text-sm font-bold text-white transition ${
                  destructive ? "bg-rose-600 hover:bg-rose-700" : "bg-brand-light hover:bg-brand"
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
