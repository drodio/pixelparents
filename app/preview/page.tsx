import Link from "next/link";

// Dev/preview gallery for the status screens, so each can be viewed at a stable
// URL. Disallowed in robots.ts. Safe to delete before merge if you don't want
// it shipping to production.

export const metadata = {
  title: "Status screen previews",
  robots: { index: false, follow: false },
};

const SCREENS = [
  {
    href: "/preview/loading",
    label: "Loading",
    desc: "The Suspense fallback (app/loading.tsx) — pixel-wave grid + shimmer bar.",
  },
  {
    href: "/preview/not-found",
    label: "404 / Not found",
    desc: "app/not-found.tsx — floating mascot + glitchy 404. Any unknown URL shows this too.",
  },
  {
    href: "/preview/error",
    label: "Error",
    desc: "app/error.tsx — rattled mascot + scanline. Retry + go-home.",
  },
  {
    href: "/preview/throw",
    label: "Error (live boundary)",
    desc: "Throws on render to trigger the REAL error boundary end-to-end.",
  },
  {
    href: "/preview/global-error",
    label: "Global error",
    desc: "app/global-error.tsx look — root-layout failure fallback (self-contained).",
  },
];

export default function PreviewIndex() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-8 bg-black px-6 py-16 text-white">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Status screens
        </h1>
        <p className="mt-2 text-white/55">Preview gallery — pick one to view.</p>
      </div>

      <ul className="flex w-full max-w-xl flex-col gap-3">
        {SCREENS.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="group flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 transition hover:border-amber-400/50 hover:bg-white/[0.06]"
            >
              <div>
                <div className="font-semibold text-white group-hover:text-amber-400">
                  {s.label}
                </div>
                <div className="mt-0.5 text-sm text-white/50">{s.desc}</div>
              </div>
              <span className="shrink-0 text-amber-400 transition group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
