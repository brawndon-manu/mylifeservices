import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated } from "@/lib/roles";
import {
  categoryLabel,
  categoryChip,
  NL_STATUS_LABELS,
  NL_STATUS_CHIP,
  formatDate,
} from "@/lib/newsletter";
import ConfirmButton from "@/components/ConfirmButton";
import { deleteItem } from "./actions";

export const metadata = {
  title: "Newsletter · MLS Portal",
  robots: { index: false, follow: false },
};

export default async function NewsletterPortalPage({ searchParams }) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const elevated = isElevated(user.role);

  // the current user's own submissions, newest first
  const mine = await prisma.newsletterItem.findMany({
    where: { submittedById: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // reviewers: how many are waiting in the queue
  const pendingCount = elevated
    ? await prisma.newsletterItem.count({ where: { status: "SUBMITTED" } })
    : 0;

  const banner =
    params?.submitted === "1"
      ? "Thanks! Your item was submitted for review."
      : params?.deleted === "1"
        ? "Item deleted."
        : null;

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
            This Week in My Life Services
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Newsletter
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Share a highlight or a heads-up. Submissions are reviewed by
            management before they go on the public{" "}
            <Link href="/this-week" className="text-brand underline-offset-2 hover:underline">
              This Week
            </Link>{" "}
            page.
          </p>
        </div>
        <Link
          href="/portal/newsletter/new"
          className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          + Submit an item
        </Link>
      </div>

      {banner && (
        <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {banner}
        </div>
      )}

      {elevated && (
        <Link
          href="/portal/newsletter/review"
          className="mt-6 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-light"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Review queue
            </p>
            <p className="text-xs text-slate-600">
              Approve, reject, and publish submissions to the public page.
            </p>
          </div>
          <span className="flex items-center gap-2">
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                {pendingCount} pending
              </span>
            )}
            <span aria-hidden className="text-slate-400">
              →
            </span>
          </span>
        </Link>
      )}

      <h2 className="mt-10 text-lg font-semibold tracking-tight text-slate-900">
        Your submissions
      </h2>
      <div className="mt-4 space-y-3">
        {mine.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            You haven&apos;t submitted anything yet.
          </div>
        ) : (
          mine.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${categoryChip(item.category)}`}
                    >
                      {categoryLabel(item.category)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${NL_STATUS_CHIP[item.status]}`}
                    >
                      {NL_STATUS_LABELS[item.status]}
                    </span>
                  </div>
                  <h3 className="mt-2 font-semibold text-slate-900">
                    {item.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                    {item.body}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Submitted {formatDate(item.createdAt)}
                  </p>
                  {item.status === "REJECTED" && item.reviewNote && (
                    <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800">
                      <span className="font-semibold">Reviewer note:</span>{" "}
                      {item.reviewNote}
                    </p>
                  )}
                </div>
                {(item.status !== "PUBLISHED" || elevated) && (
                  <form action={deleteItem.bind(null, item.id)}>
                    <ConfirmButton
                      message="Delete this submission? This can't be undone."
                      className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                    >
                      Delete
                    </ConfirmButton>
                  </form>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
