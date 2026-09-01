import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageClientAttestations, isAdminUp } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import BackLink from "@/components/BackLink";
import SurveyForm from "../_components/SurveyForm";
import ResetSurvey from "../_components/ResetSurvey";
import { submitSatisfactionSurvey, resetSatisfactionSurvey } from "../actions";
import {
  SATISFACTION_KIND,
  TITLE,
  answeredCount,
  ANSWERABLE_COUNT,
  completedByLabel,
  completingTally,
  completingOptionOpen,
  COMPLETING_OPTIONS,
} from "@/lib/client-reports/satisfaction";

export const metadata = {
  title: "Fill out survey",
  robots: { index: false, follow: false },
};

// ONE CLIENT'S SURVEY, ASKED ON SCREEN. The person conducting it reads the
// questions out - on the phone or across a table - and ticks what they hear.
// Saving stores the answers; the PDF is rendered from them on demand.
const ERRORS = {
  novoice: "The survey wasn't saved. Pick who completed it first.",
  capped:
    "The survey wasn't saved. That completing person already has their survey on file for this client.",
};

export default async function FillSurveyPage({ params, searchParams }) {
  const user = await getCurrentUser();
  if (!canManageClientAttestations(user?.role)) redirect("/portal");

  const { clientId } = await params;
  const sp = await searchParams;
  const error = sp?.error ? ERRORS[sp.error] || "Something went wrong." : null;
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      clientKey: true,
      caseWorkerName: true,
      staffUser: {
        select: { name: true, preferredFirstName: true, preferredLastName: true },
      },
    },
  });
  if (!client) redirect("/portal/admin/satisfaction?error=noclient");

  const prior = await prisma.clientReport.findMany({
    where: { kind: SATISFACTION_KIND, clientKey: client.clientKey },
    orderBy: { createdAt: "desc" },
    select: { id: true, conductedByName: true, createdAt: true, answers: true },
  });

  const staff = client.staffUser ? preferredName(client.staffUser) : client.caseWorkerName || "";
  const fmtDay = (d) =>
    new Date(d).toLocaleDateString("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  // the Date field defaults to the day the survey is being conducted
  const todayIso = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });

  // one survey per completing person, two for Other - the form greys out what
  // is already on file, and when every option is taken there is nothing left
  // to ask, so the form itself stays off the page
  const tally = completingTally(prior.map((r) => r.answers));
  const anyOpen = COMPLETING_OPTIONS.some((o) => completingOptionOpen(o, tally));

  return (
    <section className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin/satisfaction">Back to Annual satisfaction survey</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        {TITLE}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {client.name}
      </h1>
      <p className="mt-2 text-base text-muted">
        Assigned staff: <span className="font-medium text-foreground">{staff || "—"}</span>
      </p>

      {error && (
        <div className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-500/40 dark:bg-rose-950/30">
          <p className="text-sm font-medium text-rose-900 dark:text-rose-200">{error}</p>
        </div>
      )}

      {prior.length > 0 && (
        <div className="mt-6 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-foreground">Already on file</h2>
          <ul className="mt-2 space-y-1.5">
            {prior.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="text-foreground">
                  {fmtDay(r.createdAt)}
                  {completedByLabel(r.answers) && ` · ${completedByLabel(r.answers)}`}
                </span>
                <span className="text-muted">
                  {r.conductedByName} · {answeredCount(r.answers)} of {ANSWERABLE_COUNT} answered
                </span>
                <Link
                  href={`/portal/admin/satisfaction/report/${r.id}/pdf`}
                  target="_blank"
                  className="font-medium text-brand transition hover:text-brand-dark"
                >
                  PDF
                </Link>
                {/* admin and up only - the server refuses everyone else too */}
                {isAdminUp(user?.role) && (
                  <ResetSurvey
                    reportId={r.id}
                    who={r.conductedByName}
                    when={fmtDay(r.createdAt)}
                    action={resetSatisfactionSurvey}
                  />
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Saving below adds a new survey. The ones already on file stay as they are.
          </p>
        </div>
      )}

      {anyOpen ? (
        <SurveyForm
          clientId={client.id}
          todayIso={todayIso}
          action={submitSatisfactionSurvey}
          tally={tally}
        />
      ) : (
        <div className="mt-8 rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-muted">
            Every completing person already has their survey on file for this
            client.
          </p>
        </div>
      )}
    </section>
  );
}
