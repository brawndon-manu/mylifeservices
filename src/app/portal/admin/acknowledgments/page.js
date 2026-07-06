import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { preferredName } from "@/lib/contacts";
import BackLink from "@/components/BackLink";
import { ackAudienceWhere, ANNOUNCEMENT_TAG_STYLES, COMPANY_MEETING_TAG } from "@/lib/announcements";
import AckBoard from "./_components/AckBoard";

export const metadata = {
  title: "Acknowledgments",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PACIFIC = "America/Los_Angeles";
const DEFAULT_TAG_CLS = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";

function fmtPosted(iso) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}
function fmtAck(iso) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function audienceLabel(p, expected) {
  if (p.ackEveryone || (!p.ackTitles?.length && !p.ackUserIds?.length)) {
    return `Everyone (${expected})`;
  }
  const bits = [...(p.ackTitles || [])];
  if (p.ackUserIds?.length) {
    bits.push(`${p.ackUserIds.length} ${p.ackUserIds.length === 1 ? "person" : "people"}`);
  }
  return `${bits.join(", ")} (${expected})`;
}

function firstLine(content) {
  const line = (content || "").split("\n").find((l) => l.trim()) || "Announcement";
  return line.length > 80 ? line.slice(0, 79) + "…" : line;
}

export default async function AcknowledgmentsPage() {
  const user = await getCurrentUser();
  // read-receipts are sensitive (who has / hasn't) - Admin/IT/Super only, same
  // gate as each announcement's detail-page roster.
  if (!isAdminUp(user?.role)) {
    redirect("/portal");
  }

  const rawPosts = await prisma.announcement.findMany({
    where: {
      requireAck: true,
      deletedAt: null,
      publishedAt: { not: null },
      tag: { not: COMPANY_MEETING_TAG },
    },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      title: true,
      content: true,
      tag: true,
      publishedAt: true,
      ackEveryone: true,
      ackTitles: true,
      ackUserIds: true,
      acks: { select: { userId: true, viaEmail: true, createdAt: true } },
    },
  });

  const posts = await Promise.all(
    rawPosts.map(async (p) => {
      const audienceUsers = await prisma.user.findMany({
        where: ackAudienceWhere(p),
        select: {
          id: true,
          name: true,
          preferredFirstName: true,
          preferredLastName: true,
          title: true,
          image: true,
          email: true,
          phone: true,
        },
        orderBy: [{ preferredFirstName: "asc" }, { name: "asc" }],
      });
      const ackByUser = new Map(p.acks.map((a) => [a.userId, a]));
      const people = audienceUsers.map((u) => {
        const a = ackByUser.get(u.id);
        return {
          id: u.id,
          displayName: preferredName(u),
          title: u.title || "",
          image: u.image || null,
          email: u.email || null,
          phone: u.phone || null,
          acked: !!a,
          viaEmail: a?.viaEmail || false,
          dateLabel: a ? fmtAck(a.createdAt) : null,
        };
      });
      const acked = people.filter((x) => x.acked).length;
      const viaEmail = people.filter((x) => x.acked && x.viaEmail).length;
      const expected = people.length;
      return {
        id: p.id,
        title: p.title || firstLine(p.content),
        tag: p.tag,
        tagCls: ANNOUNCEMENT_TAG_STYLES[p.tag] || DEFAULT_TAG_CLS,
        dateLabel: p.publishedAt ? fmtPosted(p.publishedAt) : null,
        audience: audienceLabel(p, expected),
        expected,
        acked,
        viaEmail,
        inPortal: acked - viaEmail,
        notYetCount: Math.max(0, expected - acked),
        pct: expected > 0 ? Math.round((acked / expected) * 100) : 0,
        people,
      };
    }),
  );

  const done = posts.filter((p) => p.expected > 0 && p.notYetCount === 0).length;
  const avg = posts.length
    ? Math.round(posts.reduce((s, p) => s + p.pct, 0) / posts.length)
    : 0;

  return (
    <section className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin">Back to admin dashboard</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Admin
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Acknowledgments
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
        Every announcement that asked staff to acknowledge, with who&apos;s done it
        and who hasn&apos;t. Expand one to see the people; open it to nudge the
        stragglers by email.
      </p>

      <AckBoard
        posts={posts}
        counts={{ total: posts.length, done, avg }}
      />
    </section>
  );
}
