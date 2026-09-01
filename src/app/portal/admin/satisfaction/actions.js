"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageClientAttestations } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import {
  SATISFACTION_KIND,
  readSurveyForm,
  completingTally,
  completingOptionOpen,
} from "@/lib/client-reports/satisfaction";

// RECORDING ONE CONDUCTED SURVEY. The answers are the record; the PDF is
// rendered from them on demand, so nothing is stored twice.
//
// Same desk as client attestations, same gate. The conductor is the signed-in
// person - a survey taken over the phone says whose voice was asking, which is
// exactly what Mánu asked the footer to say.
export async function submitSatisfactionSurvey(formData) {
  const user = await getCurrentUser();
  if (!canManageClientAttestations(user?.role)) redirect("/portal");

  const clientId = String(formData.get("clientId") || "");
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { clientKey: true, name: true },
  });
  if (!client) redirect("/portal/admin/satisfaction?error=noclient");

  // ONE SURVEY PER COMPLETING PERSON (two for Other), checked against what is
  // already stored rather than what the form was told - the form disables
  // taken options, but this is a public endpoint and the form's state is not
  // ours. A survey with no completing person can't count against any cap, so
  // it is refused rather than stored uncappable.
  const answers = readSurveyForm((n) => formData.get(n));
  const prior = await prisma.clientReport.findMany({
    where: { kind: SATISFACTION_KIND, clientKey: client.clientKey },
    select: { answers: true },
  });
  const tally = completingTally(prior.map((p) => p.answers));
  if (!answers.completedBy) {
    redirect(`/portal/admin/satisfaction/${clientId}?error=novoice`);
  }
  if (!completingOptionOpen(answers.completedBy, tally)) {
    redirect(`/portal/admin/satisfaction/${clientId}?error=capped`);
  }

  const report = await prisma.clientReport.create({
    data: {
      kind: SATISFACTION_KIND,
      // keyed by the durable name key, not the roster row - a roster re-import
      // replaces every Client row and this record has to outlive that
      clientKey: client.clientKey,
      clientName: client.name,
      answers,
      conductedById: user.id,
      conductedByName: preferredName(user),
    },
    select: { id: true },
  });

  revalidatePath("/portal/admin/satisfaction");
  // `client` rides along so the saved banner can clear this browser's draft -
  // only now, with the row confirmed in the database
  redirect(`/portal/admin/satisfaction?saved=${report.id}&client=${clientId}`);
}
