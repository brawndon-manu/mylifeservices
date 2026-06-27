import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated } from "@/lib/roles";
import { notifConfig, timeAgo } from "@/lib/notifications";
import { openNotification, toggleRead, markAllRead } from "./actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // oversight-only for now (the four events are all things they act on).
  if (!isElevated(user.role)) redirect("/portal");

  const sp = await searchParams;
  const unreadOnly = sp?.filter === "unread";

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id, ...(unreadOnly ? { read: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
  ]);

  const tabClass = (active) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold transition ${
      active ? "bg-foreground text-background" : "border border-border text-muted hover:text-brand"
    }`;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
        {unreadCount > 0 && (
          <form action={markAllRead}>
            <button type="submit" className="text-sm font-semibold text-brand hover:underline">
              Mark all read
            </button>
          </form>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">
        Activity that needs your attention.
      </p>

      <div className="mt-4 flex gap-2">
        <Link href="/portal/notifications" className={tabClass(!unreadOnly)}>
          All
        </Link>
        <Link href="/portal/notifications?filter=unread" className={tabClass(unreadOnly)}>
          Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}
        </Link>
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        {items.length === 0 && (
          <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
            {unreadOnly ? "Nothing unread." : "No notifications yet."}
          </p>
        )}
        {items.map((n) => {
          const cfg = notifConfig(n.type);
          return (
            <div key={n.id} className="flex items-stretch gap-1.5">
              <form action={openNotification} className="min-w-0 flex-1">
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="link" value={n.link ?? ""} />
                <button
                  type="submit"
                  className={`flex h-full w-full items-start gap-3 rounded-lg rounded-r-none border border-r-0 border-l-4 border-border ${cfg.accent} bg-surface px-4 py-3.5 text-left transition hover:border-brand ${
                    n.read ? "opacity-70" : ""
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 flex-none rounded-full ${
                      n.read ? "bg-transparent" : cfg.dot
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${cfg.chip}`}>
                        {cfg.label}
                      </span>
                      <span className={`text-foreground ${n.read ? "" : "font-semibold"}`}>
                        {n.title}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm text-muted">{n.body}</span>
                  </span>
                  <span className="flex-none whitespace-nowrap text-xs text-muted">
                    {timeAgo(n.createdAt)}
                  </span>
                </button>
              </form>
              <form action={toggleRead} className="flex">
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="filter" value={unreadOnly ? "unread" : ""} />
                <button
                  type="submit"
                  title={n.read ? "Mark as unread" : "Mark as read"}
                  aria-label={n.read ? "Mark as unread" : "Mark as read"}
                  className="flex items-center rounded-lg rounded-l-none border border-l-0 border-border bg-surface px-3 text-muted transition hover:border-brand hover:text-brand"
                >
                  {n.read ? (
                    // filled dot - click to mark unread again
                    <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
                  ) : (
                    // check - click to mark read
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </main>
  );
}
