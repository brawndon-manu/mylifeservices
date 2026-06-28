"use client";

// tiny copy-to-clipboard button. used for the meeting passcode + link.
import { useState } from "react";

export default function CopyButton({ text, label = "Copy", className }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard blocked - ignore
        }
      }}
      className={className}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
