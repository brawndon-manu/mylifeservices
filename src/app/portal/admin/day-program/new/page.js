import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import BackLink from "@/components/BackLink";
import { uploadDayProgramBatch } from "../actions";
import UploadForm from "./UploadForm";

export const metadata = { title: "Upload day program period", robots: { index: false, follow: false } };

const ERRORS = {
  notimesheet: "Pick the Simple Timesheet PDF first - hours come from it and nothing runs without it.",
  notpdf: "The timesheet needs to be the PDF export from QSP, not a scan or a print-to-PDF.",
  norests: "The Rest Periods Report (.xls) is required - it's the only systematic record that a rest break happened, and the second breaks are read out of its schedule notes.",
  parse: "Couldn't read one of those files. The message below says which reader gave up.",
  mileage:
    "That mileage report was refused, and nothing was created. Miles print on the sheet people sign and attest to, so a file matching nobody - or saying nobody drove all period - is far more likely to be the wrong export than the truth. Check it covers this period, then try again.",
  empty: "The timesheet read fine but held no employee hours. Is it the right export?",
  noblob:
    "File storage isn't configured (BLOB_READ_WRITE_TOKEN is missing), so nothing could be saved. Nothing was created.",
  blob:
    "File storage rejected the upload - the Blob token is probably expired. Run `vercel env pull .env.local` to refresh it, then try again. Nothing was created.",
  save:
    "The sheets could not be saved. Nothing was created: the batch and all of its sheets go in as one write, so a failure here leaves nothing behind to clean up.",
  future:
    "That export contains days that haven't happened yet. QSP prints scheduled shifts exactly like worked ones, so those would become sheets asking people to sign for time they haven't worked. Pull the period again once it has ended - or tick \"partial pay period\" below to drop the unworked days and keep what has been worked.",
  range: "That date range doesn't work: the start is after the end.",
  partial:
    "That correction was refused and nothing was written. The batch it was meant to land on is unchanged, and so is everybody on it - this is checked before any sheet is touched, so a refusal here never leaves half the people replaced. The reason is below.",
};

export default async function NewDayProgramBatchPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");
  const sp = await searchParams;
  const error = sp?.error ? ERRORS[sp.error] || "Something went wrong." : null;
  const why = typeof sp?.why === "string" ? sp.why : null;

  // a correction into the batch already out - loaded rather than trusted, so
  // the period is printed back before any file is picked, and an id that is
  // gone drops the screen back to an ordinary upload. Only a day program
  // batch may be corrected from here; the action refuses anything else too.
  const intoId = typeof sp?.into === "string" ? sp.into : null;
  const intoRow = intoId
    ? await prisma.timesheetBatch.findUnique({
      where: { id: intoId },
      select: { id: true, periodFrom: true, periodTo: true, program: true },
    })
    : null;
  const into = intoRow?.program === "DP" ? intoRow : null;

  return (
    <section className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin/day-program">Back to Day program</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">Admin</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
        Upload a day program period
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted">
        The same engine the MLS timesheets run on, fed from the day
        program&apos;s documents. Hours and overtime come from the QSP
        timesheet. Rest breaks come from the Rest Periods report, and the
        second breaks staff type into their own schedule notes are read
        straight off it - no spreadsheet to keep by hand. Miles come from the
        mileage export. Meals are exempt under the on-duty meal agreement, so
        no meal premium is ever computed here.
      </p>

      {error && (
        <div className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm leading-relaxed text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          <p>{error}</p>
          {why && <p className="mt-2 font-mono text-xs opacity-80">{why}</p>}
        </div>
      )}

      {/* WHAT A CORRECTION IS ABOUT TO DO, before the files are picked - the
          same words the MLS correcting screen carries, because the rule is
          the same rule. The people it replaces are the people in the export. */}
      {into && (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/30">
          <p className="font-semibold text-amber-900 dark:text-amber-200">
            Correcting {into.periodFrom} to {into.periodTo}, not creating a new upload.
          </p>
          <p className="mt-1 text-amber-800 dark:text-amber-300">
            Only the people in these exports are replaced. Everyone else keeps their sheet,
            their signature and the link already in their inbox. The people you do replace
            lose their signature and their answers, because their figures are changing, and
            go back out to be signed again.
          </p>
        </div>
      )}

      {/* the pickers, the partial box and the live panel live in the client
          form - the same animation the MLS upload has, fed by the action's own
          progress writes */}
      <UploadForm action={uploadDayProgramBatch} into={into?.id || null} />
    </section>
  );
}

