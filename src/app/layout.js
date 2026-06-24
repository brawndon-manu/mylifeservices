import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AccessibilityMenu from "@/components/AccessibilityMenu";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    default: "My Life Services",
    template: "%s | My Life Services",
  },
  description:
    "My Life Services supports adults with intellectual and developmental disabilities through person-centered programs.",
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
        <Header />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <Footer />
        {/* always-on accessibility control, pinned to the bottom-right corner
            of the viewport on every page (public + portal). */}
        <div className="fixed bottom-4 right-4 z-50 print:hidden">
          <AccessibilityMenu variant="fab" openUp align="right" />
        </div>
        <Analytics />
      </body>
    </html>
  );
}
