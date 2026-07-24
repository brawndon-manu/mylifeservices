import Link from "next/link";
import { redirect } from "next/navigation";
import { isMaintenanceOn } from "@/lib/maintenance";
import BypassForm from "./BypassForm";

// full-screen maintenance splash. shown by proxy.js (via rewrite) on every
// public page while maintenance mode is on. always dark + fixed colors (like the
// site's hero) so it reads the same in any theme, with hazard tape top and
// bottom and a little branded reveal animation. the employee portal link and the
// staff bypass box let the right people keep working.
//
// noindex so a maintenance window can't get a page indexed by search engines.
export const metadata = {
  title: "Under maintenance",
  robots: { index: false, follow: false },
};

const LOGO_GRADIENT =
  "linear-gradient(135deg,#0f4a66 0%,#176f97 40%,#1f93bf 72%,#29b1dd 100%)";

export default async function MaintenancePage() {
  // if the site is live, there's nothing to show here - send them home.
  if (!(await isMaintenanceOn())) redirect("/");

  return (
    <div
      className="maint-root relative flex min-h-screen flex-col overflow-hidden text-white"
      style={{ background: LOGO_GRADIENT }}
    >
      {/* hazard tape, top */}
      <div className="hazard-tape" aria-hidden="true" />

      <main className="relative flex flex-1 items-center justify-center px-6 py-14">
        {/* soft glow behind the card */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute h-[420px] w-[420px] rounded-full bg-[#54cef1]/15 blur-3xl"
        />

        <div className="maint-card relative w-full max-w-lg text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="maint-mark mx-auto"
            src="/logo/treelogo_white.png"
            alt="My Life Services"
            width={96}
            height={96}
          />

          <p className="maint-el maint-el-1 mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-[#cfeefc]">
            My Life Services
          </p>
          <h1 className="maint-el maint-el-2 mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            We&apos;ll be right back
          </h1>
          <p className="maint-el maint-el-3 mx-auto mt-4 max-w-md text-base leading-relaxed text-white/85">
            Sorry, the site is down for maintenance right now. We&apos;re making
            some improvements and will have things back up shortly. Thanks for
            your patience.
          </p>

          <div className="maint-el maint-el-4 mt-8 flex flex-col items-center gap-3">
            <Link
              href="/portal"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-white/40 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Employee portal
              <span aria-hidden="true">&rarr;</span>
            </Link>
            <a
              href="tel:+15626862548"
              className="text-sm font-medium text-[#cfeefc] underline-offset-4 hover:underline"
            >
              Need us now? Call (562) 686-2548
            </a>
          </div>

          {/* staff bypass */}
          <div className="maint-el maint-el-5 mx-auto mt-9 max-w-sm rounded-xl border border-white/15 bg-white/[0.06] p-4 text-left">
            <p className="text-sm font-semibold text-white">Staff bypass</p>
            <p className="mt-1 text-xs leading-relaxed text-white/70">
              Have the bypass password? Enter it to use the site while it&apos;s
              in maintenance.
            </p>
            <BypassForm />
          </div>
        </div>
      </main>

      {/* hazard tape, bottom */}
      <div className="hazard-tape" aria-hidden="true" />
    </div>
  );
}
