import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import BackLink from "@/components/BackLink";
import ImportForm from "./ImportForm";
import { previewEmailImport, saveEmailImport } from "./actions";

export const metadata = {
  title: "Record an email sign-off",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EmailImportPage() {
  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) redirect("/portal");

  return (
    <section className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin/forms">Back to Form submissions</BackLink>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
        Record an email sign-off
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
        For notices that went out before the portal held them. Attach what was
        sent and Gmail&apos;s print of the thread, and each reply becomes a
        document against that notice with the name the person used and the time
        they replied.
      </p>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        A reply nobody can be confident about is recorded and left unassigned
        rather than guessed at, and assigned by hand afterwards on the
        notice&apos;s own page.
      </p>

      <ImportForm preview={previewEmailImport} save={saveEmailImport} />
    </section>
  );
}
