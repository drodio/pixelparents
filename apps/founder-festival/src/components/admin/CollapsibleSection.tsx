"use client";

import { useSyncExternalStore } from "react";
import { FiChevronDown } from "react-icons/fi";
import {
  EVENT_SECTIONS_COLLAPSED_KEY,
  readCollapsed,
  writeCollapsed,
  toggleCollapsed,
} from "@/lib/event-section-state";

// A collapsible admin-event section. The collapsed set is global (cross-event),
// persisted in localStorage, and shared across every instance on the page via a
// module-level store + useSyncExternalStore (SSR-safe: server renders expanded,
// then the client reconciles to the saved layout — same pattern as AdminProfileBox).

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (typeof window !== "undefined") window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", cb);
  };
}
// Snapshot is the raw JSON string — referentially stable unless it actually
// changes, so useSyncExternalStore won't loop.
function getSnapshot(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(EVENT_SECTIONS_COLLAPSED_KEY) ?? "";
  } catch {
    return "";
  }
}
function getServerSnapshot(): string {
  return "";
}

function isCollapsed(raw: string, sectionKey: string): boolean {
  if (!raw) return false;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.includes(sectionKey);
  } catch {
    return false;
  }
}

export function CollapsibleSection({
  sectionKey,
  title,
  // When the section is COLLAPSED, show this count in bold red on the title
  // (matches the left-nav "Pending Items" badge). 0/undefined → no badge.
  badgeCount = 0,
  children,
}: {
  sectionKey: string;
  title: string;
  badgeCount?: number;
  children: React.ReactNode;
}) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const collapsed = isCollapsed(raw, sectionKey);

  function toggle() {
    try {
      writeCollapsed(window.localStorage, toggleCollapsed(readCollapsed(window.localStorage), sectionKey));
    } catch {
      /* storage blocked — no-op */
    }
    emit();
  }

  return (
    <section className="flex flex-col gap-4">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="group flex items-center gap-2 text-left"
      >
        <FiChevronDown
          className={`text-zinc-500 transition-transform ${collapsed ? "-rotate-90" : ""}`}
          aria-hidden
        />
        <h3 className="font-display text-lg font-semibold group-hover:text-white">{title}</h3>
        {collapsed && badgeCount > 0 && (
          <span className="font-bold text-red-500">({badgeCount})</span>
        )}
      </button>
      {/* Keep children mounted (preserves editor state) — just hide when collapsed. */}
      <div className={collapsed ? "hidden" : "flex flex-col gap-4"}>{children}</div>
    </section>
  );
}
