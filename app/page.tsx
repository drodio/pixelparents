import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import InterestTiles from "./signup/interest-tiles";
import { PixelMascot } from "@/components/pixel-mascot";
import { IrlTooltip } from "@/components/irl-tooltip";
import { IconHeart, IconArrowRight } from "@/components/icons";
import { isAdminEmail } from "@/lib/admin";
import {
  getSignupCount,
  getChildrenCount,
  getInterestsCount,
  getBuilderCounts,
} from "@/lib/db/signups";
import { getInterestPool } from "@/lib/interests";

// Reflect live counts + interests.
export const dynamic = "force-dynamic";

// Top-right corner button (Log in / Admin) — gold, 8px corners (rounded-lg).
const cornerBtnCls =
  "absolute right-4 top-4 z-20 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black shadow-sm transition-colors hover:bg-amber-300 sm:right-6 sm:top-6";

export default async function Home() {
  let count = 0;
  let kidsCount = 0;
  let interestsCount = 0;
  let interests: string[] = [];
  let builders = { technical: 0, curious: 0 };
  try {
    [count, kidsCount, interestsCount, interests, builders] = await Promise.all([
      getSignupCount(),
      getChildrenCount(),
      getInterestsCount(),
      getInterestPool(),
      getBuilderCounts(),
    ]);
  } catch {
    count = 0;
    kidsCount = 0;
    interestsCount = 0;
    interests = [];
    builders = { technical: 0, curious: 0 };
  }

  // Read auth server-side so the public splash never loads Clerk JS. auth() is a
  // cheap cookie read; only fetch the full user (a Clerk API call) when signed
  // in, so logged-out visitors — the common case here — pay nothing extra.
  let signedIn = false;
  let isAdmin = false;
  try {
    const { userId } = await auth();
    signedIn = Boolean(userId);
    if (userId) {
      const user = await currentUser();
      isAdmin = await isAdminEmail(user?.primaryEmailAddress?.emailAddress);
    }
  } catch {
    signedIn = false;
    isAdmin = false;
  }

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-black px-6 py-12 text-center">
      <InterestTiles interests={interests} variant="fade" />

      {isAdmin ? (
        // Signed-in admins get a quick link into the admin area.
        <Link href="/admin" className={cornerBtnCls}>
          Admin
        </Link>
      ) : signedIn ? null : (
        // Logged-out visitors get a Log in button → /directory after sign-in.
        <Link href="/sign-in?redirect_url=/dashboard" className={cornerBtnCls}>
          Log in
        </Link>
      )}

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6">
        <PixelMascot widthClass="w-48 max-w-[80vw] sm:w-64" />
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">
          <Link
            href="/signup"
            className="text-amber-400 underline decoration-amber-400/60 underline-offset-4 transition-colors hover:text-amber-300"
          >
            Sign up
          </Link>{" "}
          to Join{" "}
          <span className="text-amber-400">{count.toLocaleString()}</span> other
          Pixel Parents
        </h1>
        <h2 className="max-w-prose text-xl font-bold text-white/80 sm:text-2xl">
          and connect with{" "}
          <span className="text-amber-400">{kidsCount.toLocaleString()}</span> OHS
          kids
          <br />
          around{" "}
          <span className="text-amber-400">{interestsCount.toLocaleString()}</span>{" "}
          shared interests, <IrlTooltip />
        </h2>
        {signedIn && (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-3 text-base font-semibold text-black shadow-sm transition hover:bg-amber-300"
          >
            Open dashboard <IconArrowRight className="h-5 w-5" />
          </Link>
        )}
      </div>

      <footer className="relative z-10 mt-8 text-center text-sm text-white/50">
        Created with{" "}
        <IconHeart className="inline-block h-4 w-4 -translate-y-px text-red-400" title="love" />{" "}
        by <span className="text-amber-400">{builders.technical.toLocaleString()}</span>{" "}
        technical parents and{" "}
        <span className="text-amber-400">{builders.curious.toLocaleString()}</span>{" "}
        non-technical parents learning to become builders.{" "}
        <Link
          href="/builders"
          className="text-amber-400 underline decoration-amber-400/60 underline-offset-2 transition-colors hover:text-amber-300"
        >
          Learn more about us
        </Link>
        .
      </footer>
    </main>
  );
}
