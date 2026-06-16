import Link from "next/link";

// simple work-in-progress placeholder for portal sections that aren't built
// yet (Forms, Announcements). swap in the real page when ready.
export default function ComingSoon({ title }) {
  return (
    <section className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <Link
        href="/portal"
        className="text-sm font-medium text-slate-600 transition hover:text-brand"
      >
        ← Back to dashboard
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        {title}
      </h1>
      <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-10 text-center">
        <p className="text-lg font-medium text-amber-900">
          {"Hey, I'm working on it! - Mánu"}
        </p>
      </div>
    </section>
  );
}
