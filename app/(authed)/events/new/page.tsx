import type { Metadata } from "next";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { IconArrowRight } from "@/components/icons";
import { gateEvents } from "../gate";
import { EventForm } from "../event-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New event — GoPixel",
  robots: { index: false, follow: false },
};

export default async function NewEventPage() {
  const gate = await gateEvents();
  if (gate.gated) return gate.gated;

  return (
    <DashboardShell
      firstName={gate.firstName}
      email={gate.email}
      status={gate.status}
      isAdmin={gate.isAdmin}
    >
      <header className="mb-8">
        <Link
          href="/events"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80"
        >
          <IconArrowRight className="h-4 w-4 rotate-180" /> Back to Events
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">New event</h1>
        <p className="mt-1 text-sm text-white/55">
          Create a meetup, study group, or info session for the OHS community. You&apos;ll be its
          organizer and can add co-organizers after.
        </p>
      </header>
      <EventForm />
    </DashboardShell>
  );
}
