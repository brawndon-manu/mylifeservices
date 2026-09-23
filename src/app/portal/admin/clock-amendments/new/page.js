import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import BackLink from "@/components/BackLink";
import RaiseFromFiles from "./RaiseFromFiles";
import { searchPeople, readDayFilesAction, raiseAmendments } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "New clock addendum", robots: { index: false, follow: false } };

export default async function NewClockAmendmentPage() {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  return (
    <section className="mx-auto max-w-3xl px-6 py-10">
      <BackLink href="/portal/admin/clock-amendments">Back to Clock addenda</BackLink>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">New addendum</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        Somebody told you the clock got their shift wrong: a punch missing, a clock-in later than they
        arrived, or no location on it. Upload that day&apos;s clock export and service notes, take down
        what they said under their shift, and send them the form to confirm and sign.
      </p>

      <RaiseFromFiles read={readDayFilesAction} raise={raiseAmendments} search={searchPeople} />
    </section>
  );
}
