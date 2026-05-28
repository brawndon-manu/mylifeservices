"use client";

import { useEffect, useState } from "react";
import { ROLE_LABELS } from "@/lib/roles";

// shows the signed-in employee's display name + role next to the brand
// in the public header. fetched client-side from the Auth.js session
// endpoint so the brochure pages stay static (the badge just hydrates
// in after load). renders nothing when signed out.
export default function AuthBadge() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active) setUser(data?.user ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!user || (!user.name && !user.email)) return null;

  return (
    <span className="hidden items-center gap-2 border-l border-slate-200 pl-3 text-sm sm:inline-flex">
      <span className="font-medium text-slate-700">
        {user.name || user.email}
      </span>
      {user.role && (
        <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-brand">
          {ROLE_LABELS[user.role] ?? user.role}
        </span>
      )}
    </span>
  );
}
