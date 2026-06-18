import { describe, expect, it } from "vitest";
import { formatPhone } from "@/lib/format";

describe("formatPhone", () => {
  it("formats 10-digit US numbers as XXX-XXX-XXXX", () => {
    expect(formatPhone("2015550142")).toBe("201-555-0142");
    expect(formatPhone("(201) 555-0142")).toBe("201-555-0142");
  });

  it("formats 11-digit leading-1 numbers", () => {
    expect(formatPhone("12015550142")).toBe("1-201-555-0142");
    expect(formatPhone("+1 201 555 0142")).toBe("1-201-555-0142");
  });

  it("leaves international / unexpected / empty values unchanged", () => {
    expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(formatPhone("")).toBe("");
    expect(formatPhone(null)).toBe("");
    expect(formatPhone(undefined)).toBe("");
  });
});
