import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import BackLink from "@/components/BackLink";
import FormsLibrary from "./FormsLibrary";
import { visibleFormsWhere, formFileHref } from "@/lib/form-visibility";

export const metadata = {
  title: "Forms · MLS Portal",
  robots: { index: false, follow: false },
};

export default async function FormsPage() {
  const user = await getCurrentUser();

  const rows = await prisma.form.findMany({
    // WHO IS LOOKING. Until the field supervisor set went in, every form here
    // was visible to everybody and this query had no `where` at all.
    where: visibleFormsWhere(user?.role),
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      category: true,
      description: true,
      fileUrl: true,
      fillable: true,
      minRole: true,
    },
  });

  // THE PAGE NEVER SEES A RESTRICTED FORM'S REAL URL. That address is a blob
  // one, which works for anyone holding it, so the link is swapped server-side
  // for the route that re-checks the role. fileUrl is dropped on the way out.
  const forms = rows.map(({ fileUrl, minRole, ...rest }) => ({
    ...rest,
    href: formFileHref({ ...rest, fileUrl, minRole }),
    restricted: !!minRole,
  }));

  return (
    <section className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
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
