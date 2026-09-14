// HOW A CERTIFICATE SAYS A DATE. On its own, with no imports at all,
// because both the browser and the renderer need it and the renderer
// reads font files off disk.

// THE DATE AS A CERTIFICATE SAYS IT. The picker hands over an ISO string
// ("2026-09-13") because that is unambiguous to store and to sort; nobody
// prints a date that way. Read as California's calendar day rather than as an
// instant, so a date never slides to the day before on a server in another
// zone.
export function printedDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  // anything already typed as words or slashes is left exactly as it is
  if (!m) return raw;
  const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(at);
}
