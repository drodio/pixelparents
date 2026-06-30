"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  buildMonthGrid,
  splitUpcomingPast,
  eventsThisWeek,
  localDayKey,
  type CalendarEvent,
  type DayCell,
} from "@/lib/events/calendar";
import {
  IconChevronRight,
  IconCalendar,
  IconSparkles,
  IconPlus,
  IconFilter,
} from "@/components/icons";
import { MobileSheet } from "@/components/mobile-sheet";
import { AddToCalendar } from "./add-to-calendar";
import { RsvpControl, PlaceBadge, formatEventWhen } from "./event-bits";

type ViewMode = "calendar" | "list";
type ListTab = "upcoming" | "past";
type PlaceFilter = "all" | "online" | "inperson";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// A small dot/label for an event inside a calendar day cell.
function DayEventPill({ ev, onClick }: { ev: CalendarEvent; onClick: () => void }) {
  const isOhs = ev.source === "ohs";
  return (
    <button
      type="button"
      onClick={onClick}
      title={ev.title}
      className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium transition ${
        isOhs
          ? "bg-violet-400/15 text-violet-200 hover:bg-violet-400/25"
          : ev.isOnline
            ? "bg-sky-400/15 text-sky-200 hover:bg-sky-400/25"
            : "bg-amber-400/15 text-amber-200 hover:bg-amber-400/25"
      }`}
    >
      {ev.title}
    </button>
  );
}

export function EventsCalendarClient({ events }: { events: CalendarEvent[] }) {
  const now = useMemo(() => new Date(), []);
  const [view, setView] = useState<ViewMode>("calendar");
  const [listTab, setListTab] = useState<ListTab>("upcoming");
  const [place, setPlace] = useState<PlaceFilter>("all");
  const [showOhs, setShowOhs] = useState(true);
  // The month being viewed (anchored to its 1st).
  const [anchor, setAnchor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  // The selected day (for the detail panel) or a single selected event.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // On phones the place/OHS filters move into a bottom sheet behind a Filters
  // button; the calendar/list toggle stays inline.
  const [isMobile, setIsMobile] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const activeFilterCount = (place !== "all" ? 1 : 0) + (!showOhs ? 1 : 0);

  // Apply the online/in-person + OHS filters once.
  const filtered = useMemo(
    () =>
      events.filter((e) => {
        if (!showOhs && e.source === "ohs") return false;
        if (place === "online" && !e.isOnline) return false;
        if (place === "inperson" && e.isOnline) return false;
        return true;
      }),
    [events, place, showOhs],
  );

  const grid = useMemo(
    () => buildMonthGrid(anchor, filtered, now),
    [anchor, filtered, now],
  );
  const { upcoming, past } = useMemo(() => splitUpcomingPast(filtered, now), [filtered, now]);
  const thisWeek = useMemo(() => eventsThisWeek(filtered, now), [filtered, now]);

  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const selectedEvent = selectedEventId ? byId.get(selectedEventId) ?? null : null;
  const selectedDayCell: DayCell | null = selectedDay
    ? grid.find((c) => localDayKey(c.date) === selectedDay) ?? null
    : null;

  const goPrev = () => setAnchor((a) => new Date(a.getFullYear(), a.getMonth() - 1, 1));
  const goNext = () => setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + 1, 1));
  const goToday = () => {
    setAnchor(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  // Place + OHS-calendar filters. Rendered inline on desktop and in the mobile
  // sheet — one place at a time, sharing the same state.
  const filterControls = (
    <>
      <div className="inline-flex overflow-hidden rounded-full border border-white/15 text-xs">
        {([
          ["all", "All"],
          ["online", "Online"],
          ["inperson", "In person"],
        ] as [PlaceFilter, string][]).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setPlace(val)}
            className={`px-3 py-1.5 font-medium transition ${
              place === val ? "bg-white/15 text-white" : "text-white/55 hover:bg-white/10"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setShowOhs((v) => !v)}
        aria-pressed={showOhs}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
          showOhs
            ? "border-violet-400/50 bg-violet-400/15 text-violet-200"
            : "border-white/15 bg-white/[0.04] text-white/50 hover:bg-white/10"
        }`}
      >
        <span className="h-2 w-2 rounded-full bg-violet-400" /> OHS calendar
      </button>
    </>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* "Happening this week" highlight strip. */}
      {thisWeek.length > 0 && (
        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
          <div className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-amber-200">
            <IconSparkles className="h-4 w-4" /> Happening this week
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {thisWeek.slice(0, 8).map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => setSelectedEventId(ev.id)}
                className="min-w-[180px] shrink-0 rounded-xl border border-white/10 bg-black/30 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-amber-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 active:translate-y-0 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <div className="truncate text-sm font-medium text-white">{ev.title}</div>
                <div className="mt-1 text-xs text-white/55">{formatEventWhen(ev)}</div>
                <div className="mt-1.5">
                  <PlaceBadge event={ev} />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Toolbar: view toggle + filters. On phones the filters collapse into a
          bottom sheet behind a Filters button; the view toggle stays inline. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex overflow-hidden rounded-full border border-white/15">
          {(["calendar", "list"] as ViewMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setView(m)}
              className={`px-4 py-1.5 text-sm font-medium capitalize transition ${
                view === m ? "bg-amber-400 text-black" : "text-white/65 hover:bg-white/10"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Desktop filters inline. */}
        <div className="hidden flex-wrap items-center gap-2 md:flex">{filterControls}</div>

        {/* Mobile Filters trigger. */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 md:hidden"
          aria-haspopup="dialog"
        >
          <IconFilter className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-black">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {isMobile && (
        <MobileSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Filter events"
          footer={
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setPlace("all");
                  setShowOhs(true);
                }}
                className="text-sm text-white/55 hover:text-white"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="rounded-full bg-amber-400 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300"
              >
                Done
              </button>
            </div>
          }
        >
          <div className="flex flex-col gap-4">{filterControls}</div>
        </MobileSheet>
      )}

      {view === "calendar" ? (
        <CalendarGrid
          anchor={anchor}
          grid={grid}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
          onPickDay={(key) => {
            setSelectedDay(key);
            setSelectedEventId(null);
          }}
          onPickEvent={(id) => setSelectedEventId(id)}
        />
      ) : (
        <ListView
          tab={listTab}
          setTab={setListTab}
          upcoming={upcoming}
          past={past}
          onPick={(id) => setSelectedEventId(id)}
        />
      )}

      {/* Detail drawer for a selected single event. */}
      {selectedEvent && (
        <DetailDrawer event={selectedEvent} onClose={() => setSelectedEventId(null)} />
      )}

      {/* Day drawer: list of a day's events (calendar view click). */}
      {!selectedEvent && selectedDayCell && (
        <DayDrawer
          cell={selectedDayCell}
          onClose={() => setSelectedDay(null)}
          onPickEvent={(id) => setSelectedEventId(id)}
        />
      )}
    </div>
  );
}

function CalendarGrid({
  anchor,
  grid,
  onPrev,
  onNext,
  onToday,
  onPickDay,
  onPickEvent,
}: {
  anchor: Date;
  grid: DayCell[];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onPickDay: (key: string) => void;
  onPickEvent: (id: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h2 className="text-lg font-semibold">
          {MONTHS[anchor.getMonth()]} {anchor.getFullYear()}
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToday}
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/10"
          >
            Today
          </button>
          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous month"
            className="grid h-8 w-8 place-items-center rounded-full border border-white/15 text-white/70 transition hover:bg-white/10"
          >
            <IconChevronRight className="h-4 w-4 rotate-180" />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Next month"
            className="grid h-8 w-8 place-items-center rounded-full border border-white/15 text-white/70 transition hover:bg-white/10"
          >
            <IconChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* On phones a 7-col month grid would crush each cell to ~50px. We let the
          grid keep a usable minimum width and scroll horizontally instead; on
          sm+ it fits the container with no scroll. */}
      <div className="overflow-x-auto">
        <div className="min-w-[560px] sm:min-w-0">
          <div className="grid grid-cols-7 border-b border-white/10 text-center text-[11px] font-medium uppercase tracking-wide text-white/40">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {grid.map((cell) => {
              const key = localDayKey(cell.date);
              const extra = cell.events.length - 3;
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => onPickDay(key)}
                  className={`relative flex min-h-[80px] flex-col gap-1 border-b border-r border-white/[0.06] p-1.5 text-left align-top transition hover:bg-white/[0.03] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/50 sm:min-h-[92px] ${
                    cell.isToday
                      ? "bg-amber-400/[0.06] ring-1 ring-inset ring-amber-400/30"
                      : cell.inMonth
                        ? ""
                        : "bg-black/20"
                  }`}
                >
                  <span
                    className={`grid h-6 w-6 place-items-center self-start rounded-full text-xs ${
                      cell.isToday
                        ? "bg-amber-400 font-semibold text-black"
                        : cell.inMonth
                          ? "text-white/75"
                          : "text-white/30"
                    }`}
                  >
                    {cell.date.getDate()}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {cell.events.slice(0, 3).map((ev) => (
                      <DayEventPill
                        key={ev.id + key}
                        ev={ev}
                        onClick={() => onPickEvent(ev.id)}
                      />
                    ))}
                    {extra > 0 && (
                      <span className="px-1.5 text-[11px] text-white/45">+{extra} more</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function ListView({
  tab,
  setTab,
  upcoming,
  past,
  onPick,
}: {
  tab: ListTab;
  setTab: (t: ListTab) => void;
  upcoming: CalendarEvent[];
  past: CalendarEvent[];
  onPick: (id: string) => void;
}) {
  const list = tab === "upcoming" ? upcoming : past;
  return (
    <section className="flex flex-col gap-4">
      <div className="inline-flex w-fit overflow-hidden rounded-full border border-white/15">
        {([
          ["upcoming", `Upcoming (${upcoming.length})`],
          ["past", `Past (${past.length})`],
        ] as [ListTab, string][]).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setTab(val)}
            className={`px-4 py-1.5 text-sm font-medium transition ${
              tab === val ? "bg-white/15 text-white" : "text-white/55 hover:bg-white/10"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-amber-400/10 text-amber-300">
            <IconCalendar className="h-6 w-6" />
          </span>
          <p className="text-sm text-white/60">
            No {tab} events{tab === "upcoming" ? " yet" : ""}.
          </p>
          {tab === "upcoming" && (
            <Link
              href="/events/new"
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-0)] active:scale-[0.98] motion-reduce:transition-none"
            >
              <IconPlus className="h-4 w-4" />
              Post the first event
            </Link>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {list.map((ev) => (
            <li key={ev.id}>
              <EventRowCard event={ev} onClick={() => onPick(ev.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EventRowCard({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  const isOhs = event.source === "ohs";
  // A left accent stripe colored by kind makes the list scannable at a glance:
  // violet = OHS calendar, sky = online community event, amber = in-person.
  const accent = isOhs
    ? "before:bg-violet-400/70"
    : event.isOnline
      ? "before:bg-sky-400/70"
      : "before:bg-amber-400/70";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex w-full items-start gap-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-4 pl-5 text-left transition-all before:absolute before:inset-y-0 before:left-0 before:w-1 ${accent} hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-0)] active:translate-y-0 active:scale-[0.995] motion-reduce:transition-none motion-reduce:hover:translate-y-0`}
    >
      <DateBlock event={event} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-white">{event.title}</span>
          {isOhs && <OhsBadge />}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/60">
          <span>{formatEventWhen(event)}</span>
          <PlaceBadge event={event} />
          {event.goingCount > 0 && <span>{event.goingCount} going</span>}
        </div>
      </div>
      <IconChevronRight className="mt-1 h-4 w-4 shrink-0 text-white/30 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </button>
  );
}

// Distinct, consistent OHS school-calendar badge — a violet dot + label so it
// reads the same everywhere it appears (list rows, detail drawers).
function OhsBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/30 bg-violet-400/15 px-2 py-0.5 text-[11px] font-medium text-violet-200">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-violet-300" />
      OHS
    </span>
  );
}

function DateBlock({ event }: { event: CalendarEvent }) {
  const d = new Date(event.startsAt);
  return (
    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/40 text-center">
      <div>
        <div className="text-[10px] font-medium uppercase text-amber-300/80">
          {d.toLocaleDateString(undefined, { month: "short" })}
        </div>
        <div className="-mt-0.5 text-base font-semibold leading-none text-white">{d.getDate()}</div>
      </div>
    </div>
  );
}

// A side drawer (overlay panel) showing one event's full detail with RSVP +
// add-to-calendar, and a link to the dedicated detail page.
function DetailDrawer({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const isOhs = event.source === "ohs";
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">{event.title}</h3>
            {isOhs && <OhsBadge />}
          </div>
          <p className="mt-1 text-sm text-white/60">{formatEventWhen(event)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-8 w-8 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <PlaceBadge event={event} />
        {event.authorLabel && <span className="text-white/45">· {event.authorLabel}</span>}
      </div>

      {event.isOnline && event.onlineUrl && (
        <a
          href={event.onlineUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block max-w-full truncate text-sm text-sky-300 hover:text-sky-200"
        >
          {event.onlineUrl}
        </a>
      )}

      {event.description && (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/75">
          {event.description}
        </p>
      )}

      {!isOhs && (
        <div className="mt-4">
          <RsvpControl event={event} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <AddToCalendar event={event} />
        <Link
          href={`/events/${event.id}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10"
        >
          Open event <IconChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </Overlay>
  );
}

function DayDrawer({
  cell,
  onClose,
  onPickEvent,
}: {
  cell: DayCell;
  onClose: () => void;
  onPickEvent: (id: string) => void;
}) {
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">
          {cell.date.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-8 w-8 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>
      {cell.events.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-white/50">
          <IconCalendar className="h-4 w-4" /> Nothing scheduled this day.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2.5">
          {cell.events.map((ev) => (
            <li key={ev.id}>
              <EventRowCard event={ev} onClick={() => onPickEvent(ev.id)} />
            </li>
          ))}
        </ul>
      )}
    </Overlay>
  );
}

// A right-side slide-over overlay shared by the detail + day drawers.
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative z-10 h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-zinc-950 p-6 shadow-2xl">
        {children}
      </div>
    </div>
  );
}
