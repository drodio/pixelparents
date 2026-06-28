import { describe, it, expect } from "vitest";
import {
  toPublicEvent,
  toPublicHost,
  toPublicSponsor,
  toPublicPhoto,
  toPublicBadge,
} from "@/lib/api/events-payload";

const row = {
  slug: "founder-summit-2026",
  title: "Founder Summit",
  hostName: "Jane Doe",
  startsAt: new Date("2026-06-15T18:00:00Z"),
  endsAt: new Date("2026-06-15T22:00:00Z"),
  venue: "SF Venue",
  capacity: 100,
  status: "open",
  description: "An evening for founders.",
  coverUrl: "https://img/cover.png",
  lumaUrl: "https://lu.ma/x",
  source: "luma",
};

describe("toPublicEvent", () => {
  it("maps to snake_case and ISO timestamps, with badges, exposing only public fields", () => {
    expect(toPublicEvent(row, [{ name: "Mixer", slug: "mixer" }])).toEqual({
      slug: "founder-summit-2026",
      title: "Founder Summit",
      host_name: "Jane Doe",
      starts_at: "2026-06-15T18:00:00.000Z",
      ends_at: "2026-06-15T22:00:00.000Z",
      venue: "SF Venue",
      capacity: 100,
      status: "open",
      description: "An evening for founders.",
      cover_url: "https://img/cover.png",
      luma_url: "https://lu.ma/x",
      source: "luma",
      badges: [{ name: "Mixer", slug: "mixer" }],
    });
  });

  it("defaults badges to an empty array", () => {
    expect(toPublicEvent(row).badges).toEqual([]);
  });

  it("never leaks PII/operational fields even if present on the row object", () => {
    const dirty = { ...row, hostEmail: "secret@x.com", createdByEmail: "admin@x.com", criteria: { min: 5 } };
    const out = toPublicEvent(dirty) as Record<string, unknown>;
    expect(out.hostEmail).toBeUndefined();
    expect(out.host_email).toBeUndefined();
    expect(out.createdByEmail).toBeUndefined();
    expect(out.criteria).toBeUndefined();
  });

  it("handles a null end time", () => {
    expect(toPublicEvent({ ...row, endsAt: null }).ends_at).toBeNull();
  });
});

describe("event sub-object transforms (org content only — no people)", () => {
  it("toPublicHost maps icon/url to snake_case", () => {
    expect(toPublicHost({ name: "District", blurb: "Founder hub", iconUrl: "https://i/d.png", url: "https://district.so" }))
      .toEqual({ name: "District", blurb: "Founder hub", icon_url: "https://i/d.png", url: "https://district.so" });
  });

  it("toPublicSponsor maps logo/website to snake_case", () => {
    expect(toPublicSponsor({ name: "Acme VC", blurb: "Seed fund", logoUrl: "https://i/a.png", websiteUrl: "https://acme.vc" }))
      .toEqual({ name: "Acme VC", blurb: "Seed fund", logo_url: "https://i/a.png", website_url: "https://acme.vc" });
  });

  it("toPublicPhoto exposes only url + caption (no uploader/source/order)", () => {
    expect(toPublicPhoto({ blobUrl: "https://blob/p.jpg", caption: "Group shot" }))
      .toEqual({ url: "https://blob/p.jpg", caption: "Group shot" });
  });

  it("toPublicBadge keeps name + slug only (drops internal id)", () => {
    expect(toPublicBadge({ name: "Family friendly", slug: "family-friendly" }))
      .toEqual({ name: "Family friendly", slug: "family-friendly" });
  });
});
