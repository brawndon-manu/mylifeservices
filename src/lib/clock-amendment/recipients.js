// WHO THE APPROVED DOCUMENT GOES TO. The office, written down rather than typed
// at the screen, for the same reason the payroll bundle's list is: these are
// named people in a fixed line, and a free text box is how a signed record
// reaches the wrong inbox. The staff member is added per document.
//
// CLOCK_AMENDMENT_TO overrides the list: a comma-separated set of addresses,
// so the two people not on the payroll line can be added without a deploy.
// Unset, it is the payroll line.
//
// import-free apart from the payroll constants, which are import-free
// themselves, so the test runner can load this directly
import { BUNDLE_TO, BUNDLE_CC } from "../timesheet/payroll-bundle.js";

const splitList = (s) =>
  String(s || "")
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter((x) => x.includes("@"));

export function officeRecipients(env = process.env) {
  const configured = splitList(env.CLOCK_AMENDMENT_TO);
  if (configured.length) return configured;
  return [BUNDLE_TO.email, ...BUNDLE_CC.map((c) => c.email)];
}
