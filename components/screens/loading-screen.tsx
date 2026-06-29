// Animated loading screen — the Suspense fallback for route segments
// (app/loading.tsx). Pure CSS, no image, so it paints instantly: a 4x4 grid of
// "pixels" rippling in a diagonal wave, a shimmering progress bar, and a
// blinking caret. Matches the site's black / white / amber theme.

const CELLS = Array.from({ length: 16 }, (_, i) => i);

export function LoadingScreen({
  message = "Loading your pixels",
}: {
  message?: string;
}) {
  return (
    <main
      className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-8 bg-black px-6 text-center text-white"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {/* Pixel-wave grid */}
      <div className="pp-pop grid grid-cols-4 gap-2.5">
        {CELLS.map((i) => {
          const row = Math.floor(i / 4);
          const col = i % 4;
          // Diagonal stagger so the ripple travels corner-to-corner.
          const delay = (row + col) * 110;
          return (
            <span
              key={i}
              className="pp-wave-cell h-5 w-5 rounded-[5px] bg-amber-400"
              style={{ animationDelay: `${delay}ms` }}
            />
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-4">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
          {message}
          <span className="pp-blink ml-0.5 inline-block text-amber-400">_</span>
        </p>

        {/* Shimmering progress bar */}
        <div className="relative h-1.5 w-52 max-w-[70vw] overflow-hidden rounded-full bg-white/10">
          <div className="pp-shimmer absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
        </div>
      </div>

      <span className="sr-only">Loading, please wait.</span>
    </main>
  );
}

export default LoadingScreen;
