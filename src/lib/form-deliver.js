import { sendFilledForm } from "@/lib/form-send";
import { storeFormSubmission } from "@/lib/form-store";

// A FORM ABOUT A PERSON SERVED (route.clientRecord - the incident report).
//
// it never rides on an email. the signed copy is stored first, with the list of
// people it is going to; then the email goes out with a link to it, and no pdf
// and no note. the link opens for those people and the form-records roles, after
// signing in (/portal/forms/submissions/[id]). a copy that could not be stored
// is a submission that did not happen: the person gets an error and sends again,
// rather than a report reaching nobody.
//
// `store` is what the caller would have handed storeFormSubmission itself -
// attribution, userId, announcementId, ip - so each door keeps its own rules.
export async function deliverClientRecordForm({ send, store }) {
  const sentTo = [send.recipientEmail, ...(send.ccEmails || [])].filter(Boolean);
  let stored = null;
  try {
    stored = await storeFormSubmission({
      ...store,
      pdfBase64: send.pdfBase64,
      pdfName: send.pdfName,
      submitterName: send.submitterName,
      submitterEmail: send.submitterEmail,
      sentTo,
      note: (send.message || "").toString().trim() || null,
    });
  } catch (e) {
    console.error("client-record form store failed:", e);
  }
  if (!stored) return { ok: false, error: "store" };

  const base = process.env.AUTH_URL || "https://www.mylifeservicesinc.com";
  const result = await sendFilledForm({
    ...send,
    message: null,
    link: `${base}/portal/forms/submissions/${stored.id}`,
  });
  return { ...result, stored: true, submissionId: stored.id };
}
