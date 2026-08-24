"use client";

// THE EMAIL-ME-AS-SLOTS-ARE-PICKED SWITCH, on the roster panel where the picks
// it reports on are counted.
import { useState, useTransition } from "react";

export default function SlotAlertsToggle({ on, action }) {
  const [checked, setChecked] = useState(on);
  const [pending, start] = useTransition();
  return (
    <label
      className="flex cursor-pointer items-center gap-2 rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-muted transition hover:text-foreground"
      title="Each new slot pick emails the author and whoever posted on their behalf"
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setChecked(next);
          start(() => action(next));
        }}
        className="h-3.5 w-3.5 accent-brand"
      />
      Email on new picks
    </label>
  );
}
