import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { IconArrowRight } from "@/components/icons";
import { getEventById, isEventAdmin } from "@/lib/db/events";
import { gateEvents } from "../../gate";
import { EventForm, type EventFormInitial } from "../../event-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit event — Pixel Parents",
  robots: { index: false, follow: false },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Split a UTC instant into the local YYYY-MM-DD + HH:MM the form's date/time
// inputs expect. For an all-day event the time is dropped. We compute from the
// stored UTC instant in the SERVER's zone; the form re-resolves with the client
// offset on save, so a same-day round-trip is stable in practice.
function localParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
  };
}

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const gate = await gateEvents();
  if (gate.gated) return gate.gated;

  const row = await getEventById(id);
  if (!row) notFound();
  // OHS events are never editable; only admins of a user event may edit.
  if (row.source !== "user" || !(await isEventAdmin(id, gate.viewer.id))) {
    notFound();
  }

  const start = localParts(
    (row.startsAt instanceof Date ? row.startsAt : new Date(row.startsAt as unknown as string)).toISOString(),
  );
  const end = row.endsAt
    ? localParts(
        (row.endsAt instanceof Date ? row.endsAt : new Date(row.endsAt as unknown as string)).toISOString(),
      )
    : null;

  const initial: EventFormInitial = {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    startDate: start.date,
    startTime: start.time,
    endDate: end?.date ?? "",
    endTime: end?.time ?? "19:00",
    isOnline: Boolean(row.isOnline),
    location: row.location ?? "",
    onlineUrl: row.onlineUrl ?? "",
    allDay: Boolean(row.allDay),
  };

  return (
    <DashboardShell
      firstName={gate.firstName}
      email={gate.email}
      status={gate.status}
      isAdmin={gate.isAdmin}
    >
      <header className="mb-8">
        <Link
          href={`/events/${row.id}`}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80"
        >
          <IconArrowRight className="h-4 w-4 rotate-180" /> Back to event
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Edit event</h1>
      </header>
      <EventForm initial={initial} />
    </DashboardShell>
  );
}
