"use client";

import { useState } from "react";
import { buildIcs, googleCalendarUrl, type IcsEvent } from "@/lib/events/ics";
import { IconCalendar, IconChevronRight } from "@/components/icons";
import type { CalendarEvent } from "@/lib/events/calendar";

// Per-event "Add to calendar" control: a small menu offering a downloadable .ics
// (built client-side from the shared RFC-5545 generator) and a Google Calendar
// "add" link. Both run through the SAME buildIcs/googleCalendarUrl helpers the
// tests cover, so the menu can't diverge from the spec.

// Map a CalendarEvent into the IcsEvent shape. For an all-day event we convert the
// stored INCLUSIVE last-day end into the EXCLUSIVE end (day after) that .ics +
// Google expect; for a timed event the end passes through unchanged.
function toIcsEvent(ev: CalendarEvent): IcsEvent {
  const start = new Date(ev.startsAt);
  let end = ev.endsAt ? new Date(ev.endsAt) : null;
  if (ev.allDay && end) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000); // inclusive → exclusive
  }
  return {
    uid: `${ev.id}@pixelparents`,
    title: ev.title,
    description: ev.description,
    location: ev.isOnline ? null : ev.location,
    url: ev.isOnline ? ev.onlineUrl : null,
    start,
    end,
    allDay: ev.allDay,
  };
}

function downloadIcs(ev: CalendarEvent) {
  const ics = buildIcs(toIcsEvent(ev));
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const slug = ev.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50);
  a.download = `${slug || "event"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function AddToCalendar({ event, compact = false }: { event: CalendarEvent; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const gUrl = googleCalendarUrl(toIcsEvent(event));

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          compact
            ? "inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/75 transition hover:bg-white/10"
            : "inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/85 transition hover:bg-white/10"
        }
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <IconCalendar className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        Add to calendar
      </button>
      {open ? (
        <>
          {/* Click-away backdrop. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            role="menu"
            className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-xl shadow-black/40"
          >
            <a
              href={gUrl}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-white/80 transition hover:bg-white/5"
            >
              Google Calendar
              <IconChevronRight className="h-4 w-4 text-white/35" />
            </a>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                downloadIcs(event);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-white/80 transition hover:bg-white/5"
            >
              Apple / Outlook (.ics)
              <IconChevronRight className="h-4 w-4 text-white/35" />
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
