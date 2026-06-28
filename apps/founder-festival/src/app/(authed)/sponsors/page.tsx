import type { Metadata } from "next";
import Link from "next/link";
import { listSponsors, getEventsForSponsor, sponsorSlug } from "@/lib/sponsors";
import { SiteHeaderNav } from "@/components/SiteHeaderNav";
import { getCurrentViewerContext } from "@/lib/current-viewer";
import { isPastEvent } from "@/lib/event-recap";
import { markdownToText } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sponsors · Founder Festival",
  description: "The organizations that sponsor Founder Festival events.",
};

// First ~N words of the blurb (Markdown stripped), with an ellipsis if longer.
function summarize(blurb: string | null, words = 20): string | null {
  const t = markdownToText(blurb);
  if (!t) return null;
  const parts = t.split(/\s+/);
  return parts.length <= words ? t : parts.slice(0, words).join(" ") + "…";
}

export default async function SponsorsIndexPage() {
  const [allSponsors, viewer] = await Promise.all([listSponsors(), getCurrentViewerContext()]);
  const cards = await Promise.all(allSponsors.map(async (s) => ({ sponsor: s, events: await getEventsForSponsor(s.id) })));

  return (
    <main className="min-h-screen bg-[#151515] text-zinc-100 px-4 sm:px-6 pt-3 pb-8 sm:pt-4 sm:pb-12">
      <header className="flex items-center gap-4 sm:gap-6 w-full mb-8">
        <Link href="/?home=1" aria-label="Founder Festival home" className="opacity-90 hover:opacity-100 transition-opacity shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/founder-festival-logo.png" alt="Founder Festival" width={498} height={444} className="w-12 sm:w-14 h-auto" />
        </Link>
        <SiteHeaderNav currentPage="events" userProfileHref={viewer.profileHref} isAuthed={viewer.isAuthed} eventsAsLink />
      </header>

      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        <h1 className="font-display text-3xl sm:text-5xl font-bold">Sponsors</h1>
        {cards.length === 0 ? (
          <p className="text-sm italic text-zinc-500">No sponsors yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(({ sponsor: s, events }) => {
              const past = events.filter((e) => isPastEvent(e));
              const summary = summarize(s.blurb);
              return (
                <div
                  key={s.id}
                  className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:border-zinc-700"
                >
                  {/* Card body links to the sponsor profile; pills below are their own links. */}
                  <Link href={`/sponsors/${sponsorSlug(s)}`} className="flex flex-col gap-3">
                    {s.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.logoUrl} alt="" className="h-32 w-full rounded-md bg-white/5 object-contain p-3" />
                    ) : (
                      <div className="h-32 w-full rounded-md bg-zinc-800" aria-hidden />
                    )}
                    <div className="font-display text-lg font-semibold">{s.name}</div>
                    {summary && <p className="text-sm leading-relaxed text-zinc-400">{summary}</p>}
                  </Link>
                  {past.length > 0 && (
                    <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                      {past.map((e) => (
                        <Link
                          key={e.id}
                          href={`/events/${e.slug}`}
                          title={e.title}
                          className="block max-w-full truncate rounded-md border border-[#dfa43a]/50 bg-[#dfa43a]/10 px-2 py-0.5 text-[11px] text-[#dfa43a] transition-colors hover:bg-[#dfa43a]/20"
                        >
                          {e.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
