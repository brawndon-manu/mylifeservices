import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated } from "@/lib/roles";
import { submitResource } from "../../actions";
import ResourceForm from "@/app/portal/resources/ResourceForm";

export const metadata = {
  title: "Add resource · MLS Portal",
  robots: { index: false, follow: false },
};

const ERRORS = {
  name: "Please give the resource a name.",
};

export default async function NewResourcePage({ searchParams }) {
  const params = await searchParams;
  const errorMessage = params?.error ? ERRORS[params.error] : null;
  const user = await getCurrentUser();
  const elevated = isElevated(user.role);

  // existing names/cities for the non-blocking duplicate warning.
  const existing = await prisma.resource.findMany({
    where: { status: { not: "REJECTED" } },
    select: { name: true, city: true },
  });

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <Link
        href="/portal/resources"
        className="text-sm font-medium text-slate-600 transition hover:text-brand"
      >
        ← Back to Resources
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        Add a resource
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        A community partner or service the team uses, like a housing provider,
        food bank, or clinic.{" "}
        {elevated
          ? "As management, yours is added right away."
          : "Management reviews it before it shows on the directory."}
      </p>

      {errorMessage && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          {errorMessage}
        </div>
      )}

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <ResourceForm
          action={submitResource}
          mode="create"
          existing={existing}
          submitLabel={elevated ? "Add resource" : "Submit for review"}
        />
      </div>
    </section>
  );
}
