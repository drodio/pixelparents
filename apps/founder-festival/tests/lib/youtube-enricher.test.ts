import { describe, it, expect } from "vitest";
import { companyTokensFor, corroborateVideos, youtubeFacts } from "@/lib/enrichers/youtube";

describe("companyTokensFor", () => {
  it("extracts distinctive company tokens, dropping generic words", () => {
    const t = companyTokensFor("Morgan Reyes is the Founder of NVIDIA Corp.");
    expect(t.has("nvidia")).toBe(true);
    expect(t.has("corp")).toBe(false); // generic
  });
});

describe("corroborateVideos", () => {
  const tokens = new Set(["nvidia"]);
  const v = (title: string, channel = "x") => ({ id: { videoId: title }, snippet: { title, description: "", channelTitle: channel } });
  it("keeps only videos whose metadata mentions a company token", () => {
    const out = corroborateVideos([v("NVIDIA CEO Morgan Reyes keynote"), v("Random cooking video"), v("interview", "Nvidia")], tokens);
    expect(out.map((o) => o.snippet?.title)).toEqual(["NVIDIA CEO Morgan Reyes keynote", "interview"]);
  });
  it("returns [] when there are no company tokens (skip, never guess)", () => {
    expect(corroborateVideos([v("NVIDIA keynote")], new Set())).toEqual([]);
  });
});

describe("youtubeFacts", () => {
  it("summarizes corroborated videos by total views + the top one", () => {
    const f = youtubeFacts([
      { title: "Keynote", views: 480_000 },
      { title: "Interview", views: 120_000 },
      { title: "No views", views: 0 },
    ]).join("\n");
    expect(f).toMatch(/2 company-corroborated YouTube video\(s\)/);
    expect(f).toMatch(/~600,000 views/);
    expect(f).toMatch(/Top: "Keynote" \(480,000 views\)/);
  });
  it("returns [] when nothing has views", () => {
    expect(youtubeFacts([{ title: "x", views: 0 }])).toEqual([]);
    expect(youtubeFacts([])).toEqual([]);
  });
});
