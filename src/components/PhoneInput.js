"use client";

// drop-in <input> for phone numbers that formats live as you type:
// 5626862548 -> (562) 686-2548. uncontrolled (no react state) so it works
// the same in server-rendered forms - it just rewrites its own value on
// each input event. server-side cleanPhone/formatUSPhone still validate on
// save. pass the usual input props (name, id, className, required, etc).
import { formatPhoneLive } from "@/lib/contacts";

export default function PhoneInput({ defaultValue = "", ...props }) {
  return (
    <input
      {...props}
      type="tel"
      inputMode="tel"
      defaultValue={formatPhoneLive(defaultValue)}
      onInput={(e) => {
        e.currentTarget.value = formatPhoneLive(e.currentTarget.value);
      }}
    />
  );
}
