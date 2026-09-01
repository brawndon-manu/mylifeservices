"use client";

// Renders inside the saved banner and nowhere else: reaching here means the
// survey row is confirmed in the database, so this browser's draft of it has
// served its purpose. Clearing on the CONFIRMATION rather than on the save
// click is the point - a save that dies in transit leaves the answers behind.
import { useEffect } from "react";

export default function ClearDraft({ clientId }) {
  useEffect(() => {
    try {
      localStorage.removeItem(`mls-survey-draft:${clientId}`);
    } catch {
      // storage unavailable - nothing to clear
    }
  }, [clientId]);
  return null;
}
