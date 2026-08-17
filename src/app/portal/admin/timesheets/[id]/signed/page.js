import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { companyDate } from "@/lib/company-time";
import BackLink from "@/components/BackLink";

// THE RECORD OF WHAT HAS COME BACK. Mánu 2026-08-17: "we need a place to
// download all the signed and reviewed timesheets me or gabe sign off on."
// The files were already stored on the row - signedPdfUrl, approvedPdfUrl,
// signedName, signedIp, signedAt - and there was nowhere to browse them.
//
// This screen lists only what is signed. The chasing of everybody else lives
// on the review page; a person with nothing signed has nothing here, and the
// quiet line at the bottom says so rather than leaving an absence to explain
// itself.
//
// The downloads go through the gated sheet route (`?copy=signed|approved`),
// not the blob urls - Blob is a public store and its urls never reach the
// browser, same rule as every other stored document here.

export async function generateMetadata({ params }) {
  const { id } = await params;
  const b = await prisma.timesheetBatch.findUnique({
    where: { id },
    select: { periodFrom: true, periodTo: true },
  });
  return {
    title: b ? `Signed timesheets ${b.periodFrom} to ${b.periodTo}` : "Signed timesheets",
    robots: { index: false, follow: false },
  };
}
export const dynamic = "force-dynamic";

const when = (d) =>
  companyDate(d, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Divider({ children }) {
  return (
    <p className="mb-2.5 mt-6 text-[11px] font-bold uppercase tracking-wider text-faint">
      {children}
    </p>
  );
}

function Sheet({ r }) {
  return (
    <div className="card-lift mb-2.5 grid items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_auto]">
      <div>
        <p className="text-[15px] font-bold">{r.displayName}</p>
        {r.displayName !== r.sourceName && (
          <p className="mt-0.5 font-mono text-[11.5px] text-faint">QSP: {r.sourceName}</p>
        )}
      </div>
      <div className="text-[12.5px] text-muted">
        <p>
          Signed <strong className="font-semibold text-foreground">{when(r.signedAt)}</strong>
          {r.signedName ? (
            <> by <strong className="font-semibold text-foreground">{r.signedName}</strong></>
          ) : null}
          {r.signedIp ? (
            <span className="font-mono text-[11px] text-faint"> &middot; {r.signedIp}</span>
          ) : null}
        </p>
        <p className="mt-1">
          {r.approvedAt ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-700/60 bg-emerald-950/40 px-2.5 py-0.5 text-[11.5px] font-bold text-emerald-700 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Signed off
              {r.approvedBy ? <> &middot; {preferredName(r.approvedBy)}</> : null}
              , {when(r.approvedAt)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-700/60 bg-amber-950/40 px-2.5 py-0.5 text-[11.5px] font-bold text-amber-700 dark:text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Awaiting sign-off
            </span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {r.signedPdfUrl && (
          <a
            href={`/portal/admin/timesheets/sheet/${r.id}/download?copy=signed`}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-semibold transition hover:border-brand hover:text-brand"
          >
            Signed PDF
          </a>
        )}
        {r.approvedAt && r.approvedPdfUrl ? (
          <a
            href={`/portal/admin/timesheets/sheet/${r.id}/download?copy=approved`}
            className="rounded-md border border-brand bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand transition hover:bg-brand/20"
          >
            Approved PDF
          </a>
        ) : !r.approvedAt ? (
          <Link
            href={`/portal/admin/timesheets/sheet/${r.id}/approve`}
            className="rounded-md border border-brand bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand transition hover:bg-brand/20"
          >
            Review &amp; sign off
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default async function SignedTimesheetsPage({ params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    select: {
      id: true,
      periodFrom: true,
      periodTo: true,
      _count: { select: { timesheets: true } },
      timesheets: {
        where: { signedAt: { not: null } },
        orderBy: { signedAt: "asc" },
        select: {
          id: true,
          sourceName: true,
          signedAt: true,
          signedName: true,
          signedIp: true,
          signedPdfUrl: true,
          approvedAt: true,
          approvedPdfUrl: true,
          approvedBy: {
            select: { name: true, preferredFirstName: true, preferredLastName: true },
          },
          user: {
            select: { name: true, preferredFirstName: true, preferredLastName: true },
          },
        },
      },
    },
  });
  if (!batch) notFound();

  const total = batch._count.timesheets;
  const rows = batch.timesheets.map((t) => ({
    ...t,
    displayName: t.user ? preferredName(t.user) : t.sourceName,
  }));
  const approved = rows.filter((r) => r.approvedAt);
  const awaiting = rows.filter((r) => !r.approvedAt);
  const unsigned = total - rows.length;

  return (
    <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <BackLink href={`/portal/admin/timesheets/${batch.id}`}>Back to the pay period</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Pay period {batch.periodFrom} to {batch.periodTo}
      </p>
      <h1 className="mt-1 text-2xl font-bold">Signed timesheets</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Every timesheet that has come back signed, who signed it and when, and
        whether management has signed off. The files here are the stored copies -
        the exact bytes each person signed.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xl font-bold">
              {rows.length} of {total} signed &middot; {approved.length} signed off
            </p>
            <p className="mt-1 text-xs text-muted">
              Sign-off is the management half: a signed sheet management has
              reviewed and approved.
            </p>
          </div>
          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`/portal/admin/timesheets/${batch.id}/download`}
                className="rounded-md border border-brand bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand transition hover:bg-brand/20"
              >
                All signed as one PDF
              </a>
              <a
                href={`/portal/admin/timesheets/${batch.id}/download-zip`}
                className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-semibold transition hover:border-brand hover:text-brand"
              >
                All signed separately (.zip)
              </a>
            </div>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          Nothing has come back signed yet. Once somebody signs, their sheet
          appears here with its stored copy.
        </p>
      ) : (
        <>
          {approved.length > 0 && (
            <>
              <Divider>Signed and signed off &middot; {approved.length}</Divider>
              {approved.map((r) => <Sheet key={r.id} r={r} />)}
            </>
          )}
          {awaiting.length > 0 && (
            <>
              <Divider>Signed, awaiting sign-off &middot; {awaiting.length}</Divider>
              {awaiting.map((r) => <Sheet key={r.id} r={r} />)}
            </>
          )}
        </>
      )}

      {unsigned > 0 && (
        <p className="mt-5 text-[12.5px] text-faint">
          {unsigned} {unsigned === 1 ? "person has" : "people have"} not signed
          yet, so there is nothing of theirs to show here. The review page is
          where the chasing happens; this screen is the record of what has come
          back.
        </p>
      )}
    </section>
  );
}
