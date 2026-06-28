import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import BackLink from "@/components/BackLink";
import FormsLibrary from "./FormsLibrary";

export const metadata = {
  title: "Forms · MLS Portal",
  robots: { index: false, follow: false },
};

export default async function FormsPage() {
  await getCurrentUser();

  const forms = await prisma.form.findMany({
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      category: true,
      description: true,
      fileUrl: true,
      fillable: true,
    },
  });

  return (
    <section className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      <BackLink href="/portal">Back to Dashboard</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Portal
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Forms
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Find a form, fill it out, and download or send it. Filled copies are
        never stored here - only the blank templates.
      </p>

      <FormsLibrary forms={forms} />
    </section>
  );
}
