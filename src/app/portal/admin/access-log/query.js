// THE ACCESS LOG'S FILTERS, shared by the page and its CSV so the file is
// always the list on the screen.
import { COMPANY_TZ } from "@/lib/company-time";

export const PAGE_SIZE = 50;

export const RANGES = [
  { key: "today", label: "Today", phrase: "today" },
  { key: "7d", label: "Last 7 days", phrase: "in the last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", phrase: "in the last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", phrase: "in the last 90 days", days: 90 },
  { key: "all", label: "Since the log began", phrase: "since the log began" },
];

export const RESULTS = [
  { key: "", label: "Opened and refused" },
  { key: "open", label: "Opened" },
  { key: "denied", label: "Refused" },
];

// what each kind covers, by the start of a line's target: a stored file's
// folder, or the key a route writes for a document it builds on the spot
export const KINDS = [
  { key: "", label: "All records", prefixes: [] },
  { key: "timesheets", label: "Timesheets and payroll", prefixes: ["timesheets/", "day-program/"] },
  { key: "attestations", label: "Client attestations", prefixes: ["client-attestations/"] },
  { key: "addenda", label: "Clock addenda", prefixes: ["clock-amendments/"] },
  { key: "forms", label: "Forms", prefixes: ["form-submissions/", "form-email-imports/", "form-records/"] },
  { key: "certificates", label: "Certificates", prefixes: ["certificates/"] },
  { key: "applications", label: "Applications", prefixes: ["applications/"] },
  { key: "audit", label: "Audits", prefixes: ["audit/"] },
  { key: "company", label: "Acknowledgments and meetings", prefixes: ["acknowledgments/", "meeting-attendance/"] },
  { key: "surveys", label: "Satisfaction surveys", prefixes: ["satisfaction/"] },
];

const one = (list, key, fallback) => list.find((x) => x.key === key) || list.find((x) => x.key === fallback);

export function readFilters(sp = {}) {
  const q = String(sp.q || "").trim().slice(0, 80);
  const page = Math.max(0, Math.min(1000, Number.parseInt(sp.page, 10) || 0));
  return {
    q,
    kind: one(KINDS, String(sp.kind || ""), ""),
    result: one(RESULTS, String(sp.result || ""), ""),
    range: one(RANGES, String(sp.range || "7d"), "7d"),
    page,
  };
}

// the query string for a link that keeps these filters (the pager, the CSV)
export function filterQuery(f, extra = {}) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.kind.key) p.set("kind", f.kind.key);
  if (f.result.key) p.set("result", f.result.key);
  if (f.range.key !== "7d") p.set("range", f.range.key);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

// `peopleIds`: the accounts whose name matched the search, looked up by the caller
export function logWhere(f, now = new Date(), peopleIds = []) {
  const and = [];
  const since = rangeStart(f.range, now);
  if (since) and.push({ at: { gte: since } });
  if (f.result.key) and.push({ action: f.result.key });
  if (f.kind.prefixes.length) and.push({ OR: f.kind.prefixes.map((p) => ({ target: { startsWith: p } })) });
  if (f.q) {
    and.push({
      OR: [
        { userEmail: { contains: f.q, mode: "insensitive" } },
        { label: { contains: f.q, mode: "insensitive" } },
        { target: { contains: f.q } },
        ...(peopleIds.length ? [{ userId: { in: peopleIds } }] : []),
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

export function rangeStart(range, now = new Date()) {
  if (range.key === "today") return companyMidnight(now);
  if (range.days) return new Date(now.getTime() - range.days * 86400000);
  return null;
}

// midnight where the company is, as an instant: today's, or the first of this
// month's. the offset is read at `now`, which is right every day but the two a
// year the clocks move
export function companyMidnight(now = new Date(), { monthStart = false } = {}) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: COMPANY_TZ,
      year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offset = wall - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(+p.year, +p.month - 1, monthStart ? 1 : +p.day) - offset);
}

// "Chrome on Android" out of a user agent, for the line under a refusal
export function deviceOf(ua) {
  const s = String(ua || "");
  if (!s) return "";
  const browser = /Edg\//.test(s) ? "Edge"
    : /OPR\/|Opera/.test(s) ? "Opera"
      : /Firefox\//.test(s) ? "Firefox"
        : /Chrome\/|CriOS\//.test(s) ? "Chrome"
          : /Safari\//.test(s) ? "Safari"
            : "";
  const os = /iPhone/.test(s) ? "iPhone"
    : /iPad/.test(s) ? "iPad"
      : /Android/.test(s) ? "Android"
        : /Windows/.test(s) ? "Windows"
          : /Mac OS X|Macintosh/.test(s) ? "Mac"
            : /Linux/.test(s) ? "Linux"
              : "";
  if (browser && os) return `${browser} on ${os}`;
  return browser || os || "Unknown device";
}

// "Emailed link" for anything that came through a link in an email
export const howOf = (via) => (via === "session" ? "Portal" : "Emailed link");
