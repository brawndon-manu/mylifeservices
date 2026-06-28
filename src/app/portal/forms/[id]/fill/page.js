import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import FormFiller from "./FormFiller";

export const metadata = {
  title: "Fill form · MLS Portal",
  robots: { index: false, follow: false },
};

export default async function FillFormPage({ params }) {
  const { id } = await params;
  await getCurrentUser();

  const form = await prisma.form.findUnique({
    where: { id },
    select: { id: true, title: true, fileUrl: true, fillable: true },
  });
  if (!form) notFound();
  if (!form.fillable) redirect("/portal/forms");

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <Link
        href="/portal/forms"
        className="text-sm font-medium text-muted transition hover:text-brand"
      >
        ← Back to Forms
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {form.title}
      </h1>
      <FormFiller fileUrl={form.fileUrl} title={form.title} />
    </section>
  );
}
