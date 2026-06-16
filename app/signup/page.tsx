import type { Metadata } from "next";
import Image from "next/image";
import SignupForm from "./signup-form";

export const metadata: Metadata = {
  title: "Sign up — Pixel Parents",
  description:
    "Join OHS parents building software to transform the experience for our kids.",
};

export default function SignupPage() {
  return (
    <main className="min-h-dvh bg-black px-6 py-12 text-white">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/images/pixel-mascot.png"
            alt="Pixel Parents mascot"
            width={934}
            height={918}
            priority
            className="h-auto w-24"
          />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Join Pixel Parents
          </h1>
          <p className="mt-2 max-w-prose text-white/60">
            OHS parents building software to make our kids&apos; educational
            experience better. Tell us a bit about you.
          </p>
        </div>

        <div className="mt-10">
          <SignupForm />
        </div>
      </div>
    </main>
  );
}
