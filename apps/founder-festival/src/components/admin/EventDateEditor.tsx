"use client";

import { useState } from "react";
import { useAutosave, AutosaveStatus } from "@/components/admin/useAutosave";

// Edits an event's start (and optional end) date/time. The <input type=
// "datetime-local"> is timezone-naive and reads/writes in the admin's BROWSER
// timezone — which for the festival's (Pacific) admins is the event's local
// time. On save we send ISO instants; the server stores them as timestamptz.
// Matches the existing EventCriteriaBuilder's datetime-local convention.

// Date (UTC instant) → "YYYY-MM-DDTHH:mm" in the browser's local timezone, for
// a datetime-local input value.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The browser's short timezone name ("PDT", "EST", …) — these inputs read/write
// in the admin's local timezone, so we label the fields with it. "" on the
// server (no Intl tz there); the spans that show it suppress hydration warnings.
function browserTzShort(): string {
  if (typeof window === "undefined") return "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

// Open the native date/time picker on click so the admin gets a calendar
// instead of having to type. showPicker() needs a user gesture (the click is
// one) and isn't in every browser — ignore if unsupported.
function openPicker(el: HTMLInputElement) {
  try {
    el.showPicker();
  } catch {
    /* unsupported / not allowed — native typing still works */
  }
}

export function EventDateEditor({
  eventId,
  initialStartsAt,
  initialEndsAt,
  initialLocation,
}: {
  eventId: string;
  initialStartsAt: string;
  initialEndsAt: string | null;
  initialLocation: string | null;
}) {
  const [starts, setStarts] = useState(toLocalInput(initialStartsAt));
  const [ends, setEnds] = useState(toLocalInput(initialEndsAt));
  const [location, setLocation] = useState(initialLocation ?? "");
  const [tz] = useState(browserTzShort);
  const { status, schedule } = useAutosave();

  // Auto-save (debounced) the whole set (date + location) on any change. A start
  // is required, so an empty start just skips the save rather than wiping it.
  function persist(nextStarts: string, nextEnds: string, nextLocation: string) {
    setStarts(nextStarts);
    setEnds(nextEnds);
    setLocation(nextLocation);
    if (!nextStarts) return;
    schedule(async () => {
      // new Date(localString) interprets the naive value in the browser's tz,
      // then toISOString() gives the UTC instant the server stores.
      const res = await fetch(`/api/admin/events/${eventId}/date`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startsAt: new Date(nextStarts).toISOString(),
          endsAt: nextEnds ? new Date(nextEnds).toISOString() : null,
          location: nextLocation.trim() || null,
        }),
      });
      return res.ok;
    });
  }

  const input = "rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-400" suppressHydrationWarning>
            Starts at{tz ? ` (${tz})` : ""}
          </span>
          <input
            type="datetime-local"
            className={input}
            value={starts}
            onChange={(e) => persist(e.target.value, ends, location)}
            onClick={(e) => openPicker(e.currentTarget)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-400" suppressHydrationWarning>
            Ends at{tz ? ` (${tz}, optional)` : " (optional)"}
          </span>
          <input
            type="datetime-local"
            className={input}
            value={ends}
            onChange={(e) => persist(starts, e.target.value, location)}
            onClick={(e) => openPicker(e.currentTarget)}
          />
        </label>
        <div className="pb-2">
          <AutosaveStatus status={status} />
        </div>
      </div>
      <label className="flex max-w-xs flex-col gap-1 text-sm">
        <span className="text-zinc-400">Location</span>
        <input
          type="text"
          className={input}
          value={location}
          onChange={(e) => persist(starts, ends, e.target.value)}
          placeholder="San Mateo, CA"
        />
        <span className="text-xs text-zinc-500">Shown next to the date on the event page.</span>
      </label>
    </div>
  );
}
