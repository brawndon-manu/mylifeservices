import Link from "next/link";

export default function PageHeader({
  eyebrow,
  title,
  intro,
  backHref,
  backLabel,
}) {
  const paragraphs = Array.isArray(intro) ? intro : intro ? [intro] : [];

  return (
    <header className="border-b border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        {backHref ? (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-brand-dark transition hover:text-brand"
          >
            <span aria-hidden="true">&larr;</span>
            {backLabel}
          </Link>
        ) : eyebrow ? (
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
          {title}
        </h1>
        {paragraphs.length > 0 && (
          <div className="mt-5 max-w-2xl space-y-4 text-lg leading-relaxed text-slate-700">
            {paragraphs.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
