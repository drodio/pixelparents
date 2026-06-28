import { describe, it, expect } from "vitest";
import { slugifyEvent, isValidEventSlug, slugify, isValidSlug } from "@/lib/slugify";

describe("slugifyEvent (permissive: keeps - _ +)", () => {
  it("keeps hyphens, underscores, and plus signs verbatim", () => {
    expect(slugifyEvent("unconference+dinner")).toBe("unconference+dinner");
    expect(slugifyEvent("co-founder_unconference+dinner")).toBe("co-founder_unconference+dinner");
  });
  it("lowercases and collapses other invalid runs to a single hyphen", () => {
    expect(slugifyEvent("Unconference & Dinner!!")).toBe("unconference-dinner");
    expect(slugifyEvent("a   b")).toBe("a-b");
  });
  it("trims leading/trailing separators", () => {
    expect(slugifyEvent("+_-unconference-_+")).toBe("unconference");
  });
  it("validates the permissive charset", () => {
    expect(isValidEventSlug("unconference+dinner")).toBe(true);
    expect(isValidEventSlug("a_b-c+d")).toBe(true);
    expect(isValidEventSlug("has space")).toBe(false);
    expect(isValidEventSlug("Upper")).toBe(false);
  });
});

describe("global slugify is unchanged (hosts/sponsors rely on hyphen-only)", () => {
  it("still collapses _ and + to hyphens", () => {
    expect(slugify("unconference+dinner")).toBe("unconference-dinner");
    expect(slugify("a_b")).toBe("a-b");
    expect(isValidSlug("a+b")).toBe(false);
  });
});
