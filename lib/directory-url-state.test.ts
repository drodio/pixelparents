import { describe, expect, it } from "vitest";
import {
  AGE_MAX,
  AGE_MIN,
  DEFAULT_PER_ROW,
  defaultUrlState,
  parseUrlState,
  serializeUrlState,
  type DirectoryUrlState,
} from "@/lib/directory-url-state";

const INTERESTS = new Set(["robotics", "chess", "ai"]);

function parse(qs: string, valid = INTERESTS) {
  return parseUrlState(new URLSearchParams(qs), valid);
}

describe("parseUrlState", () => {
  it("returns defaults for an empty query string", () => {
    expect(parse("")).toEqual(defaultUrlState());
  });

  it("reads search text", () => {
    expect(parse("q=robotics%20kids").query).toBe("robotics kids");
  });

  it("keeps only known interests, lowercased, deduped, order preserved", () => {
    const s = parse("interests=Robotics,unknown,CHESS,robotics,ai");
    expect(s.interests).toEqual(["robotics", "chess", "ai"]);
  });

  it("drops all interests when none are valid", () => {
    expect(parse("interests=basketball,cooking").interests).toEqual([]);
  });

  it("reads valid sort key + direction and ignores invalid ones", () => {
    expect(parse("sort=child&dir=desc")).toMatchObject({
      sortKey: "child",
      sortDir: "desc",
    });
    expect(parse("sort=bogus&dir=sideways")).toMatchObject({
      sortKey: "name",
      sortDir: "asc",
    });
  });

  it("parses an age range", () => {
    expect(parse("age=6-12")).toMatchObject({ ageLower: 6, ageUpper: 12 });
  });

  it("clamps out-of-range age bounds", () => {
    const s = parse("age=0-99");
    expect(s.ageLower).toBe(AGE_MIN);
    expect(s.ageUpper).toBe(AGE_MAX);
  });

  it("normalizes a reversed age range", () => {
    expect(parse("age=12-6")).toMatchObject({ ageLower: 6, ageUpper: 12 });
  });

  it("falls back to all-ages on a malformed age param", () => {
    expect(parse("age=abc")).toMatchObject({ ageLower: AGE_MIN, ageUpper: AGE_MAX });
    expect(parse("age=5")).toMatchObject({ ageLower: AGE_MIN, ageUpper: AGE_MAX });
  });

  it("clamps perRow and ignores garbage", () => {
    expect(parse("perRow=5").perRow).toBe(5);
    expect(parse("perRow=99").perRow).toBe(10);
    expect(parse("perRow=0").perRow).toBe(1);
    expect(parse("perRow=abc").perRow).toBe(DEFAULT_PER_ROW);
  });

  it("never persists location (no age/radius leakage path) — only known keys parsed", () => {
    // A crafted URL with a stray lat/lng must be ignored entirely.
    const s = parse("lat=37.4&lng=-122.1&q=ai");
    expect(s.query).toBe("ai");
    expect(s).not.toHaveProperty("lat");
    expect(s).not.toHaveProperty("lng");
  });
});

describe("serializeUrlState", () => {
  it("produces an empty query string for the default state", () => {
    expect(serializeUrlState(defaultUrlState()).toString()).toBe("");
  });

  it("omits fields at their defaults", () => {
    const s: DirectoryUrlState = {
      ...defaultUrlState(),
      query: "ai",
    };
    expect(serializeUrlState(s).toString()).toBe("q=ai");
  });

  it("encodes a fully-populated state", () => {
    const s: DirectoryUrlState = {
      query: "robotics",
      interests: ["robotics", "ai"],
      sortKey: "child",
      sortDir: "desc",
      ageLower: 6,
      ageUpper: 12,
      perRow: 5,
    };
    const params = serializeUrlState(s);
    expect(params.get("q")).toBe("robotics");
    expect(params.get("interests")).toBe("robotics,ai");
    expect(params.get("sort")).toBe("child");
    expect(params.get("dir")).toBe("desc");
    expect(params.get("age")).toBe("6-12");
    expect(params.get("perRow")).toBe("5");
  });

  it("encodes age only when narrowed from the full span", () => {
    const lowerOnly = serializeUrlState({ ...defaultUrlState(), ageLower: 8 });
    expect(lowerOnly.get("age")).toBe(`8-${AGE_MAX}`);
    const full = serializeUrlState({ ...defaultUrlState(), ageLower: AGE_MIN, ageUpper: AGE_MAX });
    expect(full.has("age")).toBe(false);
  });
});

describe("round-trip", () => {
  it("parse(serialize(state)) is identity for valid states", () => {
    const original: DirectoryUrlState = {
      query: "chess",
      interests: ["chess", "ai"],
      sortKey: "child",
      sortDir: "desc",
      ageLower: 7,
      ageUpper: 15,
      perRow: 4,
    };
    const round = parseUrlState(serializeUrlState(original), INTERESTS);
    expect(round).toEqual(original);
  });
});
