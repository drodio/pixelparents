import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  IconArrowRight,
  IconVideo,
  IconMapPin,
  IconCheck,
  IconStar,
} from "@/components/icons";
import { getDb } from "@/lib/db";
import { signups } from "@/lib/db/schema/signups";
import { inArray } from "drizzle-orm";
import { isStudentAccount } from "@/lib/family-display";
import { isDirectoryVisible } from "@/lib/directory";
import {
  getEventById,
  rsvpCountsFor,
  myRsvpsFor,
  editableEventIds,
  listRsvpsForEvent,
  listEventAdmins,
} from "@/lib/db/events";
import { gateEvents } from "../gate";
import { toCalendarEvent } from "../shared";
import { AddToCalendar } from "../add-to-calendar";
import { RsvpControl, formatEventWhen } from "../event-bits";
import { EventControls } from "./event-controls";
import { AdminManager } from "./admin-manager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Event — Pixel Parents",
  robots: { index: false, follow: false },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const gate = await gateEvents();
  if (gate.gated) return gate.gated;
  const viewer = gate.viewer;

  const row = await getEventById(id);
  if (!row) notFound();

  const [counts, myRsvps, editable, rsvps, admins] = await Promise.all([
    rsvpCountsFor([id]),
    myRsvpsFor(viewer.id, [id]),
    editableEventIds(viewer.id, [id]),
    listRsvpsForEvent(id),
    listEventAdmins(id),
  ]);

  const canEdit = editable.has(id) && row.source === "user";
  const event = toCalendarEvent(row, {
    counts: counts.get(id),
    myRsvp: myRsvps.get(id) ?? null,
    canEdit,
  });

  // Resolve attendee + admin display names in ONE batch. Going/interested names
  // are shown ONLY for members who opted into directory sharing (privacy: a
  // member who shares nothing is counted but never named); students are first-
  // name only. Admin names follow the same coarsening.
  const relevantIds = Array.from(
    new Set([...rsvps.map((r) => r.signupId), ...admins.map((a) => a.signupId)]),
  );
  const profileById = new Map<
    string,
    { name: string; shareable: boolean; isStudent: boolean }
  >();
  if (relevantIds.length > 0) {
    const rows = await getDb().select().from(signups).where(inArray(signups.id, relevantIds));
    for (const s of rows) {
      const student = isStudentAccount(s);
      profileById.set(s.id, {
        name: student ? s.firstName : [s.firstName, s.lastName].filter(Boolean).join(" "),
        shareable: isDirectoryVisible(s),
        isStudent: student,
      });
    }
  }

  const goingNames = rsvps
    .filter((r) => r.status === "going")
    .map((r) => profileById.get(r.signupId))
    .filter((p): p is NonNullable<typeof p> => Boolean(p) && p!.shareable)
    .map((p) => p.name);
  const interestedCount = event.interestedCount;
  const goingCount = event.goingCount;
  const anonGoing = Math.max(0, goingCount - goingNames.length);

  const isOhs = event.source === "ohs";

  // Admin list for the manager (author pinned + cannot be removed). The author's
  // signup id (if any) lets the manager mark them non-removable.
  const adminList = admins.map((a) => {
    const p = profileById.get(a.signupId);
    return {
      signupId: a.signupId,
      name: p?.name ?? "A member",
      isAuthor: row.authorSignupId != null && a.signupId === row.authorSignupId,
    };
  });

  return (
    <DashboardShell
      firstName={gate.firstName}
      email={gate.email}
      status={gate.status}
      isAdmin={gate.isAdmin}
    >
      <header className="mb-6">
        <Link
          href="/events"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80"
        >
          <IconArrowRight className="h-4 w-4 rotate-180" /> Back to Events
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{event.title}</h1>
              {isOhs && (
                <span className="rounded-full bg-violet-400/15 px-2.5 py-0.5 text-xs font-medium text-violet-200">
                  OHS calendar
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-white/60">{formatEventWhen(event)}</p>
          </div>
          {canEdit && <EventControls eventId={event.id} />}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {event.isOnline ? (
                <span className="inline-flex items-center gap-1.5 text-sky-300">
                  <IconVideo className="h-4 w-4" /> Online event
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-emerald-300">
                  <IconMapPin className="h-4 w-4" /> {event.location ?? "In person"}
                </span>
              )}
              {event.authorLabel && (
                <span className="text-white/45">· Organized by {event.authorLabel}</span>
              )}
            </div>

            {event.isOnline && event.onlineUrl && (
              <a
                href={event.onlineUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block max-w-full truncate text-sm text-sky-300 hover:text-sky-200"
              >
                {event.onlineUrl}
              </a>
            )}

            {event.description && (
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-white/80">
                {event.description}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
              {!isOhs && <RsvpControl event={event} />}
              <AddToCalendar event={event} />
            </div>
          </section>

          {/* Per-event admins — only for editable user events. */}
          {canEdit && (
            <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h2 className="text-sm font-semibold text-white/85">Organizers</h2>
              <p className="mt-1 text-xs text-white/50">
                Add a co-organizer by name — only existing Pixel Parents accounts can be added. They
                can edit this event.
              </p>
              <div className="mt-4">
                <AdminManager eventId={event.id} admins={adminList} />
              </div>
            </section>
          )}
        </div>

        {/* Attendees sidebar. */}
        <aside className="lg:col-span-1">
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <h2 className="text-sm font-semibold text-white/85">Who&apos;s coming</h2>
            <div className="mt-3 flex items-center gap-4 text-sm">
              <span className="inline-flex items-center gap-1.5 text-emerald-300">
                <IconCheck className="h-4 w-4" /> {goingCount} going
              </span>
              <span className="inline-flex items-center gap-1.5 text-amber-300">
                <IconStar className="h-4 w-4" /> {interestedCount} interested
              </span>
            </div>

            {goingNames.length > 0 ? (
              <ul className="mt-4 flex flex-col gap-1.5">
                {goingNames.map((name, i) => (
                  <li key={`${name}-${i}`} className="flex items-center gap-2 text-sm text-white/75">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-400/20 text-xs font-semibold text-amber-300">
                      {name.charAt(0).toUpperCase()}
                    </span>
                    {name}
                  </li>
                ))}
                {anonGoing > 0 && (
                  <li className="mt-1 text-xs text-white/45">
                    + {anonGoing} more (not publicly shared)
                  </li>
                )}
              </ul>
            ) : goingCount > 0 ? (
              <p className="mt-4 text-xs text-white/45">
                {goingCount} {goingCount === 1 ? "member is" : "members are"} going (names not
                publicly shared).
              </p>
            ) : (
              <p className="mt-4 text-xs text-white/45">Be the first to RSVP.</p>
            )}
          </section>
        </aside>
      </div>
    </DashboardShell>
  );
}
