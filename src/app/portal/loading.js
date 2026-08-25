// THE CLICK PAINTS BEFORE THE DATA ARRIVES. Every portal page is
// force-dynamic - getCurrentUser() plus its own queries run before the server
// can answer - and without a loading boundary the App Router holds the OLD
// page on screen for that whole wait. A tap felt like nothing happened. With
// this boundary the navigation commits immediately: the slide plays into
// these placeholders, and the real page streams in over them.
//
// Shaped like the pages it stands in for (back link, heading, prose, cards)
// so the swap is a fill-in rather than a re-layout.
export default function PortalLoading() {
  return (
    <section
      aria-busy="true"
      className="mx-auto max-w-4xl animate-pulse px-6 py-12 sm:py-16"
    >
      <div className="h-4 w-40 rounded bg-surface-2" />
      <div className="mt-6 h-3 w-16 rounded bg-surface-2" />
      <div className="mt-3 h-9 w-64 rounded bg-surface-2" />
      <div className="mt-5 space-y-2.5">
        <div className="h-4 w-full max-w-xl rounded bg-surface-2" />
        <div className="h-4 w-3/4 max-w-lg rounded bg-surface-2" />
      </div>
      <div className="mt-10 space-y-3.5">
        <div className="h-32 rounded-xl border border-border bg-surface-2" />
        <div className="h-32 rounded-xl border border-border bg-surface-2" />
        <div className="h-32 rounded-xl border border-border bg-surface-2" />
      </div>
    </section>
  );
}
