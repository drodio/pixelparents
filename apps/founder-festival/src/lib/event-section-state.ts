// Persistence for which admin event-page sections are collapsed. A single GLOBAL
// preference keyed by section name (not per-event): collapse "Photos" once and it
// stays collapsed across every event + reload. Stored as a JSON array of the
// collapsed section keys. localStorage is passed in so the logic is testable and
// SSR-safe (null storage → everything expanded).

export const EVENT_SECTIONS_COLLAPSED_KEY = "ff:eventAdmin:collapsedSections";

type Reader = Pick<Storage, "getItem">;
type Writer = Pick<Storage, "setItem">;

export function readCollapsed(storage: Reader | null | undefined): Set<string> {
  try {
    const raw = storage?.getItem(EVENT_SECTIONS_COLLAPSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === "string")) : new Set();
  } catch {
    // Bad JSON / blocked storage → default to everything expanded.
    return new Set();
  }
}

export function writeCollapsed(storage: Writer | null | undefined, collapsed: Set<string>): void {
  try {
    storage?.setItem(EVENT_SECTIONS_COLLAPSED_KEY, JSON.stringify([...collapsed]));
  } catch {
    // Non-fatal: the layout just won't persist across reloads in this browser.
  }
}

// Pure toggle used by the UI + tested directly: returns a NEW set with `key`
// flipped, so callers can persist it.
export function toggleCollapsed(collapsed: Set<string>, key: string): Set<string> {
  const next = new Set(collapsed);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}
