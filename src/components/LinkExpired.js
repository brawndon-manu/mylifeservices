import Image from "next/image";

// WHAT AN EMAILED LINK SHOWS ONCE IT IS DONE: 30 days after its task finished,
// or once the account it was sent to is deactivated (see link-life.js). the
// same card for both, so a link never says which. the way on is the portal,
// where their own copies are.
export default function LinkExpired() {
  return (
    <section className="portal-shell mx-auto flex min-h-[70vh] max-w-md items-center px-6 py-16">
      <div className="w-full rounded-2xl border border-border bg-surface p-7 text-center shadow-sm">
        <Image src="/logo/treelogo_gradient.png" alt="" width={44} height={44} className="mx-auto" />
        <h1 className="mt-4 text-[22px] font-semibold tracking-tight text-foreground">This link has expired</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Links in our emails stop working 30 days after the task is done. Your copies are in the portal.
        </p>
        <a
          href="/login?callbackUrl=/portal/documents"
          className="mt-5 inline-block rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
        >
          Sign in to see your documents
        </a>
        <p className="mt-4 text-xs text-faint">Need a copy of something you signed? Ask HR.</p>
      </div>
    </section>
  );
}
