// THE LITTLE PHONE OR ENVELOPE beside a contacted mark.
//
// Mánu 2026-08-13: "it can show the little phone or email icon with whoever
// chose contacted."
//
// Inline SVG rather than an emoji: an emoji renders as a different picture on
// every platform and at a size the surrounding text controls, and this sits at
// 12px next to a 18px avatar where that is exactly the wrong kind of variation.
// `currentColor` so it inherits whatever the chip around it is doing.
//
// Drawn once here because three surfaces show it - the chip on a row, the
// summary strip, and the person page - and three copies of a path is how two of
// them end up pointing different directions.
export default function ContactViaIcon({ via, size = 12, className = "" }) {
  if (via !== "phone" && via !== "email") return null;
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    className: `inline-block shrink-0 ${className}`,
  };
  if (via === "phone") {
    return (
      <svg {...common}>
        <path d="M5.2 2.5H3.4c-.6 0-1.1.5-1 1.1.2 2.3 1.1 4.5 2.6 6.2 1.5 1.8 3.5 3 5.8 3.4.6.1 1.1-.4 1.1-1v-1.7c0-.5-.3-.9-.8-1l-1.5-.3c-.4-.1-.8.1-1 .4l-.5.8c-1.4-.8-2.6-2-3.3-3.4l.7-.6c.3-.2.4-.6.3-1l-.4-1.4c-.1-.5-.5-.8-1-.8Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="1.8" y="3.5" width="12.4" height="9" rx="1.4" />
      <path d="m2.4 4.4 5.1 3.8c.3.2.7.2 1 0l5.1-3.8" />
    </svg>
  );
}
