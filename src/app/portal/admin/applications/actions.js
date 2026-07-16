"use server";

import { redirect } from "next/navigation";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated } from "@/lib/roles";

// hard-delete an application (e.g. an applicant asks us to purge their data), and
// drop the stored resume from Blob with it. oversight tier only.
export async function deleteApplication(id) {
  const user = await getCurrentUser();
  if (!isElevated(user?.role)) redirect("/portal");

  const app = await prisma.application.findUnique({
    where: { id },
    select: { id: true, resumeUrl: true },
  });
  if (!app) redirect("/portal/admin/applications");

  if (app.resumeUrl && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await del(app.resumeUrl);
    } catch {
      // blob may already be gone - the row delete is what matters
    }
  }
  await prisma.application.delete({ where: { id } });
  redirect("/portal/admin/applications?deleted=1");
}
