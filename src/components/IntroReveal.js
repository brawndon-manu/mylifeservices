import IntroRevealGuard from "@/components/IntroRevealGuard";

// homepage intro reveal. a quick branded curtain (logo gradient + tree mark +
// wordmark + tagline) that plays once per browser session on the homepage, then
// lifts away to show the site. this inline script runs before paint on a full page
// load (same trick as the theme no-flash script in layout.js) so nobody sees a
// flash; IntroRevealGuard covers soft navigations.
// once per session: returning-this-session visitors skip it (.intro-done hides it).
// reduced motion: instead of skipping entirely, they get a motion-free variant
// (.intro-reduced = a plain opacity cross-fade, no scale/lift) so the branding
// still shows without vestibular-triggering movement.
const INTRO_SCRIPT =
  "(function(){try{var d=document.documentElement;var reduce=(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)||d.classList.contains('a11y-reduce-motion');if(sessionStorage.getItem('introSeen')){d.classList.add('intro-done');return;}sessionStorage.setItem('introSeen','1');window.__mlsIntroPlaying=1;if(reduce){d.classList.add('intro-reduced');}document.addEventListener('animationend',function h(e){if(e.animationName==='intro-lift'||e.animationName==='intro-fade'){d.classList.add('intro-done');window.__mlsIntroPlaying=0;document.removeEventListener('animationend',h);}});}catch(e){document.documentElement.classList.add('intro-done');}})();";

export default function IntroReveal() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
      <div className="intro-reveal" aria-hidden="true">
        <span className="intro-glow" />
        {/* plain img so the mark paints instantly with the curtain */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="intro-mark"
          src="/logo/treelogo_white.png"
          alt=""
          width="120"
          height="120"
        />
        <div className="intro-word">My Life Services</div>
        <div className="intro-tag">My Life. My Way.</div>
      </div>
      <IntroRevealGuard />
    </>
  );
}
