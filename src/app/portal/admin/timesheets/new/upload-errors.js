// every way an upload can be refused, and what the screen says about it.
// Shared by the pay-period form and the Audit page's audit-copy form - the
// same action refuses both, so the words live once.
export const ERRORS = {
  nofile: "Pick the QSP export PDF first.",
  notpdf: "That needs to be the PDF export from QSP.",
  parse: "Couldn't read that PDF. Make sure it's the Simple Timesheet export, not a scan.",
  future:
    "That export contains days that haven't happened yet. QSP prints scheduled shifts exactly like worked ones, so those would become timesheets asking people to sign for time they haven't worked. Pull the period again once it has ended - or tick \"partial pay period\" below to drop the unworked days and keep what has been worked.",
  twoperiods:
    "That export covers more than one pay period, so every employee appears twice. QSP snaps to whole pay periods - asking for a range that crosses a boundary returns both of them. Request a single period.",
  empty: "No employee hours found in that file. Is it the right export?",
  range: "That date range doesn't work: the start is after the end.",
  punches:
    "The punch times in that timesheet don't add up to QSP's own totals printed beside them, which almost always means it's a print-to-PDF rather than the download. Printing merges two times into a single cell, so everything after the first punch of each pair never reaches us. The file itself is fine and complete - that's the problem, because every employee, every row and every daily total still look right, and the premium hours come out wrong anyway. Pull it again from Reports → Timesheets and save the download rather than printing. It's the SMALLER file, around 920KB against 4.9MB. Nothing was created.",
  noschedule:
    "The Employee Schedules export is required. It's what corroborates the days nobody clocked, and without it those premium hours have nothing behind them at all.",
  schedule:
    "That schedule export covers almost nobody on the timesheet. QSP can produce a single-employee schedule that looks like the full one - the 59-person export is around 479KB and a one-person export around 184KB, and the file names are identical. Re-export it from Scheduling with every employee selected. No batch and no timesheets were created, so nothing is on the list to clean up; the four files you picked were already stored, which is harmless. Without a schedule, meal periods can't be evidenced for the people it misses, and the premium total would come out far too low rather than obviously wrong.",
  norests:
    "The Rest Periods Report is required. It's the only thing that records whether a rest break was actually taken, and rest premiums are the bigger half of the total. Without it every qualifying day comes back unanswerable.",
  restparse:
    "Couldn't read that as the QSP Rest Periods Report. It needs to be the .xls straight from Reports → Rest Periods Report.",
  nopayroll:
    "The Simple Payroll Processing Report is required. It carries QSP's own regular and overtime totals per person, which is the only way to check the corrected sheets against what payroll already produced.",
  payrollparse:
    "Couldn't read that as the QSP Simple Payroll Processing Report. It needs to be the .xls straight from Reports → Payroll Reports → Simple Payroll Processing Report, not a re-saved copy.",
  noblob:
    "File storage isn't configured (BLOB_READ_WRITE_TOKEN is missing), so the generated timesheets couldn't be saved. Nothing was created.",
  blob:
    "File storage rejected the upload - the Blob token is probably expired. Run `vercel env pull .env.local` to refresh it, then try again. Nothing was created.",
  unstorable:
    "One of those exports carries a character the database will not store - a NUL or half a surrogate pair, both invisible in any viewer and both untouched by a trim. The people it affects are named below. This has happened once, on 08/15/26: a single NUL beside the print date in one person's footer. The timesheet PDF is cleaned of these as it is read, so a file reaching this message means it came off the schedule or one of the two .xls reports. Nothing was created - the upload is refused whole rather than landing everybody else and quietly dropping them.",
  partial:
    "That correction was refused and nothing was written. The batch it was meant to land on is unchanged, and so is everybody on it - this is checked before any sheet is touched, so a refusal here never leaves half the people replaced. The reason is below.",
  save:
    "The generated timesheets could not be saved. Nothing was created: the batch and all of its sheets go in as one write, so a failure here leaves nothing behind to clean up and nothing that could take the current upload read-only. Try again - if it fails the same way twice, the message below is the database's own.",
};
