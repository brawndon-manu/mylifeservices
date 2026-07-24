"use client";

// the "staff bypass" box on the maintenance splash. posts the password to the
// bypass route; on success the server sets the signed cookie and we reload into
// the site. keeps the password client-side only long enough to send it.

import { useState } from "react";

export default function BypassForm() {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/maintenance/bypass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        // cookie is set; drop into the site
        window.location.href = "/";
        return;
      }
      setError(data.error || "Something went wrong. Please try again.");
      setBusy(false);
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4">
      <label htmlFor="maint-pass" className="sr-only">
        Bypass password
      </label>
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <input
            id="maint-pass"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Bypass password"
            className="w-full rounded-md border border-white/25 bg-white/10 px-3.5 py-2.5 pr-10 text-sm text-white placeholder-white/50 outline-none focus:border-white/60 focus:ring-2 focus:ring-white/30"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-white/60 transition hover:text-white"
          >
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        <button
          type="submit"
          disabled={busy || !password}
          className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-[#14608a] shadow-sm transition hover:bg-[#eaf7fe] disabled:opacity-50"
        >
          {busy ? "Checking..." : "Enter"}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-sm font-medium text-[#ffd7d7]" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.4M6.6 6.6A13.3 13.3 0 0 0 2 12s3.5 7 10 7a9 9 0 0 0 3.4-.66M1 1l22 22" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
