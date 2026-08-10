"use client";

// wraps the existing portal FormFiller so signing a timesheet works exactly
// like signing any other form: the PDF renders with its AcroForm fields
// overlaid, the signature box opens a draw pad, and the filled bytes are built
// in the browser. only the submit target differs (a timesheet row, not a
// FormSubmission), so we adapt the payload here rather than fork the filler.
import FormFiller from "@/app/portal/forms/[id]/fill/FormFiller";

export default function TimesheetSigner({ token, fileUrl, title, submitAction }) {
  // FormFiller calls submitAction({ formId, pdfBase64, ... }); the timesheet
  // action wants { token, pdfBase64, signedName }.
  const submit = async (payload) =>
    submitAction({
      token,
      pdfBase64: payload.pdfBase64,
      signedName: payload.employeeName || null,
    });

  return (
    <div className="mt-6">
      <FormFiller
        fileUrl={fileUrl}
        title={title}
        formId={token}
        submitAction={submit}
        reviewTeam={{ recipientLabel: "payroll", recipients: [], ccNames: [] }}
        signIntro="Check the hours and breaks below, sign at the bottom, then submit. Your signed copy goes to payroll and is kept on file."
        signMode
      />
    </div>
  );
}
