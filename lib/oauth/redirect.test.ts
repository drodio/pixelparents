import { describe, it, expect } from "vitest";
import {
  normalizeRedirectUri,
  redirectUriAllowed,
  validateRedirectUris,
} from "./redirect";

describe("redirect URI validation", () => {
  it("accepts https and localhost http, rejects other http + bad input", () => {
    expect(normalizeRedirectUri("https://app.com/callback")).toBe("https://app.com/callback");
    expect(normalizeRedirectUri("http://localhost:3000/cb")).toBe("http://localhost:3000/cb");
    expect(normalizeRedirectUri("http://127.0.0.1/cb")).toBe("http://127.0.0.1/cb");
    expect(normalizeRedirectUri("http://evil.com/cb")).toBeNull(); // non-loopback http
    expect(normalizeRedirectUri("not a url")).toBeNull();
    expect(normalizeRedirectUri("ftp://app.com")).toBeNull();
    expect(normalizeRedirectUri("https://app.com/cb#frag")).toBeNull(); // fragment forbidden
    expect(normalizeRedirectUri("")).toBeNull();
  });

  it("requires EXACT string match (no prefix/substring/host matching)", () => {
    const registered = ["https://app.com/callback"];
    expect(redirectUriAllowed("https://app.com/callback", registered)).toBe(true);
    // trailing slash differs → not allowed
    expect(redirectUriAllowed("https://app.com/callback/", registered)).toBe(false);
    // extra query → not allowed
    expect(redirectUriAllowed("https://app.com/callback?x=1", registered)).toBe(false);
    // different path → not allowed
    expect(redirectUriAllowed("https://app.com/callback/evil", registered)).toBe(false);
    // attacker host that prefixes the registered one → not allowed
    expect(redirectUriAllowed("https://app.com.evil.com/callback", registered)).toBe(false);
    expect(redirectUriAllowed("", registered)).toBe(false);
  });

  it("validateRedirectUris dedupes, rejects empties and bad entries", () => {
    const ok = validateRedirectUris(["https://a.com/cb", "https://a.com/cb", "https://b.com/cb"]);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.uris).toEqual(["https://a.com/cb", "https://b.com/cb"]);

    const empty = validateRedirectUris(["", "  "]);
    expect(empty.ok).toBe(false);

    const bad = validateRedirectUris(["https://a.com/cb", "http://evil.com/cb"]);
    expect(bad.ok).toBe(false);
  });
});
