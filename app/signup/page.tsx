import type { Metadata } from "next";
import SignupForm from "./signup-form";
import { PixelMascot } from "@/components/pixel-mascot";
import { IrlTooltip } from "@/components/irl-tooltip";
import InterestTiles from "./interest-tiles";
import {
  getSignupCount,
  getChildrenCount,
  getInterestsCount,
} from "@/lib/db/signups";
import { getInterestPool } from "@/lib/interests";

export const metadata: Metadata = {
  title: "Sign up — Pixel Parents",
  description:
    "Join OHS parents building software to transform the experience for our kids.",
};

// Always reflect the live signup count.
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  let count = 0;
  let kidsCount = 0;
  let interestsCount = 0;
  let interests: string[] = [];
  try {
    [count, kidsCount, interestsCount, interests] = await Promise.all([
      getSignupCount(),
      getChildrenCount(),
      getInterestsCount(),
      getInterestPool(),
    ]);
  } catch {
    count = 0;
    kidsCount = 0;
    interestsCount = 0;
    interests = [];
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-black px-6 py-12 text-white">
      <InterestTiles interests={interests} variant="strip" />
      <div className="relative z-10 mx-auto w-full max-w-2xl">
        <div className="flex flex-col items-center text-center">
          <PixelMascot widthClass="w-24" href="/" />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            {count > 0 ? (
              <>
                Join <span className="text-amber-400">{count.toLocaleString()}</span>{" "}
                other Pixel Parents
              </>
            ) : (
              "Join Pixel Parents"
            )}
          </h1>
          <h2 className="mt-2 max-w-prose text-xl font-bold text-white/80 sm:text-2xl">
            and connect with{" "}
            <span className="text-amber-400">{kidsCount.toLocaleString()}</span>{" "}
            OHS kids
            <br />
            around{" "}
            <span className="text-amber-400">
              {interestsCount.toLocaleString()}
            </span>{" "}
            shared interests, <IrlTooltip />
          </h2>
        </div>

        <div className="mt-10">
          <SignupForm suggestedInterests={interests} />
        </div>
      </div>
    </main>
  );
}
