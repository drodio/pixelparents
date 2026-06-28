import Link from "next/link";
import type { Metadata } from "next";
import { listPastEvents, listUpcomingEvents } from "@/lib/events";
import { SiteHeaderNav } from "@/components/SiteHeaderNav";
import { getCurrentViewerContext } from "@/lib/current-viewer";
import { listAllBadges, getBadgesForEvents, type EventBadge } from "@/lib/event-badges-catalog";
import { EventBadgeFilter } from "@/components/events/EventBadgeFilter";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Events · Founder Festival",
  description: "Founder Festival events — recaps, photos, and what we learned.",
};

type EventRow = Awaited<ReturnType<typeof listPastEvents>>[number];

function EventCard({ e, badges }: { e: EventRow; badges: EventBadge[] }) {
  return (
    // Card is a div (not a Link) so the badge pills can be their own links —
    // nesting <a> inside <a> is invalid HTML.
    <div className="group flex flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40 transition-colors hover:border-zinc-700">
      <Link href={`/events/${e.slug}`} className="flex flex-col">
        <div className="aspect-[16/9] w-full overflow-hidden bg-zinc-800">
          {e.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={e.coverUrl}
              alt=""
              className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            />
          ) : (
            <div className="h-full w-full" aria-hidden />
          )}
        </div>
        <div className="flex flex-col gap-1 px-4 pt-4">
          <h3 className="font-display text-lg font-semibold leading-snug">{e.title}</h3>
          <p className="text-sm text-zinc-400">
            {e.startsAt.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
              timeZone: "America/Los_Angeles",
            })}
          </p>
          {e.hostName && <p className="text-xs text-zinc-500">Hosted by {e.hostName}</p>}
        </div>
      </Link>
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-4 pt-2">
          {badges.map((b) => (
            <Link
              key={b.id}
              href={`/events?badge=${b.slug}`}
              className="whitespace-nowrap rounded-md border border-[#dfa43a]/60 bg-[#dfa43a]/10 px-2 py-0.5 text-[11px] text-[#dfa43a] transition-colors hover:bg-[#dfa43a]/20"
            >
              {b.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// Anonymous visitors don't see the upcoming list — events are invite-by-score,
// so we gate it behind a "Check My Score" CTA that drops them on the homepage
// with the find-my-LinkedIn helper open (/?find=1).
function AnonUpcomingCta() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900/40 px-6 py-10 text-center">
      <Link
        href="/?find=1"
        className="rounded-md bg-[#dfa43a] px-6 py-3 font-medium text-black transition-opacity hover:opacity-90"
      >
        Check My Score
      </Link>
      <p className="text-zinc-400">to see which events you qualify for.</p>
    </div>
  );
}

type Props = { searchParams: Promise<{ badge?: string | string[] }> };

export default async function EventsIndexPage({ searchParams }: Props) {
  const sp = await searchParams;
  const selected = (Array.isArray(sp.badge) ? sp.badge : sp.badge ? [sp.badge] : []).filter(Boolean);
  const selectedSet = new Set(selected);

  const [past, upcoming, viewer, allBadges] = await Promise.all([
    listPastEvents(),
    listUpcomingEvents(),
    getCurrentViewerContext(),
    listAllBadges(),
  ]);

  // Badges for every listed event (one query), then optional OR-filter.
  const badgeMap = await getBadgesForEvents([...past, ...upcoming].map((e) => e.id));
  const matches = (e: EventRow) =>
    selectedSet.size === 0 || (badgeMap.get(e.id) ?? []).some((b) => selectedSet.has(b.slug));
  const pastShown = past.filter(matches);
  const upcomingShown = upcoming.filter(matches);
  const filtering = selectedSet.size > 0;

  return (
    <main className="min-h-screen bg-[#151515] px-4 pt-3 pb-8 text-zinc-100 sm:px-6 sm:pt-4 sm:pb-12">
      <header className="mb-10 flex w-full items-center gap-4 sm:gap-6">
        <a
          href="/?home=1"
          aria-label="Founder Festival home"
          className="shrink-0 opacity-90 transition-opacity hover:opacity-100"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/founder-festival-logo.png"
            alt="Founder Festival"
            width={498}
            height={444}
            className="h-auto w-12 sm:w-14"
          />
        </a>
        <SiteHeaderNav currentPage="events" userProfileHref={viewer.profileHref} isAuthed={viewer.isAuthed} />
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <h1 className="text-center font-display text-3xl font-bold tracking-tight sm:text-4xl">Events</h1>

        <div className="flex flex-col gap-8 sm:flex-row sm:gap-10">
          {/* Left filter rail (badges). Hidden entirely until badges exist. */}
          {allBadges.length > 0 && (
            <div className="sm:w-48 sm:shrink-0">
              <EventBadgeFilter badges={allBadges} selected={selected} />
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-10">
            <section className="flex flex-col gap-5">
              <h2 className="font-display text-2xl font-semibold">Upcoming</h2>
              {viewer.isAuthed ? (
                upcomingShown.length > 0 ? (
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {upcomingShown.map((e) => (
                      <EventCard key={e.id} e={e} badges={badgeMap.get(e.id) ?? []} />
                    ))}
                  </div>
                ) : (
                  <p className="text-zinc-500">
                    {filtering ? "No upcoming events match these badges." : "No upcoming events yet."}
                  </p>
                )
              ) : (
                <AnonUpcomingCta />
              )}
            </section>

            <section className="flex flex-col gap-5">
              <h2 className="font-display text-2xl font-semibold">Past events</h2>
              {pastShown.length === 0 ? (
                <p className="text-zinc-500">
                  {filtering ? "No past events match these badges." : "No past events yet."}
                </p>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {pastShown.map((e) => (
                    <EventCard key={e.id} e={e} badges={badgeMap.get(e.id) ?? []} />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
