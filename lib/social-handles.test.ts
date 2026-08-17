import { describe, it, expect } from "vitest";
import {
  normalizeSocialHandle,
  instagramHandleOf,
  xHandleOf,
  instagramUrlFor,
  xUrlFor,
} from "./social-handles";

describe("normalizeSocialHandle", () => {
  it("strips a leading @", () => {
    expect(normalizeSocialHandle("@gopixel")).toBe("gopixel");
  });

  it("accepts a bare handle as-is", () => {
    expect(normalizeSocialHandle("go.pixel_01")).toBe("go.pixel_01");
  });

  it("unwraps pasted profile URLs from instagram, x, and twitter", () => {
    expect(normalizeSocialHandle("https://www.instagram.com/gopixel/")).toBe("gopixel");
    expect(normalizeSocialHandle("x.com/gopixel")).toBe("gopixel");
    expect(normalizeSocialHandle("https://twitter.com/gopixel?ref=x")).toBe("gopixel");
  });

  it("drops characters the platforms don't allow", () => {
    expect(normalizeSocialHandle("go pixel!")).toBe("gopixel");
  });

  it("caps length and returns null for nothing usable", () => {
    expect(normalizeSocialHandle("a".repeat(60))!.length).toBe(30);
    expect(normalizeSocialHandle("   ")).toBeNull();
    expect(normalizeSocialHandle("@@@")).toBeNull();
    expect(normalizeSocialHandle(42)).toBeNull();
    expect(normalizeSocialHandle(null)).toBeNull();
  });
});

describe("extra readers + url builders", () => {
  it("reads stored handles and ignores junk", () => {
    expect(instagramHandleOf({ instagramHandle: "ava" })).toBe("ava");
    expect(instagramHandleOf({ instagramHandle: "  " })).toBeNull();
    expect(instagramHandleOf(null)).toBeNull();
    expect(xHandleOf({ xHandle: "ansh" })).toBe("ansh");
    expect(xHandleOf({})).toBeNull();
  });

  it("builds profile urls", () => {
    expect(instagramUrlFor("ava")).toBe("https://instagram.com/ava");
    expect(xUrlFor("ansh")).toBe("https://x.com/ansh");
  });
});
