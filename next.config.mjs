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
