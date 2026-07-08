"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notificationsSubtitle, type NotificationRow } from "@/lib/db/notifications";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "./actions";

// The notifications center list (client). Renders newest-first; unread rows are
// highlighted with an amber rail + dot. Clicking a row marks it read (best-effort)
// then navigates to its in-app `link`. A "Mark all read" control clears the unread
// state in one shot. Relative timestamps, per-type icons, and an empty state keep
// it feeling polished. All identity/authorization lives server-side in actions.ts;
// this component only renders data it was handed and calls the scoped actions.

// The list caps at `listNotifications`' 50-row window, so the count of unread
// rows we hold in memory can UNDERSTATE how many unread the recipient truly has
// (a parent with 60 unread only sees 50 rows). page.tsx passes the server-side
// COUNT(*) as `unreadTotal` so the subtitle and the bell agree; we fall back to
// counting the loaded rows only when it isn't supplied.
type Props = { initial: NotificationRow[]; unreadTotal?: number };

// Broadcast that the caller's notifications changed so the sidebar bell (which
// fetches its own unread count independently) can reconcile in the same viewport
// instead of showing a stale badge until the tab is refocused or navigated away.
function announceNotificationsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("notifications:changed"));
  }
}

export function NotificationsClient({ initial, unreadTotal }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Unread in the loaded window; `serverUnread` corrects for the 50-row cap once
  // rows have been cleared (it can't go below what's actually visible-unread).
  const loadedUnread = items.filter((n) => !n.read).length;
  const unread =
    typeof unreadTotal === "number" ? Math.max(loadedUnread, unreadTotal) : loadedUnread;

  function open(n: NotificationRow) {
    // Optimistically mark read in the UI, persist in the background, then navigate.
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      // Persist and reconcile: on failure roll the row back and surface the error
      // so the list reflects reality instead of a false "read".
      void markNotificationReadAction({ id: n.id })
        .then((res) => {
          if (!res.ok) {
            setItems((prev) =>
              prev.map((x) => (x.id === n.id ? { ...x, read: false } : x)),
            );
            setError(res.error);
          } else {
            announceNotificationsChanged();
          }
        })
        .catch(() => {
          setItems((prev) =>
            prev.map((x) => (x.id === n.id ? { ...x, read: false } : x)),
          );
          setError("Couldn't update that notification.");
        });
    }
    if (n.link) router.push(n.link);
    else router.refresh();
  }

  function markAll() {
    setError(null);
    // Snapshot so we can roll back if the server rejects/throws.
    const snapshot = items;
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    startTransition(async () => {
      try {
        const res = await markAllNotificationsReadAction();
        if (!res.ok) {
          setItems(snapshot);
          setError(res.error);
          return;
        }
        announceNotificationsChanged();
        router.refresh();
      } catch {
        setItems(snapshot);
        setError("Couldn't update your notifications.");
      }
    });
  }

  return (
    <section>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Notifications</h1>
          <p className="mt-1 text-sm text-white/55">
            {notificationsSubtitle(unread, items.length)}
          </p>
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={markAll}
            disabled={pending}
            className="shrink-0 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            Mark all read
          </button>
        )}
      </header>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-400/30 bg-red-400/[0.07] px-4 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n)}
                className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                  n.read
                    ? "border-white/10 bg-white/[0.02] hover:bg-white/5"
                    : "border-amber-400/30 bg-amber-400/[0.07] hover:bg-amber-400/10"
                }`}
              >
                <span
                  className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                    n.read ? "bg-white/5 text-white/50" : "bg-amber-400/20 text-amber-300"
                  }`}
                  aria-hidden="true"
                >
                  <TypeIcon type={n.type} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span
                      className={`truncate text-sm font-semibold ${
                        n.read ? "text-white/80" : "text-white"
                      }`}
                    >
                      {n.title}
                    </span>
                    {!n.read && (
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full bg-amber-400"
                      />
                    )}
                  </span>
                  {n.body && (
                    <span className="mt-0.5 block truncate text-sm text-white/60">{n.body}</span>
                  )}
                  <span className="mt-1 block text-xs text-white/40">{relativeTime(n.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
      <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-white/5 text-white/40">
        <BellGlyph />
      </span>
      <p className="text-sm font-medium text-white/70">No notifications yet</p>
      <p className="mt-1 max-w-xs text-sm text-white/45">
        {/* Single source of truth: the same "no notifications yet" copy the header
            subtitle uses (notificationsSubtitle with 0/0), so the empty state can
            never promise fewer sources than the app actually emits. */}
        {notificationsSubtitle(0, 0)}
      </p>
    </div>
  );
}

// Map a notification type to a glyph. Falls back to the bell for unknown types so
// a future server-side type never renders blank.
function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case "community_response":
      return <ChatGlyph />;
    case "community_connected":
      return <HeartGlyph />;
    case "community_mention":
      return <AtGlyph />;
    case "community_reply":
      return <ChatGlyph />;
    case "community_event":
      return <CalendarGlyph />;
    case "event_rsvp":
      return <CalendarGlyph />;
    case "board_contribution":
      return <BoardGlyph />;
    case "interest_match":
      return <SparkGlyph />;
    case "age16_cert_request":
    case "age16_cert_approved":
      return <HeartGlyph />;
    default:
      return <BellGlyph />;
  }
}

// Relative timestamp ("just now", "5m ago", "3h ago", "2d ago", else a date).
// Accepts a Date or an ISO string (server actions may serialize createdAt).
function relativeTime(value: Date | string): string {
  const then = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// --- In-house glyphs (24×24 stroke, app icon language) -----------------------

function svgProps(className = "h-5 w-5") {
  return {
    viewBox: "0 0 24 24",
    width: "1em",
    height: "1em",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
  };
}

function BellGlyph() {
  return (
    <svg {...svgProps()}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

function ChatGlyph() {
  return (
    <svg {...svgProps()}>
      <path d="M21 11.5a8 8 0 0 1-11.5 7.2L4 20l1.3-5A8 8 0 1 1 21 11.5Z" />
    </svg>
  );
}

function HeartGlyph() {
  return (
    <svg {...svgProps()}>
      <path d="M12 20s-7-4.3-9.3-9A4.7 4.7 0 0 1 12 6.5 4.7 4.7 0 0 1 21.3 11C19 15.7 12 20 12 20Z" />
    </svg>
  );
}

function CalendarGlyph() {
  return (
    <svg {...svgProps()}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </svg>
  );
}

// @-mention glyph (a circled "at" mark) for community_mention.
function AtGlyph() {
  return (
    <svg {...svgProps()}>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a2.5 2.5 0 0 0 5 0v-1a9 9 0 1 0-3.5 7.1" />
    </svg>
  );
}

// Sparkle glyph for interest_match (a new family shares one of your interests).
function SparkGlyph() {
  return (
    <svg {...svgProps()}>
      <path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z" />
      <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" />
    </svg>
  );
}

// Board/bookmark glyph for board_contribution (a resource-board card).
function BoardGlyph() {
  return (
    <svg {...svgProps()}>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </svg>
  );
}
