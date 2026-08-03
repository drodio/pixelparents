import { SignUp } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";

// Self-hosted Clerk sign-up, mirroring the /sign-in route next door.
//
// This route did not exist before, which is why login "broke": with no
// signUpUrl set, Clerk pointed every "Sign up" link (and any sign-up redirect)
// at its own Account Portal — accounts.gopixel.org, which returns 404, and
// accounts.pixelparents.org, which returns 403. The portal is not provisioned
// for this instance and we don't want it to be: the app already themes and hosts
// its own auth screens. Having a real /sign-up here is what lets ClerkProvider
// pin signUpUrl to an internal path instead of falling back to the dead portal.
//
// Catch-all ([[...sign-up]]) so Clerk owns its sub-paths (verify-email-address,
// sso-callback, continue, …). Same redirect handling as /sign-in: only relative
// paths are honored, to avoid an open redirect.
//
// NOTE: this is the CLERK account (credentials). It is distinct from /signup,
// which is the GoPixel community profile form. New members are sent to /signup
// afterwards so they land in the community flow rather than an empty dashboard.
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { redirect_url } = await searchParams;
  const dest = redirect_url?.startsWith("/") ? redirect_url : "/signup";
  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <SignUp forceRedirectUrl={dest} signInForceRedirectUrl="/dashboard" appearance={clerkAppearance} />
    </main>
  );
}
