// A static skeleton grid that mirrors the real directory Card layout (hero
// block, title bar, two chip rows, thumbnail strip). Rendered as the Suspense /
// loading fallback so the page lays out instantly instead of popping in. Uses
// the shimmer sweep already defined in globals.css (`pp-shimmer`), which is
// itself disabled under prefers-reduced-motion. Pure presentation — no client JS.

// A single shimmering placeholder block. The sweep is an absolutely-positioned
// gradient bar animated by `pp-shimmer`; the parent clips it.
function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-md bg-white/[0.05] ${className}`}>
      <div className="pp-shimmer absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      {/* hero */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-white/[0.05]">
        <div className="pp-shimmer absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
      </div>
      <div className="flex flex-col gap-2.5 p-4">
        <Shimmer className="h-4 w-2/3" />
        <Shimmer className="h-3 w-1/3" />
        <div className="mt-1 flex gap-1.5">
          <Shimmer className="h-6 w-16 rounded-full" />
          <Shimmer className="h-6 w-20 rounded-full" />
        </div>
        <div className="flex gap-1.5">
          <Shimmer className="h-6 w-14 rounded-full" />
          <Shimmer className="h-6 w-12 rounded-full" />
        </div>
        <div className="mt-1 flex gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Shimmer key={i} className="h-12 w-12 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ShowcaseSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))" }}
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
