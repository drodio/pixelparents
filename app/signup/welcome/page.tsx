import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "You're all set — Pixel Parents",
};

export default function WelcomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-black px-6 text-center text-white">
      <Image
        src="/images/pixel-mascot.png"
        alt="Pixel Parents mascot"
        width={934}
        height={918}
        priority
        className="h-auto w-28"
      />
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        You&apos;re all set. What&apos;s next:
      </h1>
      <p className="max-w-prose text-white/60">
        We are reviewing your profile and confirming your OHS status. You will
        get an email from us.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-full border border-white/20 px-5 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
      >
        Back home
      </Link>
    </main>
  );
}
