import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { readApprovalStatus } from "@/lib/approval";
import { getVerifyState } from "@/app/signup/thanks/verify-actions";
import { StudentVerify } from "@/components/student-verify";
import { PixelMascot } from "@/components/pixel-mascot";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verify your OHS student — Pixel Parents",
  robots: { index: false, follow: false },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-black text-white">
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        <header className="mb-8 flex items-center gap-4">
          <PixelMascot widthClass="w-14" href="/" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Verify your OHS student</h1>
            <p className="mt-1 text-sm text-white/55">
              Confirm you&apos;re an OHS family with your student&apos;s Stanford email.
            </p>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string }>;
}) {
  const viewer = await currentUser();
  if (!viewer) redirect("/sign-in");

  // The forced-verification gate (FAMILY_FORCE_VERIFY) redirects here with
  // ?required=1. In that mode we show a "Verify to continue" banner and suppress
  // any "verify later" escape hatch — the family must verify to proceed.
  const { required } = await searchParams;
  const isRequired = required === "1";

  const email = primaryEmail(viewer);
  const signup = email ? await getSignupByEmail(email) : null;

  // Signed in, but no signup on file — not a Pixel Parents family yet.
  if (!signup) {
    return (
      <Shell>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
          <h2 className="text-lg font-semibold">We don&apos;t have a signup for this account</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
            Sign up as a Pixel Parents family first — then you can verify your OHS
            student and unlock the directory.
          </p>
          <Link
            href="/signup"
            className="mt-5 inline-block rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
          >
            Join Pixel Parents
          </Link>
        </div>
      </Shell>
    );
  }

  const status = readApprovalStatus((signup.extra ?? {}) as Record<string, unknown>);
  const state = await getVerifyState(signup.id);

  return (
    <Shell>
      {status === "denied" ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8">
          <h2 className="text-lg font-semibold">Your family&apos;s access was declined</h2>
          <p className="mt-2 text-sm text-white/55">
            If you think this is a mistake, reach out to a Pixel Parents admin.
          </p>
        </div>
      ) : (
        <>
          {isRequired && status !== "approved" && (
            <div className="mb-5 rounded-2xl border border-amber-400/40 bg-amber-400/[0.08] p-4">
              <h2 className="text-sm font-semibold text-amber-200">
                Verify your OHS student to continue
              </h2>
              <p className="mt-1 text-sm text-white/65">
                Your family needs a verified OHS student to access Pixel Parents.
                Confirm your student&apos;s Stanford email below to unlock the rest
                of the site.
              </p>
            </div>
          )}
          <StudentVerify signupId={signup.id} initial={state} />
          {status === "approved" && (
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
              >
                Open dashboard
              </Link>
              <Link
                href="/community"
                className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Community
              </Link>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
