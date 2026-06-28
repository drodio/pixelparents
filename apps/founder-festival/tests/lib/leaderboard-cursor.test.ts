import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor } from "@/lib/leaderboard-cursor";

describe("leaderboard cursor", () => {
  it("round-trips score + id", () => {
    const enc = encodeCursor({ score: 1234, id: "abc-123" });
    expect(typeof enc).toBe("string");
    expect(decodeCursor(enc)).toEqual({ score: 1234, id: "abc-123" });
  });

  it("handles negative and zero scores", () => {
    expect(decodeCursor(encodeCursor({ score: 0, id: "x" }))).toEqual({ score: 0, id: "x" });
    expect(decodeCursor(encodeCursor({ score: -5, id: "y" }))).toEqual({ score: -5, id: "y" });
  });

  it("returns null for malformed cursors", () => {
    expect(decodeCursor("not-base64-json")).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    // valid base64url but wrong shape
    expect(decodeCursor(Buffer.from('{"s":"x","i":"y"}').toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from('{"i":"y"}').toString("base64url"))).toBeNull();
  });
});
