import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import BackLink from "@/components/BackLink";
import { fixtureBoard, emailVariants, BREAK_ASKS } from "./fixture";
import EmailStage from "./EmailStage";
import ScenarioStage from "./ScenarioStage";
import BreakStage from "./BreakStage";
import SheetStage from "./SheetStage";

export const metadata = {
  title: "Tests",
  robots: { index: false, follow: false },
};

// A PREVIEW OF EVERYTHING WE SEND OR SHOW, IN EVERY STATE.
//
// It exists because the states cannot be reached any other way.
// `TimesheetBreakAnswer` and `TimesheetCorrection` are both at zero rows, so the
// whole confirm-not-taken chain is deployed and has never run - the control, the
// reason, the employee quote-back, the generation gate and the printed comment
// line have none of them seen a real answer.
//
// `?preview=1` on the timesheet review page is not the answer to that. It opens
// a real person's page and REFUSES every write, so a control can be looked at
// but never seen after it is pressed - and what happens after it is pressed is
// the thing worth checking. Three of the nine question kinds are not produced by
// the current pay period at all, so they cannot even be looked at.
//
// NOTHING ON THIS PAGE WRITES OR SENDS. No Prisma client is imported anywhere
// under this route, no Resend client is constructed, and the actions behind
// every control are local functions that record what they were handed and
// return ok. The sheet is rendered by `renderSheet`, which is a pure function
// of what it is given.
const TABS = [
  { key: "emails", label: "Emails" },
  { key: "review", label: "Timesheet review page" },
  { key: "reasons", label: "Break reasons" },
  { key: "sheet", label: "The sheet" },
];

export default async function TestsPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal/admin");

  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp?.tab) ? sp.tab : "emails";

  const board = fixtureBoard();
  const emails = emailVariants();
  const counts = {
    emails: Object.keys(emails).length,
    review: board.groups.reduce((n, g) => n + g.length, 0),
    reasons: BREAK_ASKS.length,
    sheet: 4,
  };

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin">Back to Admin dashboard</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Admin · Tests
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Tests
      </h1>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
        A preview of everything we send out or show people, in every state, without having to make
        the state happen for real.{" "}
        <b className="text-foreground">
          Nothing on this page writes to the database or sends an email.
        </b>{" "}
        Every control is live and every one of them is wired to a local function that records what
        it was handed and returns.
      </p>

      <div className="mt-8 flex flex-wrap gap-1.5 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/portal/admin/tests?tab=${t.key}`}
            className={`-mb-px flex items-center gap-2 rounded-t-lg border border-b-0 px-4 py-2.5 text-sm font-semibold transition ${
              tab === t.key
                ? "border-border-strong bg-surface text-foreground"
                : "border-transparent bg-surface-2 text-muted hover:text-foreground"
            }`}
          >
            {t.label}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                tab === t.key ? "bg-brand/15 text-brand-dark dark:text-brand-light" : "bg-surface-3 text-faint"
              }`}
            >
              {counts[t.key]}
            </span>
          </Link>
        ))}
      </div>

      <div className="rounded-b-xl border border-t-0 border-border-strong bg-surface p-6">
        {tab === "emails" && <EmailStage emails={emails} />}

        {tab === "review" && (
          <>
            <Preamble>
              The fabricated sheet is <b>{board.who}</b>, {board.period}: nine days carrying one
              worked example of each question kind. The day rows are real shapes lifted off a real
              batch and scrubbed - every name and note replaced, every time and flag left as the
              engine wrote it - and the questions are built by running the real{" "}
              <code>buildQuestions</code> over them. A fixture that stops provoking its card shows
              an empty stage rather than a card the engine can no longer produce.
            </Preamble>
            <div className="mt-5">
              <ScenarioStage board={board} />
            </div>
          </>
        )}

        {tab === "reasons" && (
          <>
            <Preamble>
              Five sentences, because <code>employeeQuestion</code> writes five: a missed lunch, a
              single missed ten, neither of two, one of two taken, and a meal that merely started
              late. Each is shown either as <b>write</b>, where nobody gathered a reason, or as{" "}
              <b>confirm</b>, where somebody took one on a call and it is read back to them. The
              third shape - they say our wording is wrong and give theirs - is inside the card:
              press &ldquo;No, that is not what I said&rdquo;.
            </Preamble>
            <div className="mt-5">
              <BreakStage asks={BREAK_ASKS} />
            </div>
          </>
        )}

        {tab === "sheet" && (
          <>
            <Preamble>
              The whole chain, end to end: answer, save, generate, sign, submit, confirmation.
              Every step is the real component - the PDF is rendered by <code>renderSheet</code>
              from the fixture and the signature pad is the real one. Only what happens when a
              button is pressed is swapped, so <b>nothing is stored and nobody is emailed</b>.
              This exists because <code>?preview=1</code> refuses every write by design, so the
              flow cannot be walked on a real person&rsquo;s page at all.
            </Preamble>
            <div className="mt-5">
              <SheetStage period={board.period} standing={board.standing} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Preamble({ children }) {
  return (
    <p className="max-w-4xl text-sm leading-relaxed text-muted">{children}</p>
  );
}
