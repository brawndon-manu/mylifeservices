// FONTS AND COLOURS ON A CERTIFICATE - Mánu 2026-09-13: "lets add fonts and
// colors to the certificate maker".
//
// The two things that must hold: an unknown face or a mistyped colour falls
// back rather than printing something nobody chose, and every face the screen
// offers can actually be drawn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  FACES, INKS, faceFor, dateFaceFor, toRgb, cleanColor, DEFAULT_FACE, DEFAULT_COLOR,
} from "../faces.js";
import { renderCertificate } from "../render.js";

test("every face is either a standard one or a file that is actually here", () => {
  for (const f of FACES) {
    assert.ok(f.standard || f.file, `${f.key} has neither`);
    assert.ok(!(f.standard && f.file), `${f.key} claims both`);
    if (f.file) {
      const at = path.join(process.cwd(), "public", "fonts", f.file);
      assert.ok(existsSync(at), `${f.key}: ${f.file} is missing from public/fonts`);
    }
    // the preview needs a family or the marker lands in the wrong place
    assert.ok(f.css && f.css.length, `${f.key} has no css family`);
  }
});

test("a shipped face ships its licence beside it", () => {
  // OFL requires the licence travel with the font
  for (const f of FACES.filter((x) => x.file)) {
    const licence = path.join(process.cwd(), "public", "fonts", `${f.file.split("-")[0]}-OFL.txt`);
    assert.ok(existsSync(licence), `${f.key} has no licence file`);
  }
});

test("an unknown face falls back instead of throwing", () => {
  assert.equal(faceFor("comic-sans").key, DEFAULT_FACE);
  assert.equal(faceFor(null).key, DEFAULT_FACE);
  assert.equal(faceFor("").key, DEFAULT_FACE);
});

test("the date follows the name into a readable partner", () => {
  // his rule: one choice for the batch, the date takes the plain one
  assert.equal(dateFaceFor("helvetica-bold").key, "helvetica");
  assert.equal(dateFaceFor("times-bold").key, "times");
  // and a script name does NOT put the date in script
  assert.equal(dateFaceFor("great-vibes").key, "helvetica");
  assert.ok(!dateFaceFor("great-vibes").file);
});

test("a colour becomes the triple pdf-lib draws in", () => {
  assert.deepEqual(toRgb("#000000"), { r: 0, g: 0, b: 0 });
  assert.deepEqual(toRgb("#ffffff"), { r: 1, g: 1, b: 1 });
  // short form is the same colour
  assert.deepEqual(toRgb("#fff"), toRgb("#ffffff"));
  // and the hash is optional, because people paste them both ways
  assert.deepEqual(toRgb("1e3a5f"), toRgb("#1e3a5f"));
});

test("a colour that is not one falls back rather than printing black", () => {
  // a typo in the hex box must not quietly restyle 108 documents
  for (const bad of ["", "#12", "nope", "#gggggg", null, undefined, "#1234567"]) {
    assert.deepEqual(toRgb(bad), toRgb(DEFAULT_COLOR), `${bad} should fall back`);
  }
});

test("a colour is stored one way only", () => {
  assert.equal(cleanColor("#1E3A5F"), "#1e3a5f");
  assert.equal(cleanColor("1e3a5f"), "#1e3a5f");
  assert.equal(cleanColor("#FFF"), "#ffffff");
  assert.equal(cleanColor("rubbish"), DEFAULT_COLOR);
});

test("the offered inks are all real colours", () => {
  for (const ink of INKS) assert.equal(cleanColor(ink.hex), ink.hex);
});

async function blank() {
  const doc = await PDFDocument.create();
  doc.addPage([792, 612]);
  return Buffer.from(await doc.save());
}

test("every face on the menu can actually draw a name", async () => {
  const template = await blank();
  for (const f of FACES) {
    const bytes = await renderCertificate(template, {
      name: "Beatriz Hernandez-Nieves", x: 396, y: 300, size: 28, face: f.key, color: "#1e3a5f",
    });
    const out = await PDFDocument.load(bytes);
    assert.equal(out.getPageCount(), 1, `${f.key} lost the page`);
    assert.ok(bytes.length > template.length, `${f.key} drew nothing`);
  }
});

test("a shipped face is embedded subset, not whole", async () => {
  // measured: Great Vibes is 445KB on disk, 7.5KB subset into a certificate
  const template = await blank();
  const onDisk = readFileSync(path.join(process.cwd(), "public", "fonts", "GreatVibes-Regular.ttf")).length;
  const bytes = await renderCertificate(template, {
    name: "Beatriz Hernandez-Nieves", x: 396, y: 300, size: 28, face: "great-vibes",
  });
  const added = bytes.length - template.length;
  assert.ok(added < onDisk / 10, `subset should be a fraction of ${onDisk}, added ${added}`);
});

test("nothing that runs in the browser imports the renderer", async () => {
  // THIS ONE IS HERE BECAUSE IT ALREADY HAPPENED. render.js reads font files
  // with node:fs, so a "use client" file importing it drags node:fs/promises
  // into the browser chunk and Turbopack fails the whole build with "the
  // chunking context does not support external modules". The tests run in node
  // and saw nothing wrong, so the first sign of it was a red screen.
  //
  // printedDate is what the browser actually wants, and it lives on its own in
  // printed-date.js with no imports at all.
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const path = await import("node:path");
  const root = path.join(process.cwd(), "src");
  const offenders = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const at = path.join(dir, entry);
      if (statSync(at).isDirectory()) {
        if (entry !== "node_modules" && entry !== "generated") walk(at);
      } else if (entry.endsWith(".js")) {
        const src = readFileSync(at, "utf8");
        if (!/^["']use client["']/.test(src.trimStart())) continue;
        if (/from\s+["'][^"']*certificates\/render["']/.test(src)) offenders.push(path.relative(root, at));
      }
    }
  };
  walk(root);

  assert.deepEqual(offenders, [], "these run in the browser and must not import render.js");
});
