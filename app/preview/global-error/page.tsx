export const metadata = { title: "Global error — preview", robots: { index: false } };

// app/global-error.tsx renders its own <html>/<body>, so it can't be embedded
// directly. This reproduces its inner visual (spinning ring + pulsing pixel
// core) inside a normal page so the design is viewable. The real screen only
// appears when the ROOT layout itself throws.
export default function GlobalErrorPreview() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 bg-black px-6 text-center text-white">
      <div className="relative h-24 w-24">
        <div
          className="absolute inset-0 rounded-full border-[3px] border-white/10"
          style={{ borderTopColor: "#fbbf24", animation: "pp-ge-spin 1.1s linear infinite" }}
        />
        <div
          className="pp-glow absolute inset-[30px] rounded-lg bg-amber-400"
        />
      </div>
      <style>{`@keyframes pp-ge-spin { to { transform: rotate(360deg); } }`}</style>

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="max-w-md text-white/55">
          GoPixel hit an unexpected error. Try reloading — if it keeps
          happening, please let us know.
        </p>
      </div>

      <button
        type="button"
        className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-semibold text-black"
      >
        Reload
      </button>
      <p className="text-xs text-white/40">
        (Preview only — the live screen replaces the entire page on a root-layout
        failure.)
      </p>
    </main>
  );
}
