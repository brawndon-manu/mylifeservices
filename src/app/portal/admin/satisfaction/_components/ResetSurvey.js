"use client";

// TAKE A FILED SURVEY OFF THE RECORD so it can be filled again. Rendered only
// for admin and up - the server refuses everyone else regardless - and it
// confirms first, because this is a delete with a person's answers on it.
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResetSurvey({ reportId, who, when, action }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const go = async () => {
    if (!window.confirm(`This deletes the survey ${who} filed ${when}. It cannot be undone.`)) return;
    setError(null);
    setBusy(true);
    try {
      const res = await action(reportId);
      if (res?.ok) router.refresh();
      else setError("That survey could not be reset.");
    } catch {
      setError("That survey could not be reset.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={go}
        className="text-sm font-medium text-rose-600 transition hover:text-rose-700 dark:text-rose-400 disabled:opacity-50"
      >
        {busy ? "Resetting..." : "Reset survey"}
      </button>
      {error && <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</span>}
    </span>
  );
}
