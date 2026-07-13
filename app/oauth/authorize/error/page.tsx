import type { Metadata } from "next";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign-in error — GoPixel",
  robots: { index: false, follow: false },
};

// Terminal error page for FATAL authorize failures (unknown client, unregistered
// redirect_uri) where we cannot safely redirect back to the app. Generic by
// design — we never echo attacker-controlled values beyond a short reason code.
export default async function AuthorizeErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const safe = reason === "invalid_client" ? "invalid_client" : "invalid_request";
  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-red-500/5 p-6 sm:p-8">
        <h1 className="text-lg font-semibold text-red-300">This sign-in request can&apos;t be completed</h1>
        <p className="mt-2 text-sm text-white/70">
          The request was misconfigured ({safe}). For your safety we won&apos;t
          continue to the app.
        </p>
        <p className="mt-4 text-xs text-white/40">
          If you reached this from an app, contact that app&apos;s developer.
        </p>
      </div>
    </main>
  );
}
