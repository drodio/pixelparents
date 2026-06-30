"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  EVENT_TITLE_MAX,
  EVENT_DESC_MAX,
  EVENT_LOCATION_MAX,
} from "@/lib/events/validate";
import { createEventAction, updateEventAction } from "./actions";

const controlCls =
  "w-full rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-amber-400/50";

export type EventFormInitial = {
  id: string;
  title: string;
  description: string;
  startDate: string; // YYYY-MM-DD (local)
  startTime: string; // HH:MM (local)
  endDate: string;
  endTime: string;
  isOnline: boolean;
  location: string;
  onlineUrl: string;
  allDay: boolean;
};

// Shared create/edit form for an event. When `initial` is set it edits (via
// updateEventAction); otherwise it creates. Sends a date + time pair + the
// client's timezone offset so the server resolves a correct UTC instant.
export function EventForm({ initial }: { initial?: EventFormInitial }) {
  const router = useRouter();
  const editing = Boolean(initial);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [allDay, setAllDay] = useState(initial?.allDay ?? false);
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [startTime, setStartTime] = useState(initial?.startTime ?? "18:00");
  const [hasEnd, setHasEnd] = useState(Boolean(initial?.endDate));
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [endTime, setEndTime] = useState(initial?.endTime ?? "19:00");
  const [isOnline, setIsOnline] = useState(initial?.isOnline ?? false);
  const [location, setLocation] = useState(initial?.location ?? "");
  const [onlineUrl, setOnlineUrl] = useState(initial?.onlineUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const payload = {
        title,
        description: description || null,
        startDate,
        startTime: allDay ? null : startTime,
        endDate: hasEnd ? endDate : null,
        endTime: hasEnd && !allDay ? endTime : null,
        tzOffsetMinutes: new Date().getTimezoneOffset(),
        isOnline,
        location: isOnline ? null : location,
        onlineUrl: isOnline ? onlineUrl : null,
        allDay,
      };
      const res = editing
        ? await updateEventAction({ id: initial!.id, ...payload })
        : await createEventAction(payload);
      if (res.ok) {
        router.push(res.id ? `/events/${res.id}` : "/events");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex max-w-2xl flex-col gap-5"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={EVENT_TITLE_MAX}
          placeholder="Study group, meetup, info session…"
          className={controlCls}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">
          Description <span className="font-normal text-white/45">(optional)</span>
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={EVENT_DESC_MAX}
          rows={4}
          placeholder="What's happening? Who's it for?"
          className={controlCls}
        />
      </label>

      {/* When */}
      <fieldset className="flex flex-col gap-3 rounded-xl border border-white/10 p-4">
        <legend className="px-1 text-sm font-medium text-white/80">When</legend>

        <label className="flex items-center gap-2 text-sm text-white/75">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="h-4 w-4 accent-amber-400"
          />
          All day
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-white/55">Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={`${controlCls} w-44`}
            />
          </label>
          {!allDay && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/55">Start time</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={`${controlCls} w-32`}
              />
            </label>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-white/75">
          <input
            type="checkbox"
            checked={hasEnd}
            onChange={(e) => setHasEnd(e.target.checked)}
            className="h-4 w-4 accent-amber-400"
          />
          Add an end {allDay ? "date" : "time"}
        </label>

        {hasEnd && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/55">End date</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={`${controlCls} w-44`}
              />
            </label>
            {!allDay && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-white/55">End time</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={`${controlCls} w-32`}
                />
              </label>
            )}
          </div>
        )}
      </fieldset>

      {/* Where */}
      <fieldset className="flex flex-col gap-3 rounded-xl border border-white/10 p-4">
        <legend className="px-1 text-sm font-medium text-white/80">Where</legend>
        <div className="inline-flex w-fit overflow-hidden rounded-full border border-white/15">
          <button
            type="button"
            onClick={() => setIsOnline(false)}
            className={`px-4 py-2 text-sm font-medium transition ${
              !isOnline ? "bg-amber-400 text-black" : "text-white/65 hover:bg-white/10"
            }`}
          >
            In person
          </button>
          <button
            type="button"
            onClick={() => setIsOnline(true)}
            className={`px-4 py-2 text-sm font-medium transition ${
              isOnline ? "bg-amber-400 text-black" : "text-white/65 hover:bg-white/10"
            }`}
          >
            Online
          </button>
        </div>

        {isOnline ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-white/55">Meeting link</span>
            <input
              value={onlineUrl}
              onChange={(e) => setOnlineUrl(e.target.value)}
              placeholder="https://zoom.us/j/…"
              className={controlCls}
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-white/55">Location</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={EVENT_LOCATION_MAX}
              placeholder="Address or place name"
              className={controlCls}
            />
          </label>
        )}
      </fieldset>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
        >
          {pending ? "Saving…" : editing ? "Save changes" : "Create event"}
        </button>
      </div>
    </form>
  );
}
