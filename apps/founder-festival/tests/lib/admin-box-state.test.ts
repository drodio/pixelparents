import { describe, it, expect } from "vitest";
import { ADMIN_BOX_MINIMIZED_KEY, readMinimized, writeMinimized } from "@/lib/admin-box-state";

// localStorage is injected so the persistence logic is testable in the node env
// (the component passes window.localStorage). The minimized flag is a single
// global preference; "1" = minimized, anything else = expanded.
function fakeStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

describe("admin-box-state", () => {
  it("reads minimized only when the stored value is exactly '1'", () => {
    expect(readMinimized(fakeStorage({ [ADMIN_BOX_MINIMIZED_KEY]: "1" }))).toBe(true);
    expect(readMinimized(fakeStorage({ [ADMIN_BOX_MINIMIZED_KEY]: "0" }))).toBe(false);
    expect(readMinimized(fakeStorage())).toBe(false); // unset → expanded by default
    expect(readMinimized(null)).toBe(false); // no storage (SSR) → expanded
  });

  it("writes '1' / '0' and never throws on a failing storage", () => {
    const s = fakeStorage();
    writeMinimized(s, true);
    expect(s.getItem(ADMIN_BOX_MINIMIZED_KEY)).toBe("1");
    writeMinimized(s, false);
    expect(s.getItem(ADMIN_BOX_MINIMIZED_KEY)).toBe("0");
    const throwing = { setItem: () => { throw new Error("quota"); } };
    expect(() => writeMinimized(throwing, true)).not.toThrow();
  });

  it("survives a throwing getItem (privacy mode / blocked storage)", () => {
    const throwing = { getItem: () => { throw new Error("denied"); } };
    expect(readMinimized(throwing)).toBe(false);
  });
});
