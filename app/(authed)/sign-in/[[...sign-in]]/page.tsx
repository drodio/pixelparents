import { SignIn } from "@clerk/nextjs";

// Catch-all route ([[...sign-in]]) so Clerk can own its sub-paths (factor-two,
// sso-callback, etc.). Centered so it works as a standalone admin login screen.
export default function SignInPage() {
  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <SignIn />
    </main>
  );
}
