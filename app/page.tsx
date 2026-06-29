import Link from "next/link";
import InterestTiles from "./signup/interest-tiles";
import { PixelMascot } from "@/components/pixel-mascot";
import { IrlTooltip } from "@/components/irl-tooltip";
import {
  getSignupCount,
  getChildrenCount,
  getInterestsCount,
  getBuilderCounts,
} from "@/lib/db/signups";
import { getInterestPool } from "@/lib/interests";

// Reflect live counts + interests.
export const dynamic = "force-dynamic";

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

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-black px-6 py-12 text-center">
      <InterestTiles interests={interests} variant="fade" />

      <Link
        href="/sign-in"
        className="absolute right-4 top-4 z-20 rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-black shadow-sm transition-colors hover:bg-amber-300 sm:right-6 sm:top-6"
      >
        Log in
      </Link>

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
      </div>

      <footer className="relative z-10 mt-8 text-center text-sm text-white/50">
        Created with{" "}
        <span aria-label="love" role="img">
          ❤️
        </span>{" "}
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
