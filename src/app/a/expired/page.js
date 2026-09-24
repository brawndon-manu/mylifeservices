import LinkExpired from "@/components/LinkExpired";

// where an emailed link's file routes send a visitor once the link is done -
// under /a/ so a maintenance window never hides it
export const metadata = {
  title: "Link expired · My Life Services",
  robots: { index: false, follow: false },
};

export default function ExpiredLinkPage() {
  return <LinkExpired />;
}
