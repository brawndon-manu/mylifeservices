import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated } from "@/lib/roles";
import { updateResource } from "@/app/portal/contacts/actions";
import ResourceForm from "../../ResourceForm";

export const metadata = {
  title: "Edit resource · MLS Portal",
  robots: { index: false, follow: false },
};

const ERRORS = {
  name: "Please give the resource a name.",
};

export default async function EditResourcePage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!isElevated(user.role)) redirect("/portal/resources?error=forbidden");

  const resource = await prisma.resource.findUnique({ where: { id } });
  if (!resource) notFound();

  const errorMessage = sp?.error ? ERRORS[sp.error] : null;

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <Link
        href={`/portal/resources/${id}`}
        className="text-sm font-medium text-slate-600 transition hover:text-brand"
      >
        ← Back to resource
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        Edit resource
      </h1>
      <p className="mt-2 text-sm text-slate-600">{resource.name}</p>

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
          action={updateResource.bind(null, id)}
          mode="edit"
          defaults={resource}
          submitLabel="Save changes"
        />
      </div>
    </section>
  );
}
