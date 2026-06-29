"use client";

import Image from "next/image";
import Link from "next/link";

// Animated error screen, shared by app/error.tsx (route error boundary) and the
// preview route. Friendly, not alarming: the mascot does a gentle "rattled"
// shake, with a Try-again (calls the boundary's reset,
// or reloads) and a Go-home escape hatch. Black / white / amber theme.

export function ErrorScreen({
  reset,
  digest,
  title = "Something glitched",
  message = "A pixel slipped out of place on our end. This isn't your fault — give it another try, and if it keeps happening, head home.",
}: {
  reset?: () => void;
  digest?: string;
  title?: string;
  message?: string;
}) {
  const retry = reset ?? (() => window.location.reload());

  return (
    <main className="relative flex min-h-dvh flex-1 flex-col items-center justify-center gap-7 overflow-hidden bg-black px-6 text-center text-white">
      <Image
        src="/images/pixel-clear.png"
        alt="Pixel, the Stanford OHS mascot, looking rattled"
        width={247}
        height={253}
        priority
        className="pp-shake h-auto w-32 max-w-[45vw] sm:w-40"
      />

      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <p className="max-w-md text-white/55">{message}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={retry}
          className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-white/20 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Go home
        </Link>
      </div>

      {digest && (
        <p className="font-mono text-xs text-white/30">Reference: {digest}</p>
      )}
    </main>
  );
}

export default ErrorScreen;
