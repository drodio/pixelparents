import { describe, it, expect } from "vitest";
import { formatPhone } from "@/lib/format-phone";

describe("formatPhone", () => {
  it("formats a NANP number as +1 (XXX) XXX-XXXX", () => {
    expect(formatPhone("+12022503846")).toBe("+1 (202) 250-3846");
    expect(formatPhone("+14155551234")).toBe("+1 (415) 555-1234");
  });

  it("does not greedily eat 3 digits as the country code for US numbers", () => {
    // Regression: the prior implementation matched "+120" as the dial code.
    expect(formatPhone("+12022503846")).not.toContain("+120 ");
    expect(formatPhone("+12022503846")).toContain("+1 ");
  });

  it("formats Canadian numbers (also +1) the same as US", () => {
    expect(formatPhone("+14165551234")).toBe("+1 (416) 555-1234");
  });

  it("formats known international codes as <dial> <rest>", () => {
    expect(formatPhone("+447911123456")).toBe("+44 7911123456");
    expect(formatPhone("+33612345678")).toBe("+33 612345678");
    expect(formatPhone("+4915123456789")).toBe("+49 15123456789");
  });

  it("falls through to <dial> <rest> for +1 numbers that aren't 10 digits", () => {
    expect(formatPhone("+1202")).toBe("+1 202");
    expect(formatPhone("+1202250384567")).toBe("+1 202250384567");
  });

  it("returns input unchanged when it doesn't start with +", () => {
    expect(formatPhone("12022503846")).toBe("12022503846");
    expect(formatPhone("")).toBe("");
  });

  it("returns input unchanged when no known dial code matches", () => {
    expect(formatPhone("+999999999999")).toBe("+999999999999");
  });

  it("returns input unchanged when the post-dial portion isn't all digits", () => {
    expect(formatPhone("+1abc1234567")).toBe("+1abc1234567");
  });
});
