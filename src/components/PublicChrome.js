"use client";

// renders the public brochure header/footer everywhere EXCEPT the employee
// portal (which has its own header) and the maintenance page (which is a
// full-screen standalone splash, no nav + "Get in touch" footer).
//
// `hideOnTimesheet` is for the FOOTER instance: the timesheet review page
// keeps a minimal header (Header trims itself there) but has no business
// ending in "Get in touch" - the page's own flag link is the contact path,
// and the footer's invitation reads like a second door.
import { usePathname } from "next/navigation";
import { isTimesheetPath, isAmendmentPath } from "@/lib/timesheet-contact";

export default function PublicChrome({ children, hideOnTimesheet = false }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/portal") || pathname === "/maintenance") return null;
  // the clock amendment form is signed on a phone from an emailed link, the
  // same way the timesheet is, and ends in a signature, not "Get in touch"
  if (hideOnTimesheet && (isTimesheetPath(pathname) || isAmendmentPath(pathname))) return null;
  return children;
}
