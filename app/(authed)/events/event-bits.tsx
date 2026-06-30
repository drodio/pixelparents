"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconStar, IconVideo, IconMapPin } from "@/components/icons";
import type { CalendarEvent } from "@/lib/events/calendar";
import { rsvpAction } from "./actions";

// Format an event's date/time window for display, respecting all-day vs timed and
// single vs multi-day. All in the viewer's local zone.
export function formatEventWhen(ev: CalendarEvent): string {
  const start = new Date(ev.startsAt);
  const end = ev.endsAt ? new Date(ev.endsAt) : null;

  const dateOpts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

  const sameDay =
    end != null &&
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  if (ev.allDay) {
    const startStr = start.toLocaleDateString(undefined, dateOpts);
    if (!end || sameDay) return `${startStr} · All day`;
    return `${startStr} – ${end.toLocaleDateString(undefined, dateOpts)}`;
  }

  const startStr = `${start.toLocaleDateString(undefined, dateOpts)}, ${start.toLocaleTimeString(undefined, timeOpts)}`;
  if (!end) return startStr;
  if (sameDay) return `${startStr} – ${end.toLocaleTimeString(undefined, timeOpts)}`;
  return `${startStr} – ${end.toLocaleDateString(undefined, dateOpts)}, ${end.toLocaleTimeString(undefined, timeOpts)}`;
}

// Online/in-person chip with the right icon + label.
export function PlaceBadge({ event, className = "" }: { event: CalendarEvent; className?: string }) {
  if (event.isOnline) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs text-sky-300 ${className}`}>
        <IconVideo className="h-3.5 w-3.5" /> Online
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-emerald-300 ${className}`}>
      <IconMapPin className="h-3.5 w-3.5" /> {event.location ?? "In person"}
    </span>
  );
}

// The going/interested RSVP toggle with live counts. Clicking the active status
// again clears the RSVP. Verified-only is enforced server-side in rsvpAction.
export function RsvpControl({
  event,
  size = "md",
}: {
  event: CalendarEvent;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Optimistic local mirror so the buttons feel instant.
  const [mine, setMine] = useState(event.myRsvp);
  const [going, setGoing] = useState(event.goingCount);
  const [interested, setInterested] = useState(event.interestedCount);

  const set = (status: "going" | "interested") => {
    const next = mine === status ? null : status;
    // Optimistic count update.
    setGoing((g) => g + (status === "going" ? (next === "going" ? 1 : 0) : 0) - (mine === "going" ? 1 : 0));
    setInterested((i) => i + (status === "interested" ? (next === "interested" ? 1 : 0) : 0) - (mine === "interested" ? 1 : 0));
    setMine(next);
    startTransition(async () => {
      const res = await rsvpAction({ eventId: event.id, status: next });
      if (!res.ok) {
        // Roll back on failure by refreshing from the server.
        router.refresh();
      }
    });
  };

  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => set("going")}
        aria-pressed={mine === "going"}
        className={`inline-flex items-center gap-1.5 rounded-full border font-medium transition ${pad} disabled:opacity-60 ${
          mine === "going"
            ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200"
            : "border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10"
        }`}
      >
        <IconCheck className={icon} /> Going{going > 0 ? ` · ${going}` : ""}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => set("interested")}
        aria-pressed={mine === "interested"}
        className={`inline-flex items-center gap-1.5 rounded-full border font-medium transition ${pad} disabled:opacity-60 ${
          mine === "interested"
            ? "border-amber-400/60 bg-amber-400/15 text-amber-200"
            : "border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10"
        }`}
      >
        <IconStar className={icon} /> Interested{interested > 0 ? ` · ${interested}` : ""}
      </button>
    </div>
  );
}
