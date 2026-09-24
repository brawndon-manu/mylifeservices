"use client";

import { Analytics } from "@vercel/analytics/next";
import { redactUrl } from "@/lib/analytics-redact";

// vercel analytics, minus the keys in emailed links - see analytics-redact.js.
// its own client component because the rewrite is a function, and a function
// can't cross from the server layout into a client component as a prop.
export default function SafeAnalytics() {
  return <Analytics beforeSend={(event) => ({ ...event, url: redactUrl(event.url) })} />;
}
