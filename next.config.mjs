/** @type {import('next').NextConfig} */

// security headers applied to every response. the big wins here:
// - X-Frame-Options: stops someone embedding our pages in an iframe to
//   do clickjacking attacks
// - X-Content-Type-Options: tells browsers not to "guess" content types
//   (mainly defends against weird mime-sniffing exploits)
// - Referrer-Policy: dont leak full urls to other sites in the Referer
//   header. cuts down on accidentally exposing query params.
// - Permissions-Policy: explicitly disable apis nobody on the site uses
//   (camera/mic/geo). harm reduction if a script ever gets injected.
//
// skipping a full CSP for now - it breaks stuff in subtle ways and
// needs careful tuning. add later before launch.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig = {
  // bump server action body size so hub post images (up to ~4MB) fit.
  //
  // RAISED TO 50MB ON 2026-08-27 for the timesheet upload, which now carries
  // eight QSP exports in one request. The Employee Service Notes export is
  // 21.8MB on its own - QSP writes it as one worksheet per staff member per
  // client and the file is mostly formatting - and the eight come to 26.9MB.
  // At 5mb Next refused the request itself, before the form's own check.
  //
  // Vercel still caps a serverless request body at 4.5mb whatever this says, so
  // this only helps an upload run from localhost - which is where the big ones
  // have always been run, for exactly that reason. Nothing else on the site
  // posts anything near this; the hub's images are capped in their own form.
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
    // AND THE PROXY HAS ITS OWN, which is a separate 10MB and the one that
    // actually bit. `proxy.ts` runs on every request, so the body passes
    // through it before the action ever sees it, and Next truncates it there:
    //
    //   Request body exceeded 10MB for /portal/admin/timesheets/new.
    //   Only the first 10MB will be available unless configured.
    //
    // A truncated multipart body is not a smaller upload, it is a broken one -
    // the request died with no POST logged and the page showed a bare failure.
    // Raising serverActions.bodySizeLimit alone does nothing while this stands.
    //
    // Same reasoning and the same ceiling: eight QSP exports are 26.9MB and
    // Vercel caps a request at 4.5mb regardless, so this only helps an upload
    // run from localhost, which is where the big ones are run.
    proxyClientMaxBodySize: "50mb",
  },
  // keep the PDF stack out of the bundler - pdfjs/pdf-lib are only used in
  // server code (timesheet parsing + rendering) and bundling them breaks their
  // dynamic requires.
  serverExternalPackages: ["pdfjs-dist", "pdf-lib"],
  // pdfjs loads its worker through a dynamic import built from a path string,
  // which the file tracer can't follow, so the worker was never shipped to the
  // lambda. locally it works because node_modules is all there; on vercel the
  // parse dies with "Cannot find module .../pdf.worker.mjs" the moment anyone
  // uploads. force it into the trace. verify after any pdfjs bump with:
  //   grep -rl "pdf.worker.mjs" .next/server --include=*.nft.json
  outputFileTracingIncludes: {
    "/portal/admin/timesheets/**": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
    // the client attestations read the QSP schedule export through the same
    // pdfjs, so they need the same worker traced in - without this the upload
    // dies on Vercel with "Cannot find module .../pdf.worker.mjs" and works
    // perfectly on a laptop, where node_modules is all there.
    "/portal/admin/client-attestations/**": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
  // allow rendering remote images from Vercel Blob (hub post images).
  // host pattern matches any blob store — Vercel doesnt pin a fixed
  // subdomain so we use a wildcard.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
