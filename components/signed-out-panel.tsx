import Link from "next/link";
import { IconLock } from "@/components/icons";

// The centered "sign in to access" prompt shown inside the grayed DashboardShell
// for unauthenticated visitors. It renders ZERO protected data — callers reach
// this branch before loading any DB/PII — so it's safe for signed-out users.
// `area` names what they'd unlock (e.g. "dashboard", "community", "family").
export function SignedOutPanel({ area }: { area: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-5 rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-400/15 text-amber-300">
          <IconLock className="h-7 w-7" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">
            Sign in to access your {area}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-white/55">
            This is for signed-in GoPixel families. Sign in to unlock your{" "}
            {area} and the rest of the dashboard.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/sign-in?redirect_url=/dashboard"
            className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-full border border-white/15 px-5 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white"
          >
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}
