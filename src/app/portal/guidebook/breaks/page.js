import { getCurrentUser } from "@/lib/current-user";
import { sharePath } from "@/lib/guidebook";
import BackLink from "@/components/BackLink";
import ShareMenu from "@/components/ShareMenu";
import BreaksContent from "./_components/BreaksContent";

export const metadata = {
  title: "Meal Periods & Rest Breaks · MLS Portal",
  robots: { index: false, follow: false },
};

// The gated copy. The content itself lives in _components/BreaksContent so the
// public /g/<slug> link renders exactly the same words - a policy page that
// says something different depending on who is reading it would be worse than
// having no page.
export default async function BreaksPage() {
  await getCurrentUser();

  return (
    <section className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <BackLink href="/portal/guidebook">Back to Employee Guidebook</BackLink>
      <BreaksContent
        action={
          <ShareMenu path={sharePath("breaks")} label="Share link" scope="public" />
        }
      />
    </section>
  );
}
