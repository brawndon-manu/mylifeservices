"use client";

// the author's name, but clickable: hover changes its color, and clicking pops
// a little contact card (avatar, title, email, phone, link to the full contact).
// rendered through a portal so the card's overflow/transform/stacking doesn't
// clip it. drop-in for AuthorChip where we want the preview.
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { preferredName } from "@/lib/contacts";
import { ROLE_LABELS, roleBadgeClass } from "@/lib/roles";

export default function AuthorPreview({ author, size = "md", showRole = false }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, top: r.bottom + 6 });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e) => {
      if (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onMove = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, place]);

  if (!author) return null;
  const isSm = size === "sm";
  const nameClass = isSm ? "text-sm font-medium" : "text-base font-semibold";
  const badgeSize = isSm ? "ml-1.5 text-[10px]" : "ml-2 text-xs";
  const name = preferredName(author) || "—";

  return (
    <span className="relative z-10 inline-flex flex-wrap items-center">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`${nameClass} text-foreground underline-offset-2 transition hover:text-brand hover:underline`}
      >
        {name}
      </button>
      {showRole && author.role && (
        <span className={`${badgeSize} rounded px-1.5 py-0.5 font-medium ${roleBadgeClass(author.role)}`}>
          {ROLE_LABELS[author.role] ?? author.role}
        </span>
      )}
      {author.email && (
        <span className={`${badgeSize} rounded bg-surface-3 px-1.5 py-0.5 font-medium text-muted`}>
          {author.email}
        </span>
      )}

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 60 }}
            className="w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-4 shadow-xl"
          >
            <div className="flex items-center gap-3">
              <Avatar name={name} email={author.email} image={author.image} size={44} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                {author.title && (
                  <p className="truncate text-xs text-muted">{author.title}</p>
                )}
              </div>
            </div>
            <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
              {author.email && (
                <a
                  href={`mailto:${author.email}`}
                  className="flex items-center gap-2 text-brand transition hover:underline"
                >
                  <MailIcon className="h-4 w-4 flex-none" />
                  <span className="truncate">{author.email}</span>
                </a>
              )}
              {author.phone && (
                <a
                  href={`tel:${author.phone}`}
                  className="flex items-center gap-2 text-foreground transition hover:text-brand"
                >
                  <PhoneIcon className="h-4 w-4 flex-none" />
                  {author.phone}
                </a>
              )}
            </div>
            <Link
              href={`/portal/contacts/${author.id}`}
              className="mt-3 inline-block text-xs font-medium text-brand transition hover:underline"
            >
              View full contact →
            </Link>
          </div>,
          document.body,
        )}
    </span>
  );
}

function MailIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function PhoneIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L20 13l-2 4a2 2 0 0 1-2 1A14 14 0 0 1 4 6a2 2 0 0 1 1-2z" />
    </svg>
  );
}
