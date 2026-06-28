"use client";

// shows a meeting's start instant in the VIEWER's own device timezone. renders
// the author's set zone on the server + first client paint (stable, no hydration
// mismatch), then snaps to the device zone after mount.
import { useState, useEffect } from "react";
import { formatInstant, deviceTimezone } from "@/lib/meeting-time";

export default function MeetingTime({ iso, setTz }) {
  const [text, setText] = useState(() =>
    formatInstant(iso, setTz || "America/Los_Angeles"),
  );
  useEffect(() => {
    setText(formatInstant(iso, deviceTimezone()));
  }, [iso]);
  return <span>{text}</span>;
}
