import { describe, it, expect } from "vitest";
import { clerkAuthUrls, isSatelliteHost, PRIMARY_ORIGIN } from "./clerk-urls";

// These tests exist because of a real outage, not for coverage. Clerk falls back
// to its Account Portal (accounts.<domain>) whenever signInUrl/signUpUrl are
// undefined — and that portal 404s on gopixel.org and 403s on pixelparents.org.
// A missing prop therefore fails SILENTLY, sending live users to a dead page.
// Every assertion below is the invariant that prevents that.
describe("clerkAuthUrls", () => {
  for (const isSatellite of [false, true]) {
    const label = isSatellite ? "satellite" : "primary";
    const urls = clerkAuthUrls(isSatellite);

    it(`${label}: never returns an empty or undefined URL`, () => {
      expect(urls.signInUrl).toBeTruthy();
      expect(urls.signUpUrl).toBeTruthy();
    });

    it(`${label}: never points at the (unprovisioned) Clerk Account Portal`, () => {
      for (const u of [urls.signInUrl, urls.signUpUrl]) {
        expect(u).not.toContain("accounts.");
        expect(u).not.toContain("clerk.accounts");
      }
    });

    it(`${label}: sign-in and sign-up are distinct routes`, () => {
      expect(urls.signInUrl).not.toBe(urls.signUpUrl);
    });
  }

  it("satellite uses ABSOLUTE primary URLs (relative would break the handshake)", () => {
    const { signInUrl, signUpUrl } = clerkAuthUrls(true);
    expect(signInUrl).toBe(`${PRIMARY_ORIGIN}/sign-in`);
    expect(signUpUrl).toBe(`${PRIMARY_ORIGIN}/sign-up`);
  });

  it("primary uses relative paths so preview deployments work too", () => {
    const { signInUrl, signUpUrl } = clerkAuthUrls(false);
    expect(signInUrl).toBe("/sign-in");
    expect(signUpUrl).toBe("/sign-up");
  });
});

describe("isSatelliteHost", () => {
  it("treats pixelparents.org (and www) as the satellite", () => {
    expect(isSatelliteHost("pixelparents.org")).toBe(true);
    expect(isSatelliteHost("www.pixelparents.org")).toBe(true);
    expect(isSatelliteHost("PixelParents.org")).toBe(true);
  });

  it("treats gopixel.org as the primary", () => {
    expect(isSatelliteHost("gopixel.org")).toBe(false);
    expect(isSatelliteHost("www.gopixel.org")).toBe(false);
  });

  it("ignores a port, so localhost:3000 and previews resolve to primary", () => {
    expect(isSatelliteHost("pixelparents.org:443")).toBe(true);
    expect(isSatelliteHost("localhost:3000")).toBe(false);
  });

  it("is safe on null/empty", () => {
    expect(isSatelliteHost(null)).toBe(false);
    expect(isSatelliteHost("")).toBe(false);
  });
});
