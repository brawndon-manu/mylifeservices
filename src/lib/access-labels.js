// WHAT A LINE IN THE ACCESS LOG CALLS A RECORD. the kind first, then whose it
// is, then the period: "Signed timesheet · <their name> · Sep 1 – 15, 2026".
// every route that writes to the log builds its label through here, so the
// Access log page reads one way. a person served goes by initials here too.
//
// dependency-free so the node tests can pin it.
import { periodRange } from "./document-dates.js";
import { clientInitials } from "./initials.js";

export { periodRange, clientInitials };

// the parts that are there, joined with " · ". a part can be `cond && "text"`,
// so false and null drop out along with empty strings
export function accessLabel(...parts) {
  return parts
    .filter(Boolean)
    .map((p) => String(p).trim())
    .filter(Boolean)
    .join(" · ");
}

// WHEN A LINE HAS NO LABEL - the rows from before labels existed, and a stored
// file nobody could be matched to - its target still says what kind of record
// it was: a stored file's folder, or the key a route writes for a document it
// builds on the spot. most specific first.
const KINDS = [
  [/^timesheets\/signed\//, "Signed timesheet"],
  [/^timesheets\/approved\//, "Approved timesheet"],
  [/^timesheets\/sheet\/[^/]+\/report$/, "Hours and penalties report"],
  [/^timesheets\/sheet\//, "Timesheet"],
  [/^timesheets\/(source|schedule|rests|notes|clock|src|service-notes|schedule-notes|payroll)\//, "QSP export"],
  [/^timesheets\/[^/]+\/(download|download-zip)$/, "Timesheet batch"],
  [/^timesheets\//, "Payroll report"],
  [/^day-program\//, "Day Program export"],
  [/^clock-amendments\/[^/]+\/dsn\.pdf$/, "Addendum service notes"],
  [/^clock-amendments\/.*signature\.png$/, "Addendum signature"],
  [/^clock-amendments\//, "Clock addendum"],
  [/^client-attestations\/signed\//, "Signed client attestation"],
  [/^client-attestations\/[^/]+\/(download|download-pdf)$/, "Client attestations"],
  [/^client-attestations\/[^/]+\/source$/, "QSP client schedules"],
  [/^client-attestations\//, "Client attestation"],
  [/^form-submissions\//, "Signed form"],
  [/^form-email-imports\//, "Emailed acknowledgment"],
  [/^form-records\//, "Form records"],
  [/^certificates\/templates\//, "Certificate template"],
  [/^certificates\/(batch|run)\//, "Certificates"],
  [/^certificates\//, "Certificate"],
  [/^applications\//, "Application résumé"],
  [/^audit\//, "Audit report"],
  [/^acknowledgments\//, "Acknowledgment records"],
  [/^meeting-attendance\//, "Meeting attendance"],
  [/^satisfaction\//, "Satisfaction survey"],
];

export function kindOfTarget(target) {
  const t = String(target || "");
  const hit = KINDS.find(([re]) => re.test(t));
  return hit ? hit[1] : "Record";
}

// the line's words: its own label, or the kind its target says
export function lineLabel(row) {
  return row?.label || kindOfTarget(row?.target);
}
