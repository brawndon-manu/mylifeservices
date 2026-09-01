import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageClientAttestations } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import BackLink from "@/components/BackLink";
import SurveyList from "./_components/SurveyList";
import { markClient } from "./actions";
import ClearDraft from "./_components/ClearDraft";
import {
  SATISFACTION_KIND,
  answeredCount,
  ANSWERABLE_COUNT,
  completedByLabel,
} from "@/lib/client-reports/satisfaction";

export const metadata = {
  title: "Annual satisfaction survey",
  robots: { index: false, follow: false },
};

// THE SURVEY DESK, 2026-08-31. Every MLS client with their assigned staff and
// where their annual satisfaction survey stands - filled through the portal,
// never on the document itself, and downloadable as the printed form.
//
// MLS ONLY FOR NOW, Mánu: "we will be focusing on the MLS list for now." The
// day program's ten roster rows are left off rather than shown un-fillable.
const isDayProgram = (office) => /\bDP\b|day program/i.test(office || "");

const ERRORS = {
  noclient: "That client isn't on the roster any more. Nothing was saved.",
};

export default async function SatisfactionPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!canManageClientAttestations(user?.role)) redirect("/portal");
  const sp = await searchParams;
  const savedId = typeof sp?.saved === "string" ? sp.saved : null;
  const savedClientId = typeof sp?.client === "string" ? sp.client : null;
  const error = sp?.error ? ERRORS[sp.error] || "Something went wrong." : null;

  const [clients, reports, marks] = await Promise.all([
    prisma.client.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        clientKey: true,
        office: true,
        caseWorkerName: true,
        staffUser: {
          select: { name: true, preferredFirstName: true, preferredLastName: true },
        },
      },
    }),
    prisma.clientReport.findMany({
      where: { kind: SATISFACTION_KIND },
      orderBy: { createdAt: "desc" },
      select: { id: true, clientKey: true, conductedByName: true, createdAt: true, answers: true },
    }),
    // the reviewers' marks - who to prioritize, who is flagged and why
    prisma.clientMark.findMany({
      select: { clientKey: true, starred: true, flagged: true, note: true },
    }),
  ]);
  const markByClient = new Map(marks.map((m) => [m.clientKey, m]));

  // newest first, so the first report seen per client IS the latest. The count
  // rides along because one client is surveyed by different people - the
  // client themself, a parent - and a single "latest" line would hide that.
  const latestByClient = new Map();
  const countByClient = new Map();
  for (const r of reports) {
    if (!latestByClient.has(r.clientKey)) latestByClient.set(r.clientKey, r);
    countByClient.set(r.clientKey, (countByClient.get(r.clientKey) || 0) + 1);
  }

  const fmtDay = (d) =>
    new Date(d).toLocaleDateString("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const rows = clients
    .filter((c) => !isDayProgram(c.office))
    .map((c) => {
      const latest = latestByClient.get(c.clientKey) || null;
      const mark = markByClient.get(c.clientKey) || null;
      return {
        id: c.id,
        name: c.name,
        staff: c.staffUser ? preferredName(c.staffUser) : c.caseWorkerName || "",
        starred: mark?.starred === true,
        flagged: mark?.flagged === true,
        note: mark?.note || null,
        latest: latest
          ? {
              id: latest.id,
              when: fmtDay(latest.createdAt),
              who: completedByLabel(latest.answers),
              by: latest.conductedByName,
              answered: answeredCount(latest.answers),
              of: ANSWERABLE_COUNT,
              count: countByClient.get(c.clientKey) || 1,
            }
          : null,
      };
    });

  const surveyed = rows.filter((r) => r.latest).length;

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin">Back to Admin dashboard</BackLink>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Annual satisfaction survey
      </h1>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
        Every MLS client with their assigned staff. The survey is filled out
        here - over the phone or in person - and the answers produce the
        printed form, ready to download.
      </p>
      <p className="mt-2 text-sm text-muted">
        Surveys on file for <span className="font-semibold text-foreground">{surveyed}</span> of{" "}
        {rows.length} clients.
      </p>

      {error && (
        <div className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-500/40 dark:bg-rose-950/30">
          <p className="text-sm font-medium text-rose-900 dark:text-rose-200">{error}</p>
        </div>
      )}
      {savedId && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-500/40 dark:bg-emerald-950/30">
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
            Survey recorded.
          </p>
          {savedClientId && <ClearDraft clientId={savedClientId} />}
          <Link
            href={`/portal/admin/satisfaction/report/${savedId}/pdf`}
            target="_blank"
            className="text-sm font-semibold text-emerald-800 underline decoration-emerald-400 underline-offset-2 hover:text-emerald-950 dark:text-emerald-200 dark:hover:text-white"
          >
            Open the PDF →
          </Link>
        </div>
      )}

      <SurveyList rows={rows} mark={markClient} />
    </section>
  );
}
