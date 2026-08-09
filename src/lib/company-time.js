// Dates on wage documents are read in ONE timezone: the company's.
//
// THE BUG THIS EXISTS FOR, found 2026-08-09 by opening the same page in two
// places at once. A batch uploaded at 05:35 UTC showed as "Aug 7" on the
// deployed site and "Aug 6" on a dev server, from the same database row. There
// are three different answers available and the code was picking whichever came
// to hand:
//
//   server timezone   toLocaleDateString on the server. UTC on Vercel, Pacific
//                     on a machine here. Same row, two answers.
//   viewer timezone   the same call inside a client component, which runs in the
//                     browser. A third answer, and it follows whoever is looking.
//   COMPANY timezone  what a pay period actually means. MLS runs in Orange, CA,
//                     the workweek is Mon-Sun Pacific, and a shift that began on
//                     the 6th began on the 6th no matter who opens the page.
//
// Only the third is right for anything payroll touches, so it is pinned here
// rather than left to the runtime. This is deliberately NOT what meeting-time.js
// does: a meeting is one instant everybody attends from their own timezone, and
// showing it in the viewer's zone is correct there. A pay period is not an
// instant, it is a business fact in California.
//
// Pure, and Intl exists in node and the browser, so this is safe to import from
// either side.

export const COMPANY_TZ = "America/Los_Angeles";

const DEFAULT = { month: "short", day: "numeric", year: "numeric" };

// null in, null out - callers render dates that may not have happened yet
// (nothing signed, nothing approved) and a literal "Invalid Date" on a wage
// document is worse than a blank.
export function companyDate(value, opts = DEFAULT) {
  const d = toDate(value);
  if (!d) return null;
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: COMPANY_TZ }).format(d);
}

export function companyDateTime(value, opts = {}) {
  return companyDate(value, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
    ...opts,
  });
}

function toDate(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
