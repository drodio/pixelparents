import Link from "next/link";
import { adminGate } from "@/lib/admin";
import { can, getViewerScopes, getViewerEmail } from "@/lib/grants";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { SyncLumaButton } from "@/components/admin/SyncLumaButton";
import { ExternalLinkIcon } from "@/components/ExternalLinkIcon";
import { db } from "@/db";
import { events, eventAttendees } from "@/db/schema";
import { desc, sql, count } from "drizzle-orm";
import { formatEventDate } from "@/lib/event-format";

export const dynamic = "force-dynamic";

type EventRow = typeof events.$inferSelect;
type AttendeeCount = { total: number; matched: number };

// One events table — rendered once for upcoming events and once for past events.
function EventsTable({
  rows,
  countsByEvent,
}: {
  rows: EventRow[];
  countsByEvent: Map<string, AttendeeCount>;
}) {
  return (
    <div className="border border-zinc-800 rounded-md overflow-hidden">
      {/* Scroll the table horizontally inside its box on narrow phones so
          the ~5-col table never stretches the whole page past 390px. */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Event</th>
              <th className="text-left px-4 py-3">Starts</th>
              <th className="text-left px-4 py-3">Attendees</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-t border-zinc-800 hover:bg-zinc-900">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {e.coverUrl ? (
                      <img
                        src={e.coverUrl}
                        alt=""
                        className="h-9 w-9 rounded object-cover shrink-0 border border-zinc-800"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded bg-zinc-800 shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0">
                      <Link href={`/admin/events/${e.id}`} className="text-white hover:underline">
                        {e.title}
                      </Link>
                      <div className="font-mono text-xs text-zinc-500 truncate">{e.slug}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{formatEventDate(e.startsAt)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {(() => {
                    const c = countsByEvent.get(e.id);
                    if (!c || c.total === 0) return <span className="text-zinc-600">—</span>;
                    return (
                      <span className="text-zinc-300">
                        {c.total}
                        <span className="text-zinc-500"> · {c.matched} matched</span>
                      </span>
                    );
                  })()}
                </td>
                <td className="px-4 py-3">{e.status}</td>
                <td className="px-4 py-3">
                  {e.source === "luma" ? (
                    e.lumaUrl ? (
                      <a
                        href={e.lumaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#dfa43a] hover:underline whitespace-nowrap"
                      >
                        Luma <ExternalLinkIcon className="ml-0.5" />
                      </a>
                    ) : (
                      <span className="text-zinc-400">Luma</span>
                    )
                  ) : (
                    <span className="text-zinc-500">Manual</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function AdminEventsIndex() {
  const gate = await adminGate();
  if (!gate.ok) return <NotAuthorized email={gate.email} />;
  const canCreate = await can("create_events");
  // RBAC scope: a "theirs"-scoped role only sees events it created (matched by
  // email). null email while scoped → "" (matches nothing).
  const scopes = await getViewerScopes();
  const ownerEmail = scopes.events === "theirs" ? (await getViewerEmail()) ?? "" : null;
  const rows = await db
    .select()
    .from(events)
    .where(ownerEmail !== null ? sql`lower(${events.createdByEmail}) = ${ownerEmail}` : undefined)
    .orderBy(desc(events.startsAt))
    .limit(200);

  // Per-event attendee counts: total registrants and how many matched a profile.
  const attendeeCounts = await db
    .select({
      eventId: eventAttendees.eventId,
      total: count(),
      matched: sql<number>`count(${eventAttendees.evaluationId})`,
    })
    .from(eventAttendees)
    .groupBy(eventAttendees.eventId);
  const countsByEvent = new Map(
    attendeeCounts.map((r) => [r.eventId, { total: Number(r.total), matched: Number(r.matched) }]),
  );

  // Split into UPCOMING (future / undated) and PAST (a real start date in the past).
  // Upcoming is sorted soonest-first; undated upcoming events sink to the bottom.
  // Past is sorted most-recent-first.
  const now = Date.now();
  const ms = (d: Date | null) => (d ? new Date(d).getTime() : null);
  const isPast = (e: EventRow) => {
    const t = ms(e.startsAt);
    return t !== null && t < now;
  };
  const upcoming = rows
    .filter((e) => !isPast(e))
    .sort((a, b) => {
      const ta = ms(a.startsAt);
      const tb = ms(b.startsAt);
      if (ta === null) return 1;
      if (tb === null) return -1;
      return ta - tb;
    });
  const past = rows.filter(isPast).sort((a, b) => (ms(b.startsAt) ?? 0) - (ms(a.startsAt) ?? 0));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-tight">Events</h1>
        {canCreate && (
          <div className="flex items-center gap-3">
            <SyncLumaButton />
            <Link
              href="/admin/events/new"
              className="rounded-md bg-white text-black font-medium px-4 py-2 text-sm hover:bg-zinc-200"
            >
              + New event
            </Link>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-zinc-500 text-sm">
          No events yet. Use <span className="text-zinc-300">Sync from Luma</span> to pull
          your Luma calendar in, or create one manually.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
              Upcoming events <span className="text-zinc-600">({upcoming.length})</span>
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-zinc-500 text-sm">No upcoming events.</p>
            ) : (
              <EventsTable rows={upcoming} countsByEvent={countsByEvent} />
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
              Past events <span className="text-zinc-600">({past.length})</span>
            </h2>
            {past.length === 0 ? (
              <p className="text-zinc-500 text-sm">No past events.</p>
            ) : (
              <EventsTable rows={past} countsByEvent={countsByEvent} />
            )}
          </section>
        </>
      )}
    </div>
  );
}
