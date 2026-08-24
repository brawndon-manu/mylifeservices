import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyAttestationToken } from "@/lib/client-attestations/token";
import { FIELDS } from "@/lib/client-attestations/render";
import FormFiller from "@/app/portal/forms/[id]/fill/FormFiller";
import { submitSignedScheduleByToken } from "./actions";

// SIGNING A CLIENT ATTESTATION FROM THE EMAILED LINK, with or without a login.
// Outside /portal so the proxy does not bounce it: the signed token IS the
// credential and it unlocks exactly this one client's form.
//
// WHAT THE PAGE OFFERS DEPENDS ON WHO THE LINK WAS CUT FOR - the audience is
// inside the signed token, not a parameter anybody can change:
//
//   client / staff   only the client's own fields - their signature and its
//                    date. The staff link exists because staff are often
//                    sitting with the client, who signs off the staff's email.
//   supervisor       the whole form. When the client half was already filed,
//                    the page carries on from that partly-signed copy.
//
// A client-half filing routes on to the field supervisor by itself - see
// actions.js.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Client attestation · My Life Services",
  robots: { index: false, follow: false },
};

const CLIENT_FIELDS = [FIELDS.clientSignature, FIELDS.clientDate];

export default async function ScheduleSignPage({ params }) {
  const { token } = await params;
  const parsed = verifyAttestationToken(token);
  if (!parsed) notFound();

  const row = await prisma.clientAttestation.findUnique({
    where: { id: parsed.attestationId },
    select: {
      clientName: true,
      signedAt: true,
      signedName: true,
      clientSignedAt: true,
      formUrl: true,
      batch: { select: { monthLabel: true } },
    },
  });
  if (!row?.formUrl) notFound();

  const clientStage = parsed.audience !== "supervisor";
  // the client's half is already on file, so a client or staff link has nothing
  // left to offer - only the supervisor link still does
  const done = row.signedAt || (clientStage && row.clientSignedAt);

  return (
    <section className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Client attestation · {row.batch.monthLabel}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {row.clientName}
      </h1>

      {done ? (
        <div className="mt-6 rounded-xl border border-emerald-300/60 bg-emerald-50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          {row.signedAt ? (
            <>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                This attestation is signed and on file.
              </p>
              <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-200/80">
                Signed{row.signedName ? ` by ${row.signedName}` : ""} on{" "}
                {new Date(row.signedAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
                .
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                The client&apos;s signature is on file.
              </p>
              <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-200/80">
                The field supervisor completes the rest of this form.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="mt-6">
          <FormFiller
            fileUrl={`/a/schedule/${token}/pdf`}
            title={`${row.clientName} - ${row.batch.monthLabel}`}
            formId={token}
            signMode
            signLabel={clientStage ? "Sign" : "Sign and file"}
            signIntro={
              clientStage
                ? "This is the client's schedule for the month. The client signs in the box marked Client / authorized representative signature. It then goes to the field supervisor for the rest of the form."
                : "Check each item confirmed, fill in how and when the schedule was reviewed with the client, and sign. The client's signature box is optional. The signed copy is filed in the portal."
            }
            optionalSignatures={clientStage ? [] : [FIELDS.clientSignature]}
            nameFrom={clientStage ? null : FIELDS.supervisorName}
            onlyFields={clientStage ? CLIENT_FIELDS : null}
            submitAction={submitSignedScheduleByToken.bind(null, token)}
          />
        </div>
      )}
    </section>
  );
}
