import Image from "next/image";
import Link from "next/link";

// Animated 404 / not-found screen (app/not-found.tsx). The mascot floats, the
// "404" digits glitch on a stagger, and a few stray pixels drift in the
// background. Black / white / amber theme (matching the site).

const FLOATERS = [
  { left: "12%", top: "22%", size: 10, delay: 0 },
  { left: "82%", top: "30%", size: 14, delay: 1.4 },
  { left: "24%", top: "72%", size: 8, delay: 2.1 },
  { left: "70%", top: "68%", size: 12, delay: 0.7 },
  { left: "50%", top: "16%", size: 6, delay: 1.9 },
];

export function NotFoundScreen() {
  return (
    <main className="relative flex min-h-dvh flex-1 flex-col items-center justify-center gap-7 overflow-hidden bg-black px-6 text-center text-white">
      {/* Drifting background pixels */}
      {FLOATERS.map((f, i) => (
        <span
          key={i}
          aria-hidden
          className="pp-float pointer-events-none absolute rounded-[3px] bg-amber-400/50"
          style={{
            left: f.left,
            top: f.top,
            width: f.size,
            height: f.size,
            animationDelay: `${f.delay}s`,
          }}
        />
      ))}

      <Image
        src="/images/pixel-clear.png"
        alt="Pixel, the Stanford OHS mascot, looking around"
        width={247}
        height={253}
        priority
        className="pp-bob h-auto w-32 max-w-[45vw] sm:w-40"
      />

      {/* Glitchy 404 */}
      <div className="flex items-center gap-1.5 sm:gap-3" aria-hidden>
        {["4", "0", "4"].map((d, i) => (
          <span
            key={i}
            className="pp-glitch font-mono text-7xl font-black tabular-nums text-white sm:text-8xl"
            style={{ animationDelay: `${i * 0.25}s`, textShadow: "3px 0 rgba(251,191,36,0.7), -3px 0 rgba(255,255,255,0.22)" }}
          >
            {d}
          </span>
        ))}
      </div>

      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          This page wandered off
        </h1>
        <p className="max-w-md text-white/55">
          We couldn&apos;t find that page. It may have moved, or the link might
          be a stray pixel. Let&apos;s get you back home.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300"
        >
          Take me home
        </Link>
        <Link
          href="/developers"
          className="rounded-full border border-white/20 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          View the docs
        </Link>
      </div>
    </main>
  );
}

export default NotFoundScreen;
