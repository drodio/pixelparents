import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getFamilyByInviteToken } from "@/lib/family";
import { getInterestPool } from "@/lib/interests";
import SignupForm from "../../signup-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Join your family — GoPixel",
  description: "Add your information to your family on GoPixel.",
  robots: { index: false, follow: false },
};

// Co-parent join flow: a parent shared their family's invite link. We resolve
// the token → family, then render the normal step-1 form in "join mode" so the
// invitee creates their OWN parent row attached to that existing family. After
// they finish they land on their own /signup/thanks?id=… with the shared kids.
export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const family = await getFamilyByInviteToken(token);

  // Seed the interest picker with the community's existing interests — same as
  // the primary /signup page — so an invited co-parent gets the same suggestions
  // and doesn't re-type near-duplicate spellings of interests that already exist.
  const interestPool = await getInterestPool();

  if (!family) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-black px-6 text-center text-white">
        <h1 className="text-2xl font-semibold">This invite link isn&apos;t valid</h1>
        <p className="max-w-md text-white/55">
          The link may be mistyped or expired. Ask whoever invited you to share it again.
        </p>
        <Link href="/signup" className="text-sm text-amber-400 hover:underline">
          Sign up on your own instead →
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-black px-6 py-12 text-white">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/images/pixel-mascot.png"
            alt="GoPixel mascot"
            width={934}
            height={918}
            priority
            className="h-auto w-24"
          />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Join your family on GoPixel
          </h1>
          <p className="mt-2 max-w-prose text-white/60">
            You&apos;ve been invited to add your own information. Your name, email, and contact
            details are yours; the children your family adds are shared between you.
          </p>
        </div>

        <div className="mt-10">
          <SignupForm joinToken={token} suggestedInterests={interestPool} />
        </div>
      </div>
    </main>
  );
}
