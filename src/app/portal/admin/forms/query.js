// the form-submissions filter set, shared by the admin page and its CSV
// download so the file always matches what the screen shows.

import { preferredName } from "@/lib/contacts";
import { officeFromSearch } from "@/lib/positions";
import { fmtStamp } from "../acknowledgments/audit";

// one submission as report-row facts: resolved person (or the typed claim),
// how it got attributed, and the Pacific timestamp. shared by the PDF reports
// and the signed-document bundles so every download names people the same way.
export function submissionRow(s) {
  return {
    who: s.user ? preferredName(s.user) : s.submitterName,
    email: s.user ? s.user.email || "" : s.submitterEmail,
    how: ATTRIBUTION_LABELS[s.attribution] || s.attribution,
    when: fmtStamp(s.createdAt),
    asTyped: !s.user,
  };
}

// how a submission got tied to a person, as words
export const ATTRIBUTION_LABELS = {
  "signed-in": "signed in",
  "email-match": "email match",
  assigned: "assigned",
  unassigned: "needs assignment",
};

export const PERIODS = {
  "30": "Last 30 days",
  "90": "Last 90 days",
  year: "This year",
  all: "All time",
};

function periodStart(period) {
  const now = new Date();
  if (period === "30") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (period === "90") return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  if (period === "year") return new Date(now.getFullYear(), 0, 1);
  return null;
}

// normalize raw searchParams into the filters
export function readFilters(sp) {
  return {
    form: typeof sp?.form === "string" ? sp.form : "",
    status: typeof sp?.status === "string" ? sp.status : "all",
    period: typeof sp?.period === "string" && PERIODS[sp.period] ? sp.period : "all",
    q: typeof sp?.q === "string" ? sp.q.trim() : "",
    office: officeFromSearch(sp),
  };
}

// the prisma `where` for one filter set. an office narrows to submissions
// attributed to that office's staff - unassigned ones have no person, so no
// office, and only show unfiltered.
export function submissionWhere({ form, status, period, q, office }) {
  const where = {};
  if (form) where.formId = form;
  if (office) where.user = { offices: { has: office } };
  if (status === "unassigned") where.attribution = "unassigned";
  else if (status === "attributed") where.attribution = { in: ["signed-in", "email-match", "assigned"] };
  const since = periodStart(period);
  if (since) where.createdAt = { gte: since };
  if (q) {
    where.OR = [
      { submitterName: { contains: q, mode: "insensitive" } },
      { submitterEmail: { contains: q, mode: "insensitive" } },
      { user: { name: { contains: q, mode: "insensitive" } } },
      { user: { preferredFirstName: { contains: q, mode: "insensitive" } } },
      { user: { preferredLastName: { contains: q, mode: "insensitive" } } },
    ];
  }
  return where;
}
