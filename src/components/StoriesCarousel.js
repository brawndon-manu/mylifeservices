"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";

// how many cards show at the widest breakpoint (matches the lg grid). the track
// steps by one card's pixel width, so fewer-visible breakpoints just work.
const MAX_VISIBLE = 3;
const LOGO_GRADIENT =
  "linear-gradient(135deg,#176f97 0%,#1f93bf 46%,#29b1dd 74%,#54cef1 100%)";
const CHIP_GRADIENT = "linear-gradient(140deg,#2ab3e0,#186a94)";

export default function StoriesCarousel({ stories }) {
  // the reserved "share your story" slot always rides along as the last card
  const slides = [...stories, { reserved: true }];
  // only rotate once there's enough to cycle; otherwise it's the plain grid
  const useCarousel = stories.length > 3;

  if (!useCarousel) {
    return (
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {slides.map((s, i) => (
          <li key={i}>{s.reserved ? <ReservedCard /> : <StoryCard story={s} />}</li>
        ))}
      </ul>
    );
  }

  return <Carousel slides={slides} />;
}

function Carousel({ slides }) {
  const N = slides.length;
  const trackRef = useRef(null);
  const idxRef = useRef(0);
  const stepRef = useRef(0);
  const pausedRef = useRef(false);
  const [active, setActive] = useState(0);

  // position the track at the current index (pixel-based so it's correct at any
  // breakpoint). animate=false snaps with no transition (used for the seamless wrap).
  const apply = useCallback(
    (animate) => {
      const el = trackRef.current;
      if (!el) return;
      el.style.transition = animate
        ? "transform 0.6s cubic-bezier(0.4,0,0.2,1)"
        : "none";
      el.style.transform = `translateX(-${idxRef.current * stepRef.current}px)`;
      setActive(((idxRef.current % N) + N) % N);
    },
    [N],
  );

  const measure = useCallback(() => {
    const el = trackRef.current;
    const first = el?.children?.[0];
    if (!first) return;
    const gap = parseFloat(getComputedStyle(el).columnGap || "0") || 0;
    stepRef.current = first.getBoundingClientRect().width + gap;
    apply(false);
  }, [apply]);

  const next = useCallback(() => {
    idxRef.current += 1;
    apply(true);
  }, [apply]);

  const prev = useCallback(() => {
    if (idxRef.current <= 0) {
      // jump to the cloned tail (looks identical to index 0) then step back
      idxRef.current = N;
      apply(false);
      void trackRef.current.offsetWidth; // force reflow so the next move animates
      idxRef.current = N - 1;
      apply(true);
    } else {
      idxRef.current -= 1;
      apply(true);
    }
  }, [apply, N]);

  const goTo = useCallback(
    (i) => {
      idxRef.current = i;
      apply(true);
    },
    [apply],
  );

  // seamless loop: once we slide onto the clones (idx >= N), snap back to 0
  useEffect(() => {
    const el = trackRef.current;
    const onEnd = () => {
      if (idxRef.current >= N) {
        idxRef.current = 0;
        apply(false);
      }
    };
    el.addEventListener("transitionend", onEnd);
    return () => el.removeEventListener("transitionend", onEnd);
  }, [N, apply]);

  // measure on mount + on resize
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // auto-rotate, unless the visitor prefers reduced motion
  useEffect(() => {
    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = setInterval(() => {
      if (!pausedRef.current) next();
    }, 3500);
    return () => clearInterval(t);
  }, [next]);

  const pause = () => {
    pausedRef.current = true;
  };
  const resume = () => {
    pausedRef.current = false;
  };

  // render the real slides plus clones of the first few for the wrap
  const rendered = [...slides, ...slides.slice(0, MAX_VISIBLE)];

  return (
    <div>
      <div className="mb-6 flex items-center justify-end gap-2">
        <span className="mr-1 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-emerald-400"
          />
          Auto-rotating
        </span>
        <button
          type="button"
          onClick={prev}
          aria-label="Previous stories"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-foreground transition hover:border-brand-light hover:text-brand-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={next}
          aria-label="Next stories"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-foreground transition hover:border-brand-light hover:text-brand-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <div
        className="overflow-hidden"
        onMouseEnter={pause}
        onMouseLeave={resume}
        onFocusCapture={pause}
        onBlurCapture={resume}
      >
        <div ref={trackRef} className="flex gap-6" style={{ willChange: "transform" }}>
          {rendered.map((s, i) => (
            <div
              key={i}
              aria-hidden={i >= N ? "true" : undefined}
              className="flex-none basis-full sm:basis-[calc((100%-1.5rem)/2)] lg:basis-[calc((100%-3rem)/3)]"
            >
              {s.reserved ? <ReservedCard /> : <StoryCard story={s} />}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 flex justify-center gap-2">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Go to story ${i + 1}`}
            aria-current={active === i ? "true" : undefined}
            className={`h-2 rounded-full transition-all ${
              active === i ? "w-5 bg-brand-light" : "w-2 bg-border-strong"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function StoryCard({ story }) {
  const { initials, since, title, teaser, href, photo } = story;
  return (
    <Link
      href={href}
      className="group card-lift flex h-full flex-col rounded-xl border border-border bg-surface-2 p-6 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      {photo ? (
        <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-surface-3">
          <Image
            src={photo.url}
            alt={photo.alt}
            fill
            sizes="(min-width: 640px) 30vw, 100vw"
            className="object-cover"
          />
        </div>
      ) : (
        <div
          className="flex aspect-square w-full items-center justify-center rounded-lg text-white"
          style={{ background: LOGO_GRADIENT }}
        >
          <p className="text-4xl font-bold tracking-tight">{initials}</p>
        </div>
      )}
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">
        {since}
      </p>
      <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{teaser}</p>
      <p className="mt-5 text-sm font-medium text-brand-light group-hover:text-brand">
        Read the story{" "}
        <span
          aria-hidden="true"
          className="inline-block transition-transform group-hover:translate-x-0.5"
        >
          →
        </span>
      </p>
    </Link>
  );
}

function ReservedCard() {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-xl border border-border bg-surface-2 p-6 text-center shadow-sm">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-sm"
        style={{ background: CHIP_GRADIENT }}
      >
        <svg
          className="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      <p className="mt-4 text-base font-semibold tracking-tight text-foreground">
        This space reserved for someone&apos;s story.
      </p>
      <p className="mt-2 text-sm text-muted">More coming as our community shares.</p>
    </div>
  );
}
