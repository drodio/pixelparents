import { describe, it, expect } from "vitest";
import {
  readCollapsed,
  writeCollapsed,
  toggleCollapsed,
  EVENT_SECTIONS_COLLAPSED_KEY,
} from "@/lib/event-section-state";

// Minimal in-memory localStorage stand-in.
function fakeStorage(initial?: string) {
  const map = new Map<string, string>();
  if (initial != null) map.set(EVENT_SECTIONS_COLLAPSED_KEY, initial);
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    _raw: () => map.get(EVENT_SECTIONS_COLLAPSED_KEY) ?? null,
  };
}

describe("event-section-state", () => {
  it("defaults to everything expanded (empty set) when nothing is stored", () => {
    expect(readCollapsed(fakeStorage())).toEqual(new Set());
    expect(readCollapsed(null)).toEqual(new Set());
  });

  it("round-trips a collapsed set through write → read", () => {
    const s = fakeStorage();
    writeCollapsed(s, new Set(["photos", "learnings"]));
    expect(readCollapsed(s)).toEqual(new Set(["photos", "learnings"]));
    expect(JSON.parse(s._raw()!)).toEqual(["photos", "learnings"]);
  });

  it("toggleCollapsed flips a key without mutating the input", () => {
    const before = new Set(["photos"]);
    const added = toggleCollapsed(before, "attendees");
    expect(added).toEqual(new Set(["photos", "attendees"]));
    expect(before).toEqual(new Set(["photos"])); // unchanged
    expect(toggleCollapsed(added, "photos")).toEqual(new Set(["attendees"]));
  });

  it("tolerates corrupt JSON / non-array (returns empty set)", () => {
    expect(readCollapsed(fakeStorage("not json"))).toEqual(new Set());
    expect(readCollapsed(fakeStorage('{"a":1}'))).toEqual(new Set());
    // filters out non-string members
    expect(readCollapsed(fakeStorage('["photos", 3, null]'))).toEqual(new Set(["photos"]));
  });
});
