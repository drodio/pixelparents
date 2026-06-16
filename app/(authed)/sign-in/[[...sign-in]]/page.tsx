import { SignIn } from "@clerk/nextjs";

// Catch-all route ([[...sign-in]]) so Clerk can own its sub-paths (factor-two,
// sso-callback, etc.). Centered so it works as a standalone login screen.
//
// Honors a `redirect_url` query param (e.g. the /developers "Request API access"
// CTA sends visitors here with ?redirect_url=/account). Only relative paths are
// allowed, to avoid an open redirect. Falls back to Clerk's default otherwise.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { redirect_url } = await searchParams;
  const dest = redirect_url?.startsWith("/") ? redirect_url : undefined;
  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <SignIn forceRedirectUrl={dest} signUpForceRedirectUrl={dest} />
    </main>
  );
}
