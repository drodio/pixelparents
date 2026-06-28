import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { slugify } from "@/lib/slugify";
import { listSponsors, getSponsorPeopleRows, getEventsForSponsor, type Sponsor } from "@/lib/sponsors";
import { ProfileMiniTable } from "@/components/events/ProfileMiniTable";
import { EventLinkPills } from "@/components/events/EventLinkPills";
import { SiteHeaderNav } from "@/components/SiteHeaderNav";
import { getCurrentViewerContext } from "@/lib/current-viewer";
import { markdownToHtml } from "@/lib/markdown";

const PROSE = "prose-recap max-w-xl text-left leading-relaxed text-zinc-300 [&_a]:text-[#dfa43a] [&_a]:underline [&_h1]:font-display [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_p]:my-2";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

// Sponsors have no slug column — resolve by slugified name (e.g. "Acme Capital"
// → /sponsors/acme-capital). First match wins on the rare name collision.
async function resolveSponsor(slug: string): Promise<Sponsor | null> {
  const all = await listSponsors();
  return all.find((s) => slugify(s.name) === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const sponsor = await resolveSponsor(slug);
  if (!sponsor) return {};
  return { title: `${sponsor.name} · Founder Festival`, description: sponsor.blurb ?? undefined };
}

export default async function SponsorPage({ params }: PageProps) {
  const { slug } = await params;
  const sponsor = await resolveSponsor(slug);
  if (!sponsor) notFound();

  const [rows, sponsoredEvents, viewer] = await Promise.all([
    getSponsorPeopleRows(sponsor.id),
    getEventsForSponsor(sponsor.id),
    getCurrentViewerContext(),
  ]);

  return (
    <main className="min-h-screen bg-[#151515] text-zinc-100 px-4 sm:px-6 pt-3 pb-8 sm:pt-4 sm:pb-12">
      <header className="flex items-center gap-4 sm:gap-6 w-full mb-8">
        <Link
          href="/?home=1"
          aria-label="Founder Festival home"
          className="opacity-90 hover:opacity-100 transition-opacity shrink-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/founder-festival-logo.png"
            alt="Founder Festival"
            width={498}
            height={444}
            className="w-12 sm:w-14 h-auto"
          />
        </Link>
        <SiteHeaderNav
          currentPage="events"
          userProfileHref={viewer.profileHref}
          isAuthed={viewer.isAuthed}
          eventsAsLink
        />
      </header>

      <div className="max-w-2xl mx-auto flex flex-col gap-8">
        <header className="flex flex-col items-center gap-4 text-center">
          {sponsor.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sponsor.logoUrl}
              alt={sponsor.name}
              className="w-4/5 h-auto rounded-2xl object-contain"
            />
          ) : (
            <div className="aspect-square w-4/5 rounded-2xl bg-zinc-800" aria-hidden />
          )}
          <h1 className="font-display text-3xl sm:text-5xl font-bold">{sponsor.name}</h1>
          {sponsor.blurb && <div className={PROSE} dangerouslySetInnerHTML={{ __html: markdownToHtml(sponsor.blurb) }} />}
          {sponsor.websiteUrl && (
            <a
              href={sponsor.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-[#dfa43a]/50 px-4 py-2 text-sm font-medium text-[#dfa43a] transition-colors hover:bg-[#dfa43a]/10"
            >
              Visit website
            </a>
          )}
        </header>

        {sponsoredEvents.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-2xl font-semibold">Events sponsored</h2>
            <EventLinkPills events={sponsoredEvents} />
          </section>
        )}

        {rows.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-2xl font-semibold">People</h2>
            <ProfileMiniTable rows={rows} isClaimed={!!viewer.ownEvaluationId} blurUnclaimed={false} />
          </section>
        )}
      </div>
    </main>
  );
}
