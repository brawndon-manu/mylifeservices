import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated } from "@/lib/roles";
import {
  categoryLabel,
  categoryChip,
  NL_STATUS_LABELS,
  NL_STATUS_CHIP,
  NL_NOTE_MAX,
  formatDate,
} from "@/lib/newsletter";
import ConfirmButton from "@/components/ConfirmButton";
import {
  approveItem,
  rejectItem,
  publishItem,
  unpublishItem,
  deleteItem,
} from "../actions";

export const metadata = {
  title: "Newsletter review · MLS Portal",
  robots: { index: false, follow: false },
};

// order the queue so the work-to-do floats up: pending first, then
// approved (waiting to publish), then published, then rejected.
const STATUS_ORDER = { SUBMITTED: 0, APPROVED: 1, PUBLISHED: 2, REJECTED: 3 };

export default async function NewsletterReviewPage() {
  const user = await getCurrentUser();
  if (!isElevated(user.role)) {
    redirect("/portal/newsletter");
  }

  const items = await prisma.newsletterItem.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      submittedBy: { select: { name: true, email: true } },
      approvedBy: { select: { name: true } },
      publishedBy: { select: { name: true } },
    },
    take: 100,
  });

  items.sort(
    (a, b) =>
      (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
  );

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <Link
        href="/portal/newsletter"
        className="text-sm font-medium text-muted transition hover:text-brand"
      >
        ← Back to Newsletter
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Review queue
      </h1>
      <p className="mt-2 text-sm text-muted">
        Approve a submission, then publish it to push it live on the public{" "}
        <Link href="/this-week" className="text-brand underline-offset-2 hover:underline">
          This Week
        </Link>{" "}
        page.
      </p>

      <div className="mt-8 space-y-4">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-strong bg-surface p-10 text-center text-sm text-muted">
            Nothing submitted yet.
          </div>
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-border bg-surface p-5 shadow-sm"
            >
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
                {item.eventDate && (
                  <span className="text-xs text-muted">
                    {formatDate(item.eventDate)}
                  </span>
                )}
              </div>

              <h2 className="mt-3 text-lg font-semibold text-foreground">
                {item.title}
              </h2>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted">
                {item.body}
              </p>

              {item.imageUrl && (
                <div className="mt-3 overflow-hidden rounded-lg border border-border">
                  <Image
                    src={item.imageUrl}
                    alt=""
                    width={1200}
                    height={800}
                    unoptimized
                    className="h-auto w-full object-cover"
                  />
                  <p className="bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {item.consentConfirmed
                      ? "✓ Submitter confirmed written consent is on file for anyone pictured."
                      : "⚠ No consent confirmation on file: verify before publishing."}
                  </p>
                </div>
              )}

              <p className="mt-3 text-xs text-muted">
                Submitted by {item.submittedBy?.name || item.submittedBy?.email}{" "}
                · {formatDate(item.createdAt)}
                {item.approvedBy && <> · approved by {item.approvedBy.name}</>}
                {item.publishedBy && <> · published by {item.publishedBy.name}</>}
              </p>

              {item.status === "REJECTED" && item.reviewNote && (
                <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  <span className="font-semibold">Note:</span> {item.reviewNote}
                </p>
              )}

              {/* action row depends on status */}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                {item.status === "SUBMITTED" && (
                  <>
                    <form action={approveItem.bind(null, item.id)}>
                      <button
                        type="submit"
                        className="rounded-md bg-brand-light px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand"
                      >
                        Approve
                      </button>
                    </form>
                    <RejectForm itemId={item.id} />
                  </>
                )}

                {item.status === "APPROVED" && (
                  <>
                    <form action={publishItem.bind(null, item.id)}>
                      <button
                        type="submit"
                        className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                      >
                        Publish to push live
                      </button>
                    </form>
                    <RejectForm itemId={item.id} label="Send back / reject" />
                  </>
                )}

                {item.status === "PUBLISHED" && (
                  <form action={unpublishItem.bind(null, item.id)}>
                    <button
                      type="submit"
                      className="rounded-md border border-border-strong px-4 py-1.5 text-sm font-medium text-muted transition hover:bg-surface-2"
                    >
                      Unpublish
                    </button>
                  </form>
                )}

                {item.status === "REJECTED" && (
                  <form action={approveItem.bind(null, item.id)}>
                    <button
                      type="submit"
                      className="rounded-md border border-border-strong px-4 py-1.5 text-sm font-medium text-muted transition hover:bg-surface-2"
                    >
                      Reconsider and approve
                    </button>
                  </form>
                )}

                <form action={deleteItem.bind(null, item.id)} className="ml-auto">
                  <ConfirmButton
                    message="Delete this item? This can't be undone."
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

// small inline reject form with an optional note back to the submitter.
function RejectForm({ itemId, label = "Reject" }) {
  return (
    <form
      action={rejectItem.bind(null, itemId)}
      className="flex items-center gap-2"
    >
      <input
        type="text"
        name="note"
        maxLength={NL_NOTE_MAX}
        placeholder="Reason (optional)"
        className="w-40 rounded-md border border-border-strong px-2 py-1.5 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:w-48"
      />
      <button
        type="submit"
        className="rounded-md border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
      >
        {label}
      </button>
    </form>
  );
}
