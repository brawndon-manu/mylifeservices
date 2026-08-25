// shared CSV plumbing for the admin report downloads.

// excel treats a leading = + - @ as a formula, so anything user-supplied gets
// a leading apostrophe before it goes in a cell.
export function cell(v) {
  const s = String(v ?? "");
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// BOM so Excel opens it as UTF-8 and doesn't mangle accented names
export function csvResponse(lines, filename) {
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
