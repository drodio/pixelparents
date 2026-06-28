import { describe, it, expect } from "vitest";
import { hasInsightContent } from "@/components/admin/AttendeeManager";

const entry = (over: Partial<{ html: string; status: string }>) => ({
  html: "",
  method: "chief",
  generatedAt: "2026-06-20T00:00:00Z",
  status: "done",
  error: null,
  ...over,
});

describe("hasInsightContent (attendee dots: green = present)", () => {
  it("is green only when done with non-empty body text", () => {
    expect(hasInsightContent(entry({ status: "done", html: "<p>Real insight.</p>" }))).toBe(true);
  });

  it("is red when missing entirely", () => {
    expect(hasInsightContent(undefined)).toBe(false);
  });

  it("is red while generating, failed, or never run", () => {
    expect(hasInsightContent(entry({ status: "generating", html: "" }))).toBe(false);
    expect(hasInsightContent(entry({ status: "failed", html: "" }))).toBe(false);
  });

  it("is red when done but the body is empty markup / whitespace", () => {
    expect(hasInsightContent(entry({ status: "done", html: "" }))).toBe(false);
    expect(hasInsightContent(entry({ status: "done", html: "<p></p>" }))).toBe(false);
    expect(hasInsightContent(entry({ status: "done", html: "   \n  " }))).toBe(false);
  });
});
