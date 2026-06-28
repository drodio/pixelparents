import { describe, it, expect } from "vitest";
import { linkedinUrlFromGuest, type LumaGuest } from "@/lib/luma";

function makeGuest(answers: LumaGuest["registration_answers"]): LumaGuest {
  return {
    api_id: "gst-test",
    registration_answers: answers,
  };
}

describe("linkedinUrlFromGuest", () => {
  it("finds linkedin by label containing 'linkedin' with /in/handle answer", () => {
    const g = makeGuest([
      { label: "What is your LinkedIn profile?", question: null, answer: "/in/casey-rivers" },
    ]);
    expect(linkedinUrlFromGuest(g)).toBe("https://linkedin.com/in/casey-rivers");
  });

  it("normalizes a full https://www.linkedin.com/in/jane-doe/ URL", () => {
    const g = makeGuest([
      { label: "LinkedIn", question: null, answer: "https://www.linkedin.com/in/jane-doe/" },
    ]);
    expect(linkedinUrlFromGuest(g)).toBe("https://linkedin.com/in/jane-doe");
  });

  it("finds linkedin by answer pattern even when label is not linkedin-y", () => {
    const g = makeGuest([
      { label: "Profile URL", question: null, answer: "https://linkedin.com/in/some-person" },
    ]);
    expect(linkedinUrlFromGuest(g)).toBe("https://linkedin.com/in/some-person");
  });

  it("returns null when registration_answers is undefined", () => {
    const g: LumaGuest = { api_id: "gst-test" };
    expect(linkedinUrlFromGuest(g)).toBeNull();
  });

  it("returns null when registration_answers is empty", () => {
    expect(linkedinUrlFromGuest(makeGuest([]))).toBeNull();
  });

  it("returns null when no answer is linkedin-like", () => {
    const g = makeGuest([
      { label: "Company name", question: null, answer: "Acme Corp" },
      { label: "Role", question: null, answer: "Founder" },
    ]);
    expect(linkedinUrlFromGuest(g)).toBeNull();
  });

  it("returns null when linkedin label has empty answer", () => {
    const g = makeGuest([
      { label: "LinkedIn profile?", question: null, answer: "" },
    ]);
    expect(linkedinUrlFromGuest(g)).toBeNull();
  });

  it("handles linkedin.com/in/handle (no scheme) in answer", () => {
    const g = makeGuest([
      { label: "LinkedIn", question: null, answer: "linkedin.com/in/john-smith" },
    ]);
    expect(linkedinUrlFromGuest(g)).toBe("https://linkedin.com/in/john-smith");
  });

  it("matches by question field (not just label)", () => {
    const g = makeGuest([
      { label: null, question: "Your LinkedIn URL?", answer: "in/alice-jones" },
    ]);
    expect(linkedinUrlFromGuest(g)).toBe("https://linkedin.com/in/alice-jones");
  });

  it("returns null when registration_answers is null", () => {
    expect(linkedinUrlFromGuest(makeGuest(null))).toBeNull();
  });

  it("returns null for a bare word like 'yes' even when label is 'linkedin'", () => {
    const g = makeGuest([
      { label: "LinkedIn profile?", question: null, answer: "yes" },
    ]);
    expect(linkedinUrlFromGuest(g)).toBeNull();
  });
});
