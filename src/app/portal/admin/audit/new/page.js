import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import BackLink from "@/components/BackLink";
import { uploadServiceNotes } from "../actions";
import UploadForm from "./UploadForm";

export const metadata = { title: "Upload service notes", robots: { index: false, follow: false } };

const ERRORS = {
  nofile: "Pick the Employee Detailed Daily Service Notes export first.",
  notpdf: "That needs to be the PDF export from QSP.",
  parse:
    "Couldn't read that PDF. It needs to be the Employee Detailed Daily Service Notes export from QSP, and the download rather than a print-to-PDF or a scan.",
  empty:
    "No daily service notes were found in that file. Every note starts with the writer's name above the words \"Daily Service Note\", and nothing in this one does. Is it the right report?",
  unstorable:
    "That export carries a character the database will not accept, so nothing was saved.",
};

export default async function NewServiceNotesPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");
  const sp = await searchParams;
  const error = sp?.error ? ERRORS[sp.error] || "Something went wrong." : null;
  const why = typeof sp?.why === "string" ? sp.why : null;

  return (
    <section className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin/audit">Back to Audit</BackLink>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
        Upload service notes
      </h1>
      <p className="mt-3 text-base leading-relaxed text-muted">
        The Employee Detailed Daily Service Notes export from QSP, over whatever range you want to
        review. Each note carries the shift it was written for, so the range does not have to line
        up with a pay period.
      </p>

      {error && (
        <p className="mt-6 rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
          {why ? ` (${why})` : ""}
        </p>
      )}

      <UploadForm action={uploadServiceNotes} />
    </section>
  );
}
