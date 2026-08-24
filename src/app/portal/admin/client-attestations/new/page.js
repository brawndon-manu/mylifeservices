import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { canManageClientAttestations } from "@/lib/roles";
import BackLink from "@/components/BackLink";
import { uploadClientSchedules } from "../actions";
import UploadForm from "./UploadForm";

export const metadata = {
  title: "Upload client schedules",
  robots: { index: false, follow: false },
};

const ERRORS = {
  nofile: "Pick the QSP Client Schedules export first.",
  notpdf: "That needs to be the PDF export from QSP.",
  parse:
    "Couldn't read that PDF. It needs to be the Client Schedules export from QSP - one calendar page per client - and the download rather than a print-to-PDF or a scan.",
  empty:
    "No client schedules were found in that file. Every page of the export starts with \"Client: <name>\" above the month, and nothing in this one does. Is it the right report?",
  months:
    "That export covers more than one month, so a client would appear more than once and each form would say a different thing. Pull one month at a time.",
  noblob:
    "File storage isn't configured (BLOB_READ_WRITE_TOKEN is missing), so the generated forms couldn't be saved. Nothing was created.",
};

export default async function NewClientAttestationBatchPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!canManageClientAttestations(user?.role)) redirect("/portal");
  const sp = await searchParams;
  const error = sp?.error ? ERRORS[sp.error] || "Something went wrong." : null;
  const why = typeof sp?.why === "string" ? sp.why : null;

  return (
    <section className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin/client-attestations">
        Back to Client attestations
      </BackLink>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
        Upload this month&apos;s client schedules
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted">
        In QSP, pull <b className="text-foreground">Client Schedules</b> for the
        whole month with every client selected, and save the download. It comes
        out as one calendar page per client.
      </p>

      {error && (
        <div className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-500/40 dark:bg-rose-950/30">
          <p className="text-sm font-medium text-rose-900 dark:text-rose-200">
            {error}
          </p>
          {why && (
            <p className="mt-1 text-sm text-rose-800 dark:text-rose-300">{why}</p>
          )}
        </div>
      )}

      <UploadForm action={uploadClientSchedules} />

    </section>
  );
}
