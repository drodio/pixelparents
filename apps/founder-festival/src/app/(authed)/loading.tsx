// Segment loading UI for the (authed) area. Renders instantly during navigation /
// server data fetch (the pages here do several sequential Neon round-trips), so
// the user gets immediate feedback instead of a blank frame.
export default function AuthedLoading() {
  return (
    <div
      className="flex min-h-[60vh] items-center justify-center px-6 py-24"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-[#dfa43a]" />
      <span className="sr-only">Loading&hellip;</span>
    </div>
  );
}
