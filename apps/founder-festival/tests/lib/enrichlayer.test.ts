import { describe, it, expect } from "vitest";
import { buildProfileText } from "@/lib/enrichlayer";

describe("buildProfileText", () => {
  it("renders name, roles, experience, education, awards into LinkedIn-like text", () => {
    const t = buildProfileText({
      full_name: "Jane Doe",
      headline: "Investor & Advisor",
      occupation: "Co-President at MIT Alumni Angels",
      location_str: "Boston, MA",
      industry: "Venture Capital",
      follower_count: 4200,
      summary: "Angel investor and pitch advisor.",
      experiences: [
        { title: "Co-President", company: "MIT Alumni Angels", starts_at: { year: 2019 }, ends_at: null, description: "Lead the angel group." },
        { title: "Pitch Advisor", company: "Acme Accelerator", starts_at: { year: 2020 }, ends_at: { year: 2023 } },
      ],
      education: [{ degree_name: "MBA", field_of_study: "Finance", school: "MIT Sloan" }],
      accomplishment_honors_awards: [{ title: "Angel of the Year", issuer: "MIT" }],
    });
    expect(t.startsWith("Jane Doe")).toBe(true);
    expect(t).toMatch(/Co-President at MIT Alumni Angels/);
    expect(t).toMatch(/Venture Capital/);
    expect(t).toMatch(/4,200 LinkedIn followers/);
    expect(t).toMatch(/- Co-President at MIT Alumni Angels \(2019–present\) — Lead the angel group\./);
    expect(t).toMatch(/- Pitch Advisor at Acme Accelerator \(2020–2023\)/);
    expect(t).toMatch(/MBA, Finance, MIT Sloan/);
    expect(t).toMatch(/Honors\/Awards: Angel of the Year — MIT/);
  });

  it("handles a minimal profile (name from first+last)", () => {
    expect(buildProfileText({ first_name: "Sam", last_name: "Lee" })).toBe("Sam Lee");
  });
  it("returns empty string for an empty profile", () => {
    expect(buildProfileText({})).toBe("");
  });
});
