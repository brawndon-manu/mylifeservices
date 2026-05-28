import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated } from "@/lib/roles";
import { RESOURCE_NOTES_MAX } from "@/lib/contacts";
import ConfirmButton from "@/components/ConfirmButton";
import { approveResource, rejectResource, deleteResource } from "../../actions";

export const metadata = {
  title: "Resource review · MLS Portal",
  robots: { index: false, follow: false },
};

export default async function ResourceReviewPage() {
  const user = await getCurrentUser();
  if (!isElevated(user.role)) redirect("/portal/contacts");

  const pending = await prisma.resource.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { submittedBy: { select: { name: true, email: true } } },
  });

  return (
    <section className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <Link
        href="/portal/contacts"
        className="text-sm font-medium text-slate-600 transition hover:text-brand"
      >
        ← Back to Team Contacts
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        Resource review
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Approve a resource to add it to the directory, or reject it.
      </p>

      <div className="mt-8 space-y-4">
        {pending.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
            Nothing waiting for review.
          </div>
        ) : (
          pending.map((r) => (
            <article
              key={r.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-slate-900">{r.name}</h2>
                {r.category && (
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">
                    {r.category}
                  </span>
                )}
              </div>
              {r.notes && (
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  {r.notes}
                </p>
              )}
              <div className="mt-2 space-y-0.5 text-sm text-slate-700">
                {r.phone && <p>{r.phone}</p>}
                {r.email && <p>{r.email}</p>}
                {r.website && <p className="truncate">{r.website}</p>}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Suggested by {r.submittedBy?.name || r.submittedBy?.email}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                <form action={approveResource.bind(null, r.id)}>
                  <button
                    type="submit"
                    className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                  >
                    Approve
                  </button>
                </form>
                <form
                  action={rejectResource.bind(null, r.id)}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    name="note"
                    maxLength={RESOURCE_NOTES_MAX}
                    placeholder="Reason (optional)"
                    className="w-40 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                  >
                    Reject
                  </button>
                </form>
                <form action={deleteResource.bind(null, r.id)} className="ml-auto">
                  <ConfirmButton
                    message="Delete this suggestion?"
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                  >
                    Delete
                  </ConfirmButton>
                </form>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
