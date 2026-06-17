import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isIT } from "@/lib/roles";
import { updateResource, deleteResource } from "@/app/portal/contacts/actions";
import ConfirmButton from "@/components/ConfirmButton";
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
  if (!isIT(user.role)) redirect("/portal/resources?error=forbidden");

  const resource = await prisma.resource.findUnique({ where: { id } });
  if (!resource) notFound();

  const errorMessage = sp?.error ? ERRORS[sp.error] : null;

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <Link
        href={`/portal/resources/${id}`}
        className="text-sm font-medium text-muted transition hover:text-brand"
      >
        ← Back to resource
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Edit resource
      </h1>
      <p className="mt-2 text-sm text-muted">{resource.name}</p>

      {errorMessage && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          {errorMessage}
        </div>
      )}

      <div className="mt-8 rounded-xl border border-border bg-surface p-6 sm:p-8">
        <ResourceForm
          action={updateResource.bind(null, id)}
          mode="edit"
          defaults={resource}
          submitLabel="Save changes"
          cancelHref={`/portal/resources/${id}`}
        />
      </div>

      {/* danger zone: remove this resource entirely */}
      <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
        <div>
          <p className="text-sm font-semibold text-rose-900">Remove this resource</p>
          <p className="text-xs text-rose-700">This deletes it from the directory and the map. Can&rsquo;t be undone.</p>
        </div>
        <form action={deleteResource.bind(null, id)}>
          <ConfirmButton
            message="Remove this resource? This can't be undone."
            className="rounded-md border border-rose-300 bg-surface px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
          >
            Remove
          </ConfirmButton>
        </form>
      </div>
    </section>
  );
}
