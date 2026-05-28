import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated, isIT } from "@/lib/roles";
import {
  typeLabel,
  typeChip,
  statusLabel,
  statusChip,
  STATUS_SORT,
  timeAgo,
} from "@/lib/feedback";
import AuthorChip from "../hub/_components/AuthorChip";
import ConfirmButton from "@/components/ConfirmButton";
import { setFeedbackStatus, deleteFeedback } from "./actions";

export const metadata = {
  title: "Suggestions & Bugs · MLS Portal",
  robots: { index: false, follow: false },
};

export default async function FeedbackPage({ searchParams }) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const elevated = isElevated(user.role);
  const it = isIT(user.role);

  const items = await prisma.feedbackItem.findMany({
    // discarded items are only visible to IT - everyone else just sees
    // open / in-progress / complete.
    where: it ? undefined : { status: { not: "DECLINED" } },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { id: true, name: true, role: true, email: true } },
      resolvedBy: { select: { name: true } },
    },
    take: 100,
  });

  // active items (open / in progress) float to the top, closed sink.
  items.sort(
    (a, b) => (STATUS_SORT[a.status] ?? 9) - (STATUS_SORT[b.status] ?? 9),
  );

  const banner =
    params?.submitted === "1"
      ? "Thanks! Your item was posted to the board."
      : params?.deleted === "1"
        ? "Item deleted."
        : null;

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-600">
            Internal board
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Suggestions &amp; Bugs
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Spot something broken or have an idea to improve the portal or
            the way we work? Post it here. IT and management track each item
            until it&apos;s resolved.
          </p>
        </div>
        <Link
          href="/portal/feedback/new"
          className="rounded-md bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
        >
          + Post an item
        </Link>
      </div>

      {banner && (
        <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {banner}
        </div>
      )}

      <div className="mt-8 space-y-4">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
            Nothing posted yet. Be the first to share a suggestion or report
            a bug.
          </div>
        ) : (
          items.map((item) => {
            const canDelete = item.authorId === user.id || elevated;
            const closed = item.status === "RESOLVED" || item.status === "DECLINED";
            return (
              <article
                key={item.id}
                className={`rounded-xl border bg-white p-5 shadow-sm ${
                  closed ? "border-slate-200 opacity-75" : "border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${typeChip(item.type)}`}
                  >
                    {typeLabel(item.type)}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusChip(item.status)}`}
                  >
                    {statusLabel(item.status)}
                  </span>
                </div>

                <h2 className="mt-3 text-lg font-semibold text-slate-900">
                  {item.title}
                </h2>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {item.body}
                </p>

                {item.imageUrl && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                    <Image
                      src={item.imageUrl}
                      alt=""
                      width={1200}
                      height={800}
                      unoptimized
                      className="h-auto w-full object-cover"
                    />
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <AuthorChip author={item.author} size="sm" />
                  <span>· {timeAgo(item.createdAt)}</span>
                  {closed && item.resolvedBy && (
                    <span>· closed by {item.resolvedBy.name}</span>
                  )}
                </div>

                {/* action row */}
                {(elevated || canDelete) && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                    {elevated && (
                      <StatusButtons
                        itemId={item.id}
                        current={item.status}
                        it={it}
                      />
                    )}
                    {canDelete && (
                      <form
                        action={deleteFeedback.bind(null, item.id)}
                        className="ml-auto"
                      >
                        <ConfirmButton
                          message="Delete this item? This can't be undone."
                          className="rounded-md px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                        >
                          Delete
                        </ConfirmButton>
                      </form>
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

// status controls. In progress / Complete / Reopen are management
// actions (any elevated role). Discard is IT-only and only rendered for
// IT - it pulls the item off everyone else's board. each action is
// styled to match what it does.
function StatusButtons({ itemId, current, it }) {
  const actions = [
    {
      value: "IN_PROGRESS",
      label: "In progress",
      className: "bg-amber-100 text-amber-800 hover:bg-amber-200",
    },
    {
      value: "RESOLVED",
      label: "Complete",
      className: "bg-emerald-600 text-white hover:bg-emerald-700",
    },
    {
      value: "OPEN",
      label: "Reopen",
      className: "border border-slate-300 text-slate-600 hover:bg-slate-50",
    },
    // IT-only - subtle muted text button so it doesnt compete with the
    // primary actions.
    {
      value: "DECLINED",
      label: "Discard",
      itOnly: true,
      className: "text-slate-400 hover:text-slate-600 hover:bg-slate-50",
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions
        .filter((a) => a.value !== current && (!a.itOnly || it))
        .map((a) => (
          <form
            key={a.value}
            action={setFeedbackStatus.bind(null, itemId, a.value)}
          >
            <button
              type="submit"
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${a.className}`}
            >
              {a.label}
            </button>
          </form>
        ))}
    </div>
  );
}
