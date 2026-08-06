import { notFound } from "next/navigation";
import { pageForSlug } from "@/lib/guidebook";
import BreaksContent from "@/app/portal/guidebook/breaks/_components/BreaksContent";

// PUBLIC, UNLISTED guidebook page, reached only through its random share link.
// No login, not indexed, not linked from anywhere public. Same pattern as the
// /f/<slug> form links and /r/<id> resources: staff can read the break rules on
// a phone without a portal password, and HR can send it to somebody who has no
// account yet.
//
// An unrecognised slug is a plain 404. There is deliberately no "that link is
// wrong" page - a wrong guess should look exactly like a path that was never a
// page, so the URL space cannot be probed.

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return {
    title: pageForSlug(slug)
      ? "Meal Periods & Rest Breaks · My Life Services"
      : "Not found",
    robots: { index: false, follow: false },
  };
}

export default async function PublicGuidebookPage({ params }) {
  const { slug } = await params;
  const key = pageForSlug(slug);
  if (key !== "breaks") notFound();

  return (
    <section className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <BreaksContent />
      <p className="mt-8 border-t border-border pt-5 text-xs text-faint">
        Shared from the My Life Services employee guidebook. If you work here and
        have a portal account, the same page lives under Employee Guidebook.
      </p>
    </section>
  );
}
