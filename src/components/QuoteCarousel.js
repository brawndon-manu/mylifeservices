"use client";

import { useState, useRef, useEffect } from "react";

// cycles through staff quotes, same behavior as the homepage stories carousel:
// auto-advances, pauses on hover/focus, and auto-rotate is off entirely for
// reduced-motion (the arrows and dots still work). a single quote just renders
// static with no controls.
export default function QuoteCarousel({ quotes }) {
  const [i, setI] = useState(0);
  const pausedRef = useRef(false);
  const count = quotes.length;

  const next = () => setI((n) => (n + 1) % count);
  const prev = () => setI((n) => (n - 1 + count) % count);

  useEffect(() => {
    if (count < 2) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    // quotes take longer to read than a story card, so this sits well above
    // the 3.5s the homepage carousel uses
    const t = setInterval(() => {
      if (!pausedRef.current) next();
    }, 8000);
    return () => clearInterval(t);
  }, [count]);

  const pause = () => {
    pausedRef.current = true;
  };
  const resume = () => {
    pausedRef.current = false;
  };

  if (!count) return null;
  const q = quotes[i];

  return (
    <div
      className="mt-9"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocusCapture={pause}
      onBlurCapture={resume}
    >
      <figure className="rounded-r-2xl border-l-4 border-brand-light bg-surface-2 py-6 pl-6 pr-6 sm:pl-8">
        {/* fixed min height so the card doesn't jump as quotes change length */}
        <div className="min-h-[8.5rem] sm:min-h-[7.5rem]">
          <blockquote
            key={i}
            className="max-w-3xl text-lg leading-relaxed text-foreground sm:text-xl"
          >
            &ldquo;{q.body}&rdquo;
          </blockquote>
          <figcaption className="mt-4 text-sm font-semibold text-brand-dark">
            {q.name}
            {q.title && <span className="font-normal text-muted">, {q.title}</span>}
          </figcaption>
        </div>

        {count > 1 && (
          <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={prev}
              aria-label="Previous quote"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border-strong text-muted transition hover:border-brand-light hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next quote"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border-strong text-muted transition hover:border-brand-light hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              ›
            </button>

            <div className="ml-1 flex gap-1.5">
              {quotes.map((_, n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setI(n)}
                  aria-label={`Quote ${n + 1} of ${count}`}
                  aria-current={n === i ? "true" : undefined}
                  className={`h-2 rounded-full transition-all ${
                    n === i ? "w-5 bg-brand-light" : "w-2 bg-border-strong hover:bg-brand-light/60"
                  }`}
                />
              ))}
            </div>

            <span className="ml-auto text-xs text-faint">
              {i + 1} / {count}
            </span>
          </div>
        )}
      </figure>
    </div>
  );
}
