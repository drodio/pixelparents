export default function VerifiedPage() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-[#151515] text-zinc-100 px-6 py-12 gap-6 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">festival.so</p>
      <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight max-w-xl">
        You&apos;re verified.
      </h1>
      <p className="max-w-md text-zinc-400">
        Festival events are coming soon. We&apos;ll be in touch.
      </p>
    </div>
  );
}
