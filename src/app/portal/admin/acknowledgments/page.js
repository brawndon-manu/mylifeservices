import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import BackLink from "@/components/BackLink";
import { ackAudienceWhere, COMPANY_MEETING_TAG } from "@/lib/announcements";
import {
  buildAckRoster,
  audienceLabel,
  firstLine,
  fmtPosted,
  tagCls,
} from "./roster";
import AckBoard from "./_components/AckBoard";
import OfficeFilter from "@/components/OfficeFilter";
import { officeFromSearch } from "@/lib/positions";

export const metadata = {
  title: "Acknowledgments",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AcknowledgmentsPage({ searchParams }) {
  const user = await getCurrentUser();
  // read-receipts are sensitive (who has / hasn't) - Admin/IT/Super only, same
  // gate as each announcement's detail-page roster.
  if (!isAdminUp(user?.role)) {
    redirect("/portal");
  }
  const office = officeFromSearch(await searchParams);
  const officeQs = office ? `?office=${office}` : "";

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
        where: {
          ...ackAudienceWhere(p),
          ...(office ? { offices: { has: office } } : {}),
        },
        select: {
          id: true,
          name: true,
          preferredFirstName: true,
          preferredLastName: true,
          title: true,
          image: true,
        },
        orderBy: [{ preferredFirstName: "asc" }, { name: "asc" }],
      });
      const r = buildAckRoster(p, audienceUsers);
      return {
        id: p.id,
        title: p.title || firstLine(p.content),
        tag: p.tag,
        tagCls: tagCls(p.tag),
        dateLabel: p.publishedAt ? fmtPosted(p.publishedAt) : null,
        audience: audienceLabel(p, r.expected),
        expected: r.expected,
        acked: r.acked,
        notYetCount: r.notYet,
        pct: r.pct,
        summary: r.summary,
      };
    }),
  );

  const done = posts.filter((p) => p.expected > 0 && p.notYetCount === 0).length;
  const avg = posts.length
    ? Math.round(posts.reduce((s, p) => s + p.pct, 0) / posts.length)
    : 0;

  return (
    <section className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink href="/portal/admin">Back to admin dashboard</BackLink>
        {/* file downloads, not pages - Link would try to client-navigate */}
        <div className="flex items-center gap-2">
          <a
            href={`/portal/admin/acknowledgments/csv${officeQs}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            Download CSV
          </a>
          <a
            href={`/portal/admin/acknowledgments/pdf${officeQs}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            Download report PDF
          </a>
        </div>
      </div>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Admin
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Acknowledgments
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
        Every announcement that asked staff to acknowledge, with who&apos;s done it
        and who hasn&apos;t. Click one to open the full list and nudge the
        stragglers by email.
      </p>

      <OfficeFilter basePath="/portal/admin/acknowledgments" current={office} />

      <AckBoard posts={posts} counts={{ total: posts.length, done, avg }} officeQs={officeQs} />
    </section>
  );
}
