import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getEventBySlug, getEventPhotos, getEventAnalytics, getEventAttendeeRows, listPastEvents } from "@/lib/events";
import { isPastEvent, canViewPhoto, photoLockLabel, sanitizeRecapHtml, descriptionToHtml } from "@/lib/event-recap";
import { PhotoCarousel, type CarouselPhoto } from "@/components/events/PhotoCarousel";
import { AttendeePhotoUpload } from "@/components/events/AttendeePhotoUpload";
import { EventAnalyticsSection } from "@/components/events/EventAnalyticsSection";
import { ClaimFadeGate } from "@/components/events/ClaimFadeGate";
import { EventRecapNav } from "@/components/events/EventRecapNav";
import { getBadgesForEvent } from "@/lib/event-badges-catalog";
import { PersonalizedLearnings } from "@/components/events/PersonalizedLearnings";
import { RecommendedConnections } from "@/components/events/RecommendedConnections";
import { getStoredPersonalizedForViewer } from "@/lib/personalized-store";
import { getStoredConnectionsForViewer } from "@/lib/recommended-connections-store";
import { preferredFirstName } from "@/lib/preferred-name";
import { AttendeesTable, type Conn } from "@/components/events/AttendeesTable";
import { EventChat } from "@/components/events/chat/EventChat";
import { SiteHeaderNav } from "@/components/SiteHeaderNav";
import { SectionHeading } from "@/components/SectionHeading";
import { SectionAnchors } from "@/components/SectionAnchors";
import { getCurrentViewerContext } from "@/lib/current-viewer";
import { can } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { AdminProfileBox } from "@/components/AdminProfileBox";
import { getHostsForEvent, getHostPeopleRows, hostSlug } from "@/lib/hosts";
import { getSponsorsForEvent, getSponsorPeopleRows } from "@/lib/sponsors";
import { slugify } from "@/lib/slugify";
import { markdownToHtml, htmlToText } from "@/lib/markdown";
import { ClampedHtml } from "@/components/events/ClampedHtml";
import { ProfileMiniTable } from "@/components/events/ProfileMiniTable";
import { getViewerAttendeeContext } from "@/lib/attendee";
import {
  getEventDirectory,
  listIncomingRequests,
  getConnectionPreferences,
  connectionChoiceForScope,
} from "@/lib/attendee-connections";
import { ConnectionInbox } from "@/components/events/ConnectionInbox";
import { EventConnectionPref } from "@/components/events/EventConnectionPref";

// Prose styling for the event description (rendered HTML).
const DESC_PROSE =
  "prose-recap text-zinc-300 leading-relaxed break-words [&_a]:text-[#dfa43a] [&_a]:underline [&_h1]:font-display [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_p]:my-2";

// Markdown prose styling for a host/sponsor "About" inside an event card.
const CARD_PROSE =
  // [&_a_strong]: the linked host/sponsor NAME (a gold link wrapping bold text) —
  // without this, [&_strong]:text-zinc-100 would override the link color and the
  // name would render white instead of gold.
  "prose-recap text-sm leading-relaxed text-zinc-400 [&_a]:text-[#dfa43a] [&_a]:underline [&_a_strong]:text-[#dfa43a] [&_strong]:font-semibold [&_strong]:text-zinc-100 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_p]:my-1";

// "[Name]: [About]" as Markdown — the bold name sits inline before the
// description (rendered together so it flows on the same line). When `href` is
// given, the name becomes a gold link to that host/sponsor page (mirrors the
// already-clickable logo). Brackets in the name are escaped so they can't break
// the Markdown link syntax.
function aboutWithName(name: string, blurb: string | null, href?: string): string {
  const b = blurb?.trim();
  const label = b ? `${name}:` : name;
  // Only linkify when href is a clean internal path — no whitespace or ")" that
  // would break Markdown link syntax (`](url)`). Callers pass /hosts|/sponsors/
  // <slug>; anything malformed degrades to a plain bold name rather than emitting
  // broken markup. Brackets in the label are escaped for the same reason.
  const safeHref = href && /^\/[^\s)]*$/.test(href) ? href : null;
  const namePart = safeHref ? `[**${label.replace(/[[\]]/g, "\\$&")}**](${safeHref})` : `**${label}**`;
  return b ? `${namePart} ${b}` : namePart;
}

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) return {};
  // Social-card image: prefer an actual event photo (first PUBLIC recap photo)
  // over the cover — many Luma covers are just the FF logo, and the ask is to
  // preview the real event. Fall back to the cover when there are no photos yet
  // (e.g. upcoming events).
  const photos = await getEventPhotos(event.id);
  const firstPhoto = photos.find((p) => p.visibility === "public")?.blobUrl ?? null;
  const ogImage = firstPhoto ?? event.coverUrl ?? null;
  // event.description is stored as HTML — strip tags so the social-card / link
  // preview shows readable text, not raw "<p><strong>…" markup. Cap at ~200
  // chars (the usable OG description length) with an ellipsis.
  const descText = htmlToText(event.description);
  const description = descText ? (descText.length > 200 ? `${descText.slice(0, 197).trimEnd()}…` : descText) : undefined;
  return {
    title: `${event.title} · Founder Festival`,
    description,
    openGraph: ogImage ? { images: [ogImage] } : undefined,
    twitter: ogImage ? { card: "summary_large_image", images: [ogImage] } : undefined,
  };
}

// Connection data for an attendee viewer: per-attendee connection state (keyed
// by evaluation id), pending incoming requests, and this event's saved choice.
async function loadConnectionData(eventId: string, viewerEvalId: string) {
  const [directory, incoming, prefs] = await Promise.all([
    getEventDirectory(eventId, viewerEvalId),
    listIncomingRequests(eventId, viewerEvalId),
    getConnectionPreferences(viewerEvalId),
  ]);
  const connectionByEval: Record<string, Conn> = {};
  for (const d of directory) {
    connectionByEval[d.evaluationId] = { status: d.connectionStatus, contact: d.contact };
  }
  return {
    connectionByEval,
    incoming: incoming.map((r) => ({ id: r.id, fromName: r.fromName })),
    eventChoice: connectionChoiceForScope(prefs, eventId),
  };
}

// "Thursday, July 2 4PM-8PM PT • San Mateo, CA". Start–end time range in
// Pacific (compact: drops :00 and the space before AM/PM); location appended
// when set.
function EventDate({
  startsAt,
  endsAt,
  location,
}: {
  startsAt: Date;
  endsAt?: Date | null;
  location?: string | null;
}) {
  const datePart = startsAt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });
  const t = (d: Date) =>
    d
      .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })
      .replace(":00", "")
      .replace(" ", "");
  const time = endsAt ? `${t(startsAt)}-${t(endsAt)}` : t(startsAt);
  const loc = location?.trim();
  return (
    <p className="text-zinc-300">
      {datePart} {time} PT{loc ? ` • ${loc}` : ""}
    </p>
  );
}

export default async function EventPage({ params }: PageProps) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event || event.status === "draft") notFound();

  const past = isPastEvent(event);
  const viewer = await getCurrentViewerContext();

  // Admins who can manage THIS event get a floating "Edit event" pill (the same
  // bottom-left admin toolbar used on profile pages) linking to its admin page.
  const canEditEvent = (await can("manage_events")) && (await canAccessEvent(event.id));

  // For past events, build the prev/next mini-carousel (wraps around so there's
  // always a left + right option when more than one past event exists).
  let navPrev: { slug: string; title: string } | null = null;
  let navNext: { slug: string; title: string } | null = null;
  if (past) {
    const pastList = await listPastEvents();
    const idx = pastList.findIndex((e) => e.id === event.id);
    if (idx !== -1 && pastList.length > 1) {
      const n = pastList.length;
      const p = pastList[(idx - 1 + n) % n]!;
      const nx = pastList[(idx + 1) % n]!;
      navPrev = { slug: p.slug, title: p.title };
      navNext = { slug: nx.slug, title: nx.title };
    }
  }
  const pastLabel = `Past Event: ${event.startsAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  })}`;

  const eventBadgeList = await getBadgesForEvent(event.id);

  return (
    <main className="min-h-screen bg-[#151515] text-zinc-100 px-4 sm:px-6 pt-3 pb-8 sm:pt-4 sm:pb-12">
      {/* Per-section copy-link anchors + ?section= deep-link scrolling. */}
      <SectionAnchors />
      {canEditEvent && (
        <AdminProfileBox>
          <a href={`/admin/events/${event.id}`} className="text-[#dfa43a] hover:text-amber-200 transition-colors">
            Edit event
          </a>
        </AdminProfileBox>
      )}
      {/* Shared top header (logo + nav + search), full-width + left-aligned to
          match /profile and /leaderboard. Kept OUTSIDE the centered content
          column so the logo/nav hug the page's left edge. */}
      <header className="flex items-center gap-4 sm:gap-6 w-full mb-8">
        <a
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
        </a>
        <SiteHeaderNav
          currentPage="events"
          userProfileHref={viewer.profileHref}
          isAuthed={viewer.isAuthed}
          eventsAsLink
        />
      </header>

      <div className="max-w-2xl mx-auto flex flex-col gap-8">
        <header className="flex flex-col gap-3 text-center">
          {past && <EventRecapNav label={pastLabel} prev={navPrev} next={navNext} />}
          <h1 className="font-display text-3xl sm:text-5xl font-bold">{event.title}</h1>
          {eventBadgeList.length > 0 && (
            <div className="flex flex-row flex-wrap items-center justify-center gap-1.5">
              {eventBadgeList.map((b) => (
                <a
                  key={b.id}
                  href={`/events?badge=${b.slug}`}
                  className="whitespace-nowrap rounded-md border border-[#dfa43a]/60 bg-[#dfa43a]/10 px-2.5 py-0.5 text-xs text-[#dfa43a] transition-colors hover:bg-[#dfa43a]/20"
                >
                  {b.name}
                </a>
              ))}
            </div>
          )}
          {event.hostName && <p className="text-zinc-400">Hosted by {event.hostName}</p>}
          {/* Upcoming events keep the full date/time below the title; past events
              show the date in the pill above instead. */}
          {!past && <EventDate startsAt={event.startsAt} endsAt={event.endsAt} location={event.location} />}
        </header>

        {/* Upcoming events keep the "Apply to attend" CTA; everything else
            (description, hosts, sponsors, analytics/spider-graphs, chat,
            attendees, learnings) renders for BOTH upcoming and past via the
            shared Recap structure — recap-only sections (photos, learnings)
            self-hide when empty. */}
        {!past && (
          <a
            href={`/events/${event.slug}/apply`}
            className="self-center rounded-md bg-[#dfa43a] text-black font-medium px-6 py-3 hover:opacity-90 transition-opacity"
          >
            Apply to attend
          </a>
        )}
        <Recap event={event} />
      </div>
    </main>
  );
}

// "Hosted by" — host cards (icon + name + blurb + their people mini-table).
// Shown on BOTH upcoming events and past-event recaps. Returns null when the
// event has no hosts.
async function HostsSection({ eventId, isClaimed }: { eventId: string; isClaimed: boolean }) {
  const hostList = await getHostsForEvent(eventId);
  if (hostList.length === 0) return null;
  const hostsWithPeople = await Promise.all(
    hostList.map(async (h) => ({ host: h, rows: await getHostPeopleRows(h.id) })),
  );
  return (
    <section className="flex flex-col gap-4">
      <SectionHeading label="Hosted by" className="font-display text-2xl font-semibold" />
      <div className="flex flex-col gap-5">
        {hostsWithPeople.map(({ host: h, rows }) => {
          const href = `/hosts/${hostSlug(h)}`;
          return (
            <div key={h.id} className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="flex items-start gap-4">
                {/* Column 1: host logo (fixed 200px box → the About clamps to it). */}
                <a href={href} className="shrink-0 hover:opacity-90">
                  {h.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.iconUrl} alt="" className="h-[200px] w-[200px] rounded object-contain" />
                  ) : (
                    <div className="h-[200px] w-[200px] rounded bg-zinc-800" aria-hidden />
                  )}
                </a>
                {/* Column 2: "[Name]: [About]" inline, clamped to the image height
                    with a "… Read more". */}
                <div className="min-w-0 flex-1">
                  <ClampedHtml html={markdownToHtml(aboutWithName(h.name, h.blurb, href))} maxHeight={200} className={CARD_PROSE} />
                </div>
              </div>
              {/* Host's people as a mini leaderboard table (names public — never blurred). */}
              <ProfileMiniTable rows={rows} isClaimed={isClaimed} blurUnclaimed={false} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

// "Sponsors" — sponsor cards (logo + name + blurb + their people mini-table).
// Shown on BOTH upcoming events and past-event recaps. Returns null when none.
async function SponsorsSection({ eventId, isClaimed }: { eventId: string; isClaimed: boolean }) {
  const sponsorList = await getSponsorsForEvent(eventId);
  if (sponsorList.length === 0) return null;
  const sponsorsWithPeople = await Promise.all(
    sponsorList.map(async (s) => ({ sponsor: s, rows: await getSponsorPeopleRows(s.id) })),
  );
  return (
    <section className="flex flex-col gap-4">
      <SectionHeading label="Sponsors" className="font-display text-2xl font-semibold" />
      <div className="flex flex-col gap-5">
        {sponsorsWithPeople.map(({ sponsor: s, rows }) => {
          const href = `/sponsors/${slugify(s.name)}`;
          return (
            <div key={s.id} className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="flex items-start gap-4">
                {/* Column 1: sponsor logo (fixed box → the About clamps to it). */}
                <a href={href} className="shrink-0 hover:opacity-90">
                  {s.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.logoUrl} alt="" className="h-20 w-32 rounded bg-white/5 object-contain" />
                  ) : (
                    <div className="h-20 w-32 rounded bg-zinc-800" aria-hidden />
                  )}
                </a>
                {/* Column 2: "[Name]: [About]" inline, clamped to the image height
                    with a "… Read more". */}
                <div className="min-w-0 flex-1">
                  <ClampedHtml html={markdownToHtml(aboutWithName(s.name, s.blurb, href))} maxHeight={80} className={CARD_PROSE} />
                </div>
              </div>
              {/* Sponsor's people as a mini leaderboard table (names public — never blurred). */}
              <ProfileMiniTable rows={rows} isClaimed={isClaimed} blurUnclaimed={false} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

async function Recap({
  event,
}: {
  event: Awaited<ReturnType<typeof getEventBySlug>> & {};
}) {
  if (!event) return null;
  const [allPhotos, analytics, viewer, attendeeRows] = await Promise.all([
    getEventPhotos(event.id),
    getEventAnalytics(event.id),
    getViewerAttendeeContext(event.id),
    getEventAttendeeRows(event.id),
  ]);
  // Unclaimed visitors (anonymous or signed-in-without-a-profile) see long
  // content clamped with a "Claim your profile" fade.
  const unclaimed = !viewer.evaluationId;
  // 3-tier photos: public / claimed / attendees. Photos the viewer can't access
  // aren't hidden — they're shown blurred + locked (a teaser) with a tier label.
  // Once an admin opens the event, the Luma cover is materialized as a real photo
  // row (so they can reorder/caption it). Only prepend event.coverUrl as a virtual
  // first slide while it isn't yet part of the photo set, to avoid a duplicate.
  const coverIsPhoto = !!event.coverUrl && allPhotos.some((p) => p.blobUrl === event.coverUrl);
  const slides: CarouselPhoto[] = [
    ...(event.coverUrl && !coverIsPhoto ? [{ url: event.coverUrl, caption: null }] : []),
    ...allPhotos.map((p) => {
      const locked = !canViewPhoto(p.visibility, { isClaimed: !unclaimed, isAttendee: viewer.isAttendee });
      const addedByHref =
        p.uploaderSlug && p.uploaderSlugKind ? `/profile/${p.uploaderSlugKind}/${p.uploaderSlug}` : null;
      return {
        url: p.blobUrl,
        caption: locked ? null : p.caption,
        addedByName: locked ? null : p.uploaderName,
        addedByHref: locked ? null : addedByHref,
        locked,
        lockLabel: locked ? photoLockLabel(p.visibility) : undefined,
      };
    }),
  ];

  const learnings = sanitizeRecapHtml(event.learningsPublic);
  // Members-only tier: any claimed member (incl. attendees) — gated on a claimed profile.
  const memberLearnings = !unclaimed ? sanitizeRecapHtml(event.learningsMembers) : "";
  const attendeeLearnings = viewer.isAttendee ? sanitizeRecapHtml(event.learningsAttendees) : "";
  // Name for the "Personalized Learnings for <name>" heading (claimed members only).
  const personalFirstName =
    !unclaimed && viewer.evaluationId ? await preferredFirstName(viewer.evaluationId) : null;
  // Personalized learnings are shown ONLY when they've already been generated on
  // the backend (admin run) for this viewer — no on-demand generation.
  const personalLearnings =
    !unclaimed && viewer.evaluationId
      ? sanitizeRecapHtml((await getStoredPersonalizedForViewer(event.id, viewer.evaluationId))?.html ?? null)
      : "";
  // Recommended Connections ("Attendee Insights") — same gating as personalized:
  // claimed member, shown only when generated on the backend for this viewer.
  const connectionsInsights =
    !unclaimed && viewer.evaluationId
      ? sanitizeRecapHtml((await getStoredConnectionsForViewer(event.id, viewer.evaluationId))?.html ?? null)
      : "";

  // Connection data (folded into the Attendees section) — only for attendees.
  const connection =
    viewer.isAttendee && viewer.evaluationId
      ? await loadConnectionData(event.id, viewer.evaluationId)
      : null;

  return (
    <div className="flex flex-col gap-8">
      {/* "+ Add Your Photos" rides in the carousel's counter row (next to "1/27").
          PAST events only — no photos to add before the event happens. */}
      {slides.length > 0 && (
        <PhotoCarousel
          photos={slides}
          actionSlot={isPastEvent(event) && viewer.isAttendee ? <AttendeePhotoUpload slug={event.slug} /> : undefined}
        />
      )}
      {/* No photos yet but the viewer is an attendee on a PAST event → still upload. */}
      {slides.length === 0 && isPastEvent(event) && viewer.isAttendee && <AttendeePhotoUpload slug={event.slug} />}

      <HostsSection eventId={event.id} isClaimed={!unclaimed} />

      {analytics && (
        <EventAnalyticsSection
          totalAttendees={analytics.totalAttendees}
          stats={analytics.stats}
          founderRadar={analytics.radars.founder}
          investorRadar={analytics.radars.investor}
        />
      )}

      {/* Chat forum — sits directly above the attendee list. */}
      <EventChat
        event={{ id: event.id, slug: event.slug, title: event.title }}
        viewer={{ evalId: viewer.evaluationId, isMember: !unclaimed, isAttendee: viewer.isAttendee }}
      />

      {/* Attendees — for attendees this doubles as the connection hub: pending
          requests inbox, the per-event "allow requests?" choice, and a Connect
          button on every row. */}
      {connection && <ConnectionInbox initial={connection.incoming} />}
      <AttendeesTable
        rows={attendeeRows.rows}
        unmatchedNames={attendeeRows.unmatchedNames}
        isClaimed={!unclaimed}
        upcoming={!isPastEvent(event)}
        slug={connection ? event.slug : undefined}
        viewerEvalId={viewer.evaluationId}
        connectionByEval={connection?.connectionByEval}
        belowTitle={
          connection ? (
            <EventConnectionPref scope={event.id} initial={connection.eventChoice} showEventNote />
          ) : undefined
        }
      />

      {event.description && (
        <section className="flex flex-col gap-3">
          <SectionHeading label="Event Description" className="font-display text-2xl font-semibold" />
          {unclaimed ? (
            <ClaimFadeGate>
              <div className={DESC_PROSE} dangerouslySetInnerHTML={{ __html: descriptionToHtml(event.description) }} />
            </ClaimFadeGate>
          ) : (
            // Claimed viewers see a clamped preview with a "Read more" so a long
            // description doesn't push the Learnings far down the page.
            <ClampedHtml html={descriptionToHtml(event.description)} maxHeight={220} className={DESC_PROSE} />
          )}
        </section>
      )}

      {/* Personalized AI learnings — above public learnings, claimed members
          only, and ONLY when already generated on the backend for this viewer. */}
      {!unclaimed && personalFirstName && personalLearnings && (
        <PersonalizedLearnings firstName={personalFirstName} html={personalLearnings} />
      )}

      {/* Attendee Insights (Recommended Connections) — same gating as above. */}
      {!unclaimed && personalFirstName && connectionsInsights && (
        <RecommendedConnections firstName={personalFirstName} html={connectionsInsights} />
      )}

      {/* Public learnings — green box, shown to everyone (clamped for unclaimed). */}
      {learnings && (
        <section className="flex flex-col gap-3 rounded-lg border border-emerald-800/50 bg-emerald-900/20 p-5">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-emerald-700 px-2 py-0.5 text-xs font-medium text-white">
              Public
            </span>
            <SectionHeading label="Post-Event Learnings" className="font-display text-2xl font-semibold" />
          </div>
          {(() => {
            const body = (
              <div
                className="prose-recap text-zinc-300 leading-relaxed [&_a]:text-[#dfa43a] [&_h3]:font-semibold [&_h3]:text-zinc-100 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                dangerouslySetInnerHTML={{ __html: learnings }}
              />
            );
            return unclaimed ? <ClaimFadeGate>{body}</ClaimFadeGate> : body;
          })()}
        </section>
      )}

      {/* Members-only learnings — purple box, any claimed member. */}
      {memberLearnings && (
        <section className="flex flex-col gap-3 rounded-lg border border-purple-800/50 bg-purple-900/20 p-5">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-purple-700 px-2 py-0.5 text-xs font-medium text-white">
              Members only
            </span>
            <SectionHeading label="Member learnings" className="font-display text-2xl font-semibold" />
          </div>
          <div
            className="prose-recap text-zinc-300 leading-relaxed [&_a]:text-[#dfa43a] [&_h3]:font-semibold [&_h3]:text-zinc-100 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
            dangerouslySetInnerHTML={{ __html: memberLearnings }}
          />
        </section>
      )}

      {/* Attendees-only learnings — amber box, gated RSVP'd attendees. */}
      {viewer.isAttendee && attendeeLearnings && (
        <section className="flex flex-col gap-3 rounded-lg border border-[#dfa43a]/30 bg-[#dfa43a]/5 p-5">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-[#dfa43a] px-2 py-0.5 text-xs font-medium text-black">
              Attendees only
            </span>
            <SectionHeading label="Attendee learnings" className="font-display text-2xl font-semibold" />
          </div>
          <div
            className="prose-recap text-zinc-300 leading-relaxed [&_a]:text-[#dfa43a] [&_h3]:font-semibold [&_h3]:text-zinc-100 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
            dangerouslySetInnerHTML={{ __html: attendeeLearnings }}
          />
        </section>
      )}

      <SponsorsSection eventId={event.id} isClaimed={!unclaimed} />

    </div>
  );
}
