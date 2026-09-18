import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import BackLink from "@/components/BackLink";
import NewAmendmentForm from "./NewAmendmentForm";
import { searchPeople, createAmendment } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "New clock amendment", robots: { index: false, follow: false } };

export default async function NewClockAmendmentPage() {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  return (
    <section className="mx-auto max-w-3xl px-6 py-10">
      <BackLink href="/portal/admin/clock-amendments">Back to Clock amendments</BackLink>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">New amendment</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        Raise this when somebody tells you they could not clock in or out. Everything you fill in
        here is printed on the form, so the person who worked the shift confirms it rather than
        writing it out from memory a fortnight later.
      </p>

      <NewAmendmentForm search={searchPeople} create={createAmendment} />
    </section>
  );
}
