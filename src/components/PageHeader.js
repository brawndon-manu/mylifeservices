import Link from "next/link";
import Image from "next/image";

export default function PageHeader({
  eyebrow,
  title,
  intro,
  backHref,
  backLabel,
  image,
}) {
  const paragraphs = Array.isArray(intro) ? intro : intro ? [intro] : [];
  const hasImage = Boolean(image);

  const textBlock = (
    <div>
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
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
        {title}
      </h1>
      {paragraphs.length > 0 && (
        <div className="mt-5 max-w-2xl space-y-4 text-lg leading-relaxed text-muted">
          {paragraphs.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <header className="border-b border-border bg-surface-2">
      <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
        {hasImage ? (
          <div className="grid items-center gap-10 sm:grid-cols-12 sm:gap-12">
            <div className="sm:col-span-7">{textBlock}</div>
            <div className="sm:col-span-5">
              <Image
                src={image.src}
                alt={image.alt || ""}
                width={image.width || 777}
                height={image.height || 733}
                className="mx-auto h-auto w-full max-w-xs rounded-2xl shadow-md sm:max-w-sm"
                priority={image.priority || false}
              />
            </div>
          </div>
        ) : (
          textBlock
        )}
      </div>
    </header>
  );
}
