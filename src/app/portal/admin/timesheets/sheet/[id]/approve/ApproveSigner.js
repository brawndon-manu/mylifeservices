"use client";

// management signing the approval line, using the same filler the employee
// used. it loads the employee-SIGNED pdf, so their signature is already stamped
// into the page and the approval is added on top of it.
import { useRouter } from "next/navigation";
import FormFiller from "@/app/portal/forms/[id]/fill/FormFiller";

export default function ApproveSigner({ timesheetId, fileUrl, title, submitAction, backHref }) {
  const router = useRouter();

  const submit = async (payload) => {
    const res = await submitAction({ timesheetId, pdfBase64: payload.pdfBase64 });
    if (res?.ok) {
      // land back on the batch so the row shows as approved straight away
      router.push(backHref);
      router.refresh();
    }
    return res;
  };

  return (
    <div className="mt-6">
      <FormFiller
        fileUrl={fileUrl}
        title={title}
        formId={timesheetId}
        submitAction={submit}
        signMode
        signLabel="Approve & sign off"
      />
    </div>
  );
}
