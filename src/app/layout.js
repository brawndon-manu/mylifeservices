import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PublicChrome from "@/components/PublicChrome";
import RegisterServiceWorker from "@/components/RegisterServiceWorker";
import AccessibilityMenu from "@/components/AccessibilityMenu";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://www.mylifeservicesinc.com";
const SITE_DESC =
  "My Life Services supports adults with intellectual and developmental disabilities through person-centered programs.";

// THE STATUS BAR AROUND THE INSTALLED APP. `theme_color` in the manifest is
// what Android reads; Safari reads this meta tag, and Next only emits it from
// a `viewport` export rather than from metadata - which is why it was missing
// when the manifest already had the colour.
//
// width and initial-scale are deliberately NOT set here: leaving them out keeps
// Next's own defaults, and those defaults are what the whole mobile layout
// rests on. Verified in the rendered head after adding this.
export const viewport = {
  themeColor: "#196e93",
};

export const metadata = {
  // metadataBase makes the og/twitter image an absolute url, which imessage,
  // facebook, and the rest all require
  metadataBase: new URL(SITE_URL),
  title: {
    default: "My Life Services",
    template: "%s | My Life Services",
  },
  description: SITE_DESC,
  // SAVED TO A HOME SCREEN, THIS OPENS LIKE AN APP. The manifest does the work
  // on Android; Safari ignores most of it and reads these instead, which is why
  // they are spelled out rather than left to the manifest alone.
  //
  // `title` is what sits under the icon, and it is the SHORT name on purpose -
  // iOS truncates without asking and would cut "My Life Services Employee
  // Portal" somewhere unhelpful.
  //
  // On iPhone this only ever happens by hand, via Share then Add to Home
  // Screen: Safari offers no install prompt, so nobody gets it unless they are
  // told. Android offers it by itself.
  appleWebApp: {
    capable: true,
    title: "MLS Portal",
    // "default" keeps the status bar legible over the light page underneath.
    // "black-translucent" would run the page under the clock.
    statusBarStyle: "default",
  },
  other: {
    // NEXT EMITS THE MODERN `mobile-web-app-capable` AND NOT THIS ONE, which is
    // correct for current Safari and no help to an older iPhone, where the
    // Apple-prefixed tag is still what decides whether the saved page opens
    // without browser chrome. Checked rather than assumed: the rendered head
    // carried `mobile-web-app-capable` alone. Two tags cost nothing and this is
    // a workforce, not a device fleet anybody controls.
    "apple-mobile-web-app-capable": "yes",
  },
  // without an explicit og:image, link previews scrape the page and grab
  // whatever photo they find (it was picking a client photo off the homepage).
  // pin it to the branded card so every shared link looks the same.
  openGraph: {
    type: "website",
    siteName: "My Life Services",
    title: "My Life Services",
    description: SITE_DESC,
    url: SITE_URL,
    locale: "en_US",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "My Life Services - My Life. My Way.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "My Life Services",
    description: SITE_DESC,
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      // the no-flash theme script below sets classes/attrs on <html> before
      // hydration, so its attributes intentionally differ from the server
      // render. suppress the resulting hydration warning for this element.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* set the theme before paint so there's no flash of the wrong one.
            reads the saved choice, falling back to the OS preference. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var d=document.documentElement,c=d.classList;var t=localStorage.getItem('theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dim':'light';}if(t==='dim'||t==='night'){c.add('dark');}if(t==='night'){c.add('night');}var ts=localStorage.getItem('a11y-textsize');if(ts){d.dataset.textsize=ts;}['a11y-reduce-motion','a11y-underline-links','a11y-readable-font','a11y-line-spacing','a11y-large-cursor','a11y-high-contrast'].forEach(function(k){if(localStorage.getItem(k)==='1'){c.add(k);}});}catch(e){}})();",
          }}
        />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-brand focus:px-3 focus:py-2 focus:text-white"
        >
          Skip to main content
        </a>
        <PublicChrome>
          <Header />
        </PublicChrome>
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <PublicChrome>
          <Footer />
        </PublicChrome>
        {/* always-on accessibility control, pinned to the bottom-right corner
            of the viewport on every page (public + portal). */}
        <div className="corner-fab fixed bottom-4 right-4 z-50 print:hidden">
          <AccessibilityMenu variant="fab" openUp align="right" />
        </div>
        {/* the install prompt's precondition, and nothing else - see public/sw.js */}
        <RegisterServiceWorker />
        <Analytics />
      </body>
    </html>
  );
}
