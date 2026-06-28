import Link from "next/link";

type Adjacent = { slug: string; title: string } | null;

// Mini-carousel above a past-event recap title: a gold pill for the current
// event, flanked by ‹ / › carats and faded preview pills of the previous / next
// past events. The whole thing wraps around at the ends (prev/next are computed
// with wraparound upstream), so there's always a left and right option when
// more than one past event exists. Pure links — no client JS.
export function EventRecapNav({
  label,
  prev,
  next,
}: {
  label: string;
  prev: Adjacent;
  next: Adjacent;
}) {
  const carat = "shrink-0 px-1 text-lg leading-none text-zinc-400 hover:text-[#dfa43a] transition-colors";
  // Side preview pills: clipped to a fixed width and masked so they fade out on
  // their OUTER edge — only ~70% of the pill shows.
  const previewBase =
    "hidden sm:block max-w-[8.5rem] overflow-hidden whitespace-nowrap rounded-md border border-zinc-700 px-3 py-0.5 text-xs text-zinc-500 opacity-60 hover:opacity-100 transition-opacity";

  return (
    <div className="flex items-center justify-center gap-1.5">
      {prev && (
        <>
          <Link
            href={`/events/${prev.slug}`}
            aria-label={`Previous event: ${prev.title}`}
            className={`${previewBase} [mask-image:linear-gradient(to_right,transparent,black_30%)]`}
          >
            {prev.title}
          </Link>
          <Link href={`/events/${prev.slug}`} aria-label={`Previous event: ${prev.title}`} className={carat}>
            ‹
          </Link>
        </>
      )}

      <span className="shrink-0 rounded-md border border-[#dfa43a] px-3 py-0.5 text-xs text-[#dfa43a]">
        {label}
      </span>

      {next && (
        <>
          <Link href={`/events/${next.slug}`} aria-label={`Next event: ${next.title}`} className={carat}>
            ›
          </Link>
          <Link
            href={`/events/${next.slug}`}
            aria-label={`Next event: ${next.title}`}
            className={`${previewBase} [mask-image:linear-gradient(to_left,transparent,black_30%)]`}
          >
            {next.title}
          </Link>
        </>
      )}
    </div>
  );
}
