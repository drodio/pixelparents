import Link from "next/link";

export const metadata = {
  title: "Alumni access is paused — GoPixel",
  description:
    "GoPixel is focusing on current OHS families first. Alumni accounts are paused, not deleted.",
};

const linkCls =
  "text-amber-400 underline decoration-amber-400/60 underline-offset-2 transition-colors hover:text-amber-300";

// Public landing spot for the (authed) layout's alumni gate. Lives OUTSIDE the
// (authed) route group on purpose: the gate redirects here, so this page must
// never itself be gated or the redirect would loop.
export default function AlumniPausedPage() {
  return (
    <div className="flex flex-1 flex-col bg-black px-5 py-16 text-white sm:px-6 sm:py-24">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <Link href="/" className={`${linkCls} text-sm`}>
            ← Back to GoPixel
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">
            Alumni access is paused for now
          </h1>
        </header>
        <div className="flex flex-col gap-4 text-white/75">
          <p>
            GoPixel is early, and we&apos;re focusing first on the people the
            platform was built around: current OHS families — parents, guardians,
            and enrolled students.
          </p>
          <p>
            Your account and anything you&apos;ve saved are <strong>paused, not
            deleted</strong>. When we open GoPixel up to alumni, signing back in
            will pick up right where you left off.
          </p>
          <p>
            Think this is a mistake — for example, you&apos;re also the parent of
            a current OHS student? Use the{" "}
            <Link href="/report" className={linkCls}>
              contact form
            </Link>{" "}
            and we&apos;ll sort it out.
          </p>
        </div>
      </div>
    </div>
  );
}
