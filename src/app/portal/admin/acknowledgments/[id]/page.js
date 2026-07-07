import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { preferredName } from "@/lib/contacts";
import BackLink from "@/components/BackLink";
import { ackAudienceWhere, isCompanyMeeting } from "@/lib/announcements";
import {
  buildAckRoster,
  audienceLabel,
  firstLine,
  fmtPosted,
  tagCls,
} from "../roster";
import AckBreakdown from "../_components/AckBreakdown";

export const metadata = {
  title: "Acknowledgments",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function Stat({ tone, label, value }) {
  const valCls = tone === "na" ? "text-faint" : "text-foreground";
  return (
    <span className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted">
      {label} <b className={`font-semibold ${valCls}`}>{value}</b>
    </span>
  );
}

export default async function AcknowledgmentDetailPage({ params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  // read-receipts are sensitive - Admin/IT/Super only.
  if (!isAdminUp(user?.role)) {
    redirect("/portal");
  }

  const p = await prisma.announcement.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      content: true,
      tag: true,
      deletedAt: true,
      publishedAt: true,
      requireAck: true,
      ackEveryone: true,
      ackTitles: true,
      ackUserIds: true,
      acks: { select: { userId: true, viaEmail: true, createdAt: true } },
    },
  });
  if (!p || p.deletedAt || !p.publishedAt || !p.requireAck || isCompanyMeeting(p.tag)) {
    notFound();
  }

  const [audienceUsers, allActive] = await Promise.all([
    prisma.user.findMany({
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
    }),
    prisma.user.findMany({
      where: { deactivatedAt: null },
      select: {
        id: true,
        name: true,
        preferredFirstName: true,
        preferredLastName: true,
        title: true,
        image: true,
      },
      orderBy: [{ preferredFirstName: "asc" }, { name: "asc" }],
    }),
  ]);

  const r = buildAckRoster(p, audienceUsers);

  const audIds = new Set(audienceUsers.map((u) => u.id));
  const inviteeCandidates = allActive
    .filter((u) => !audIds.has(u.id))
    .map((u) => ({ id: u.id, displayName: preferredName(u), title: u.title || "", image: u.image || null }));
  const addedInvitees = audienceUsers
    .filter((u) => (p.ackUserIds || []).includes(u.id))
    .map((u) => ({ id: u.id, displayName: preferredName(u) }));

  const full = r.notYet === 0 && r.expected > 0;

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink href="/portal/admin/acknowledgments">Back to acknowledgments</BackLink>
        <Link
          href={`/portal/announcements/${p.id}?from=ackDetail`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
        >
          View announcement →
        </Link>
      </div>

      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Acknowledgments
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {p.title || firstLine(p.content)}
        </h1>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tagCls(p.tag)}`}>
          {p.tag}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted">
        {p.publishedAt && <>Posted {fmtPosted(p.publishedAt)} · </>}
        audience: {audienceLabel(p, r.expected)}
      </p>

      <div className="mt-5 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted">Acknowledged</span>
          <span className="font-semibold text-foreground">
            {r.acked} / {r.expected} · {r.pct}%
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full border border-border bg-background">
          <div
            className={`h-full rounded-full ${full ? "bg-emerald-500" : "bg-brand-light"}`}
            style={{ width: `${r.pct}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Stat label="in portal" value={r.inPortal} />
          <Stat label="via email" value={r.viaEmail} />
          <Stat tone="na" label="Not yet" value={r.notYet} />
        </div>
      </div>

      <AckBreakdown p={{ id: p.id, people: r.people, inviteeCandidates, addedInvitees }} />
    </section>
  );
}
