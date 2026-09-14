// WHAT A NAME CAN BE PRINTED IN, and what the screen has to show to be honest
// about it.
//
// Mánu 2026-09-13: "lets add fonts and colors to the certificate maker". The
// complaint behind it is in the handoff: a fixed Helvetica Bold is wrong on a
// script template.
//
// ONE TABLE, TWO CONSUMERS. The renderer needs a PDF font and the preview needs
// a CSS family, and they have to be the SAME FACE or the placement lies. A name
// at 28pt is 264pt wide in Great Vibes and 340pt in Playfair Display, so a
// preview drawn in the wrong one puts the marker in the wrong place and every
// copy prints there.
//
// The five standard ones cost nothing: they are in every PDF reader, and the
// browser families beside them are metric-compatible (Arial with Helvetica,
// Times New Roman with Times), so the preview matches without a download.
//
// The two shipped ones are OFL, in public/fonts with their licences. They are
// embedded SUBSET - measured on the real template, Great Vibes adds 7.5KB to a
// certificate subset and 217KB whole.

export const DEFAULT_FACE = "helvetica-bold";
export const DEFAULT_COLOR = "#0f172a";

export const FACES = [
  {
    key: "helvetica-bold", label: "Helvetica Bold", standard: "HelveticaBold",
    css: "Helvetica, Arial, sans-serif", weight: 700, style: "normal", datePlain: "helvetica",
  },
  {
    key: "helvetica", label: "Helvetica", standard: "Helvetica",
    css: "Helvetica, Arial, sans-serif", weight: 400, style: "normal", datePlain: "helvetica",
  },
  {
    key: "times-bold", label: "Times Bold", standard: "TimesRomanBold",
    css: '"Times New Roman", Times, serif', weight: 700, style: "normal", datePlain: "times",
  },
  {
    key: "times", label: "Times", standard: "TimesRoman",
    css: '"Times New Roman", Times, serif', weight: 400, style: "normal", datePlain: "times",
  },
  {
    key: "times-italic", label: "Times Italic", standard: "TimesRomanItalic",
    css: '"Times New Roman", Times, serif', weight: 400, style: "italic", datePlain: "times",
  },
  {
    key: "great-vibes", label: "Great Vibes", file: "GreatVibes-Regular.ttf",
    css: '"MLS Great Vibes", cursive', weight: 400, style: "normal",
    // a date in script is hard to read, and a date is read rather than admired
    datePlain: "helvetica",
  },
  {
    key: "playfair-bold", label: "Playfair Display Bold", file: "PlayfairDisplay-Bold.ttf",
    css: '"MLS Playfair Display", Georgia, serif', weight: 700, style: "normal",
    datePlain: "times",
  },
];

const BY_KEY = new Map(FACES.map((f) => [f.key, f]));

export function faceFor(key) {
  return BY_KEY.get(String(key || "")) || BY_KEY.get(DEFAULT_FACE);
}

// THE PLAIN PARTNER THE DATE GOES IN - his call: one font choice for the batch,
// and the date follows it rather than carrying two more controls.
export function dateFaceFor(key) {
  const face = faceFor(key);
  return BY_KEY.get(face.datePlain) || BY_KEY.get("helvetica");
}

// #rgb or #rrggbb to the 0-1 triple pdf-lib draws in. Anything that is not a
// colour comes back as the default rather than as black, because a typo in a
// hex box should not silently change what 108 documents are printed in.
export function toRgb(value) {
  const raw = String(value || "").trim().replace(/^#/, "");
  const hex = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return toRgb(DEFAULT_COLOR);
  return {
    r: parseInt(hex.slice(0, 2), 16) / 255,
    g: parseInt(hex.slice(2, 4), 16) / 255,
    b: parseInt(hex.slice(4, 6), 16) / 255,
  };
}

// what gets stored: always a full lowercase #rrggbb, so two rows that mean the
// same colour cannot be written two different ways
export function cleanColor(value) {
  const raw = String(value || "").trim().replace(/^#/, "");
  const hex = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return DEFAULT_COLOR;
  return `#${hex.toLowerCase()}`;
}

// THE INKS A CERTIFICATE IS ACTUALLY PRINTED IN. The hex box takes anything;
// these are here so the common answer is one click.
export const INKS = [
  { hex: "#0f172a", label: "Near black" },
  { hex: "#000000", label: "Black" },
  { hex: "#1e3a5f", label: "Navy" },
  { hex: "#7b2233", label: "Burgundy" },
  { hex: "#14532d", label: "Dark green" },
  { hex: "#8a6a2f", label: "Bronze" },
];
