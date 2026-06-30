import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getStudentBuilderCount } from "@/lib/db/signups";
import { OHS_AFFILIATIONS } from "@/lib/options";

// getStudentBuilderCount runs raw SQL via getSql(), so it requires a live DB.
// The home page wraps the call in a try/catch and degrades to 0; here we just
// verify the contract: without DATABASE_URL it rejects (rather than silently
// returning a wrong number), and the student-affiliation strings it filters on
// stay in lockstep with the canonical OHS_AFFILIATIONS list.

describe("getStudentBuilderCount", () => {
  const original = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });

  it("rejects when no database is configured", async () => {
    await expect(getStudentBuilderCount()).rejects.toThrow(/DATABASE_URL/);
  });
});

describe("student affiliations (lockstep with options)", () => {
  it("OHS_AFFILIATIONS exposes the two student affiliations the count filters on", () => {
    // Indices 3 and 4 are what getStudentBuilderCount slices for its filter.
    expect(OHS_AFFILIATIONS[3]).toBe(
      "Current OHS student (I'm currently enrolled at OHS)",
    );
    expect(OHS_AFFILIATIONS[4]).toBe("Alumni student (I graduated from OHS)");
  });
});
