"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

// Auto-advance interval in ms. Paused on hover/focus and when the
// user prefers reduced motion.
const INTERVAL_MS = 5000;

export default function PhotoSlideshow({ photos, ratio = "aspect-[4/3]" }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  }, []);

  useEffect(() => {
    if (photos.length <= 1 || paused || reducedMotion.current) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % photos.length);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [photos.length, paused]);

  if (!photos.length) return null;

  const current = photos[index];
  const go = (next) => setIndex((next + photos.length) % photos.length);

  return (
    <figure
      className="w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        className={`relative ${ratio} w-full overflow-hidden rounded-2xl bg-slate-100 shadow-sm`}
        aria-roledescription="carousel"
        aria-label="Community photos"
      >
        {photos.map((photo, i) => (
          <Image
            key={photo.src}
            src={photo.src}
            alt={photo.alt}
            fill
            sizes="(min-width: 640px) 40vw, 100vw"
            className={`object-cover transition-opacity duration-700 ${
              i === index ? "opacity-100" : "opacity-0"
            }`}
            priority={i === 0}
          />
        ))}

        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous photo"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 text-slate-700 shadow transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next photo"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 text-slate-700 shadow transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {photos.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Show photo ${i + 1} of ${photos.length}`}
                  aria-current={i === index}
                  className={`h-2 w-2 rounded-full transition ${
                    i === index ? "bg-white" : "bg-white/50 hover:bg-white/80"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <figcaption
        className="mt-3 text-sm leading-relaxed text-slate-600"
        aria-live="polite"
      >
        {current.caption}
      </figcaption>
    </figure>
  );
}

function ChevronLeft({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12.5 15L7.5 10l5-5" />
    </svg>
  );
}

function ChevronRight({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7.5 5l5 5-5 5" />
    </svg>
  );
}
