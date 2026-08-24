import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageClientAttestations } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { companyDate } from "@/lib/company-time";
import BackLink from "@/components/BackLink";
import { attestationSendMode } from "@/lib/timesheet-mode";
import SendButton from "../_components/SendButton";
import SendPanel from "../_components/SendPanel";
import PaperSignButton from "../_components/PaperSignButton";
import {
  sendAttestationOne,
  sendAttestations,
  recordPaperSignature,
} from "../actions";

export const metadata = {
  title: "Client attestations",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// THE REVIEW SCREEN: every client on the month, what their form says, and who is
// going to collect the signature.
export default async function ClientAttestationBatchPage({ params, searchParams }) {
  const user = await getCurrentUser();
  if (!canManageClientAttestations(user?.role)) redirect("/portal");
  const { id } = await params;
  const sp = await searchParams;
  const show = typeof sp?.show === "string" ? sp.show : "all";

  const batch = await prisma.clientAttestationBatch.findUnique({
    where: { id },
    include: {
      uploadedBy: {
        select: { name: true, preferredFirstName: true, preferredLastName: true },
      },
      attestations: {
        orderBy: { clientName: "asc" },
        include: {
          staffUser: {
            select: { id: true, name: true, preferredFirstName: true, preferredLastName: true },
          },
          supervisor: {
            select: { id: true, name: true, preferredFirstName: true, preferredLastName: true },
          },
        },
      },
    },
  });
  if (!batch) notFound();

  const rows = batch.attestations;
  const counts = {
    all: rows.length,
    unrouted: rows.filter((a) => !a.supervisorUserId).length,
    signed: rows.filter((a) => a.signedAt).length,
    unsigned: rows.filter((a) => !a.signedAt).length,
  };
  const mode = attestationSendMode();
  const sendCounts = {
    all: counts.all,
    unsigned: counts.unsigned,
    unrouted: counts.unrouted,
    unsent: rows.filter((a) => !a.signedAt && !a.sentAt).length,
  };

  const shown =
    show === "unrouted"
      ? rows.filter((a) => !a.supervisorUserId)
      : show === "signed"
        ? rows.filter((a) => a.signedAt)
        : show === "unsigned"
          ? rows.filter((a) => !a.signedAt)
          : rows;

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin/client-attestations">
        Back to Client attestations
      </BackLink>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {batch.monthLabel}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {counts.all} clients · uploaded {companyDate(batch.createdAt)} by{" "}
            {preferredName(batch.uploadedBy) || "someone"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/portal/admin/client-attestations/${batch.id}/download-pdf`}
            className="rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface-2"
          >
            One PDF to print
          </a>
          <a
            href={`/portal/admin/client-attestations/${batch.id}/download`}
            className="rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface-2"
          >
            Download all forms (.zip)
          </a>
          <Link
            href={`/portal/admin/client-attestations/${batch.id}/caseloads`}
            className="rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface-2"
          >
            By caseload
          </Link>
          <a
            href={`/portal/admin/client-attestations/${batch.id}/source`}
            className="rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface-2"
          >
            The QSP export
          </a>
        </div>
      </div>

      {/* WHERE MAIL FROM THIS SCREEN ACTUALLY GOES. Test mode is the default
          and the review screen says so plainly - the alternative is somebody
          working it out from an environment variable. */}
      {!mode.live && (
        <div className="mt-6 rounded-xl border border-emerald-400/50 bg-emerald-50 p-4 dark:border-emerald-400/30 dark:bg-emerald-950/30">
          <p className="text-sm text-emerald-900 dark:text-emerald-200">
            Test mode. Every send from this page goes to{" "}
            {mode.recipients.join(", ")} - nothing reaches anyone else.
          </p>
        </div>
      )}

      <SendPanel
        counts={sendCounts}
        action={sendAttestations.bind(null, batch.id)}
      />

      <div className="mt-6 flex flex-wrap gap-2">
        <Filter id={batch.id} k="all" now={show} label="All" n={counts.all} />
        <Filter id={batch.id} k="unrouted" now={show} label="No supervisor" n={counts.unrouted} />
        <Filter id={batch.id} k="unsigned" now={show} label="Not signed" n={counts.unsigned} />
        <Filter id={batch.id} k="signed" now={show} label="Signed" n={counts.signed} />
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-border bg-surface-2">
            <tr className="text-xs font-semibold uppercase tracking-wide text-faint">
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Assigned staff</th>
              <th className="px-4 py-3 text-right">Visits</th>
              <th className="px-4 py-3 text-right">Hours</th>
              <th className="px-4 py-3">Supervisor</th>
              <th className="px-4 py-3">Sent</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Form</th>
              <th className="px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-foreground">
                  {a.clientName}
                  <span className="ml-2 text-xs font-normal text-faint">
                    p{a.sourcePage}
                  </span>
                  {a.staffNames.length > 0 && (
                    <span className="block text-xs font-normal text-faint">
                      On the schedule: {a.staffNames.join(", ")}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">
                  {a.staffUser ? preferredName(a.staffUser) : a.caseWorker || "-"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted">
                  {a.entryCount}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted">
                  {a.scheduledHours.toFixed(2)}
                </td>
                <td className="px-4 py-3">
                  {a.supervisor ? (
                    <span className="text-foreground">{preferredName(a.supervisor)}</span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400">
                      Not assigned
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">
                  {a.sentAt ? (
                    <span title={a.intendedEmail || ""}>
                      {companyDate(a.sentAt)}
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-3">
                  {a.signedAt ? (
                    <Chip tone="ok">Signed {companyDate(a.signedAt)}</Chip>
                  ) : a.clientSignedAt ? (
                    <Chip tone="mid">Client signed · supervisor next</Chip>
                  ) : (
                    <Chip>Not signed</Chip>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {a.formUrl || a.signedPdfUrl ? (
                    <a
                      href={`/portal/admin/client-attestations/${batch.id}/form/${a.id}`}
                      className="font-semibold text-brand hover:underline"
                    >
                      {a.signedPdfUrl ? "Signed copy" : "Download"}
                    </a>
                  ) : (
                    <span className="text-rose-700 dark:text-rose-400">Failed</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {!a.signedAt && (
                    <div className="flex items-center justify-end gap-1.5">
                      {a.formUrl && (
                        <SendButton
                          attestation={{
                            id: a.id,
                            clientName: a.clientName,
                            sentAt: a.sentAt ? a.sentAt.toISOString() : null,
                            supervisorName: a.supervisor ? preferredName(a.supervisor) : null,
                            staffName: a.staffUser ? preferredName(a.staffUser) : null,
                          }}
                          testInbox={mode.live ? null : mode.recipients.join(", ")}
                          action={sendAttestationOne}
                        />
                      )}
                      <PaperSignButton
                        attestation={{ id: a.id, clientName: a.clientName }}
                        action={recordPaperSignature}
                      />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {counts.unrouted > 0 && (
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted">
          {counts.unrouted} of {counts.all}{" "}clients have no field
          supervisor. A client&apos;s supervisor is whoever supervises their
          assigned staff, set on the Caseloads page.
        </p>
      )}
    </section>
  );
}

function Filter({ id, k, now, label, n }) {
  const active = now === k;
  return (
    <Link
      href={`/portal/admin/client-attestations/${id}?show=${k}`}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-brand text-white"
          : "border border-border-strong bg-surface text-muted hover:bg-surface-2"
      }`}
    >
      {label} <span className="tabular-nums">{n}</span>
    </Link>
  );
}

function Chip({ children, tone }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        tone === "ok"
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : tone === "mid"
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
            : "bg-surface-2 text-muted"
      }`}
    >
      {children}
    </span>
  );
}
