import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { readApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import { isAdminEmail } from "@/lib/admin";
import { isFamilyVerified } from "@/lib/directory";
import { hasDatabase } from "@/lib/db";
import {
  listAllEvents,
  rsvpCountsFor,
  myRsvpsFor,
  editableEventIds,
} from "@/lib/db/events";
import { DashboardShell } from "@/components/dashboard-shell";
import { SignedOutPanel } from "@/components/signed-out-panel";
import { IconPlus } from "@/components/icons";
import { EventsCalendarClient } from "./events-calendar-client";
import type { CalendarEvent } from "@/lib/events/calendar";
import { toCalendarEvent } from "./shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Events — Pixel Parents",
  description:
    "The shared Stanford OHS community calendar — family-created meetups plus the OHS school-year calendar.",
  robots: { index: false, follow: false },
};

function PageHeader({ showNew }: { showNew?: boolean }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Events</h1>
        <p className="mt-1 text-sm text-white/55">
          The shared OHS calendar — community meetups plus the school-year calendar, all in one place.
        </p>
      </div>
      {showNew ? (
        <Link
          href="/events/new"
          className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
        >
          <IconPlus className="h-4 w-4" />
          New event
        </Link>
      ) : null}
    </header>
  );
}

export default async function EventsPage() {
  // Signed-out → grayed shell + sign-in CTA, BEFORE any DB read (no PII loaded).
  const viewer = await currentUser();
  if (!viewer) {
    return (
      <DashboardShell authed={false} firstName={null} email={null} status={null}>
        <SignedOutPanel area="community" />
      </DashboardShell>
    );
  }
  const email = primaryEmail(viewer);

  const [viewerSignup, isAdmin] = await Promise.all([
    email ? getSignupByEmail(email) : Promise.resolve(null),
    isAdminEmail(email),
  ]);
  const firstName = viewerSignup?.firstName ?? viewer.firstName ?? null;
  const status: ApprovalStatus | null = viewerSignup
    ? readApprovalStatus((viewerSignup.extra ?? {}) as Record<string, unknown>)
    : null;
  const isVerified = Boolean(viewerSignup) && isFamilyVerified(viewerSignup!);

  const shell = (content: React.ReactNode) => (
    <DashboardShell firstName={firstName} email={email} status={status} isAdmin={isAdmin}>
      {content}
    </DashboardShell>
  );

  // Gate: only VERIFIED OHS families see the calendar.
  if (!isVerified) {
    return shell(
      <>
        <PageHeader />
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
          <h2 className="text-lg font-semibold">Verify to see Events</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
            {viewerSignup
              ? "Confirm your OHS student's Stanford email to see the community calendar and create events."
              : "Your account isn't recognized as an OHS family yet. Join Pixel Parents to use Events."}
          </p>
          <Link
            href={viewerSignup ? "/verify" : "/signup"}
            className="mt-5 inline-block rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
          >
            {viewerSignup ? "Verify now" : "Join Pixel Parents"}
          </Link>
        </div>
      </>,
    );
  }

  if (!hasDatabase()) {
    return shell(
      <>
        <PageHeader />
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-white/55">
          Events aren&apos;t available yet — check back soon.
        </div>
      </>,
    );
  }

  const rows = await listAllEvents();
  const ids = rows.map((r) => r.id);
  const [counts, myRsvps, editable] = await Promise.all([
    rsvpCountsFor(ids),
    myRsvpsFor(viewerSignup!.id, ids),
    editableEventIds(viewerSignup!.id, ids),
  ]);

  const events: CalendarEvent[] = rows.map((r) =>
    toCalendarEvent(r, {
      counts: counts.get(r.id),
      myRsvp: myRsvps.get(r.id) ?? null,
      canEdit: editable.has(r.id),
    }),
  );

  return shell(
    <>
      <PageHeader showNew />
      <EventsCalendarClient events={events} />
    </>,
  );
}
