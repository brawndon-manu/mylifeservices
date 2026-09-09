import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";

test("the corrections page resolves its components and renders actual slot evidence", async () => {
  // Compile the real page and its component tree. Only I/O is replaced; a
  // missing local component must fail this test before any assertions run.
  const date = "09/02/26";
  const day = { date, paidHours: 6, punches: [{ min: 480 }, { min: 840 }], breaks: [] };
  const sheet = {
    id: "render-test", user: { name: "Brandon Uribe", preferredFirstName: "Mánu" },
    paidHours: 6, premiumHours: 0, data: { days: [day] },
    corrections: [{ id: "claim", date, kind: "hours", status: "open", claimedHours: 7.5,
      statedSlots: [{ from: 480, to: 660 }, { from: 690, to: 960 }], note: "Full day correction",
      createdAt: new Date("2026-09-09T05:00:00Z") }],
  };
  const stubs = {
    "@/lib/prisma": `export const prisma = {
      timesheetBatch: {findUnique: async () => ({id: 'batch', periodFrom: '09/01/26', periodTo: '09/15/26'})},
      timesheet: {findMany: async () => { const s = ${JSON.stringify(sheet)};
        s.corrections[0].createdAt = new Date(s.corrections[0].createdAt); return [s]; }}
    };`,
    "@/lib/current-user": "export const getCurrentUser = async () => ({ role: 'SUPER' });",
    "@/app/portal/admin/timesheets/actions": `
      const forbidden = () => { throw new Error('A render must not write'); };
      export const resolveCorrection = forbidden, recomputeTimesheet = forbidden, timesheetRecomputeImpact = forbidden;`,
    "next/navigation": `export const useRouter = () => ({refresh() {}});
      export const redirect = () => {throw new Error('unexpected redirect')};
      export const notFound = () => {throw new Error('unexpected notFound')};`,
  };
  const result = await build({
    entryPoints: ["src/app/portal/admin/timesheets/[id]/corrections/page.js"],
    bundle: true, write: false, outfile: "/tmp/mls-render-test.js", platform: "node", format: "cjs", packages: "external",
    jsx: "automatic", loader: { ".js": "jsx", ".module.css": "local-css" }, tsconfig: "jsconfig.json",
    plugins: [{ name: "render-io", setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) => stubs[args.path] ? { path: args.path, namespace: "render-io" } : null);
      builder.onLoad({ filter: /.*/, namespace: "render-io" }, (args) => ({ contents: stubs[args.path], loader: "js" }));
    } }],
  });
  const compiled = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
  const tree = await compiled.exports.default({ params: Promise.resolve({ id: "batch" }) });
  const html = renderToStaticMarkup(tree);
  for (const text of ["Reported problems", "Mánu Uribe", "Before correction", "Employee reported", "7.50", "Full day correction", "Accept", "Decline"]) {
    assert.ok(html.includes(text), `missing rendered content: ${text}`);
  }
  assert.match(html, /Original and reported work slots/);
  assert.ok(!html.includes("rest premium currently owed"));
});
