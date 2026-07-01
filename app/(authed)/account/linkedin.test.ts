import { describe, expect, it } from "vitest";
import { validateLinkedinUrl, LINKEDIN_URL_MAX } from "./linkedin";

describe("validateLinkedinUrl", () => {
  it("accepts a full https LinkedIn URL and returns a canonical href", () => {
    const r = validateLinkedinUrl("https://www.linkedin.com/in/jane-doe");
    expect(r).toEqual({ ok: true, value: "https://www.linkedin.com/in/jane-doe" });
  });

  it("upgrades a scheme-less host to https", () => {
    const r = validateLinkedinUrl("linkedin.com/in/jane-doe");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("https://linkedin.com/in/jane-doe");
  });

  it("trims surrounding + collapses inner whitespace", () => {
    const r = validateLinkedinUrl("  https://linkedin.com/in/jane   ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("https://linkedin.com/in/jane");
  });

  it("treats an empty / whitespace-only value as clearing the field (null)", () => {
    expect(validateLinkedinUrl("")).toEqual({ ok: true, value: null });
    expect(validateLinkedinUrl("   ")).toEqual({ ok: true, value: null });
    expect(validateLinkedinUrl(null)).toEqual({ ok: true, value: null });
    expect(validateLinkedinUrl(undefined)).toEqual({ ok: true, value: null });
  });

  it("rejects non-http(s) schemes (no javascript:/data: XSS vectors)", () => {
    expect(validateLinkedinUrl("javascript:alert(1)").ok).toBe(false);
    expect(validateLinkedinUrl("data:text/html,<script>").ok).toBe(false);
    expect(validateLinkedinUrl("mailto:me@example.com").ok).toBe(false);
  });

  it("rejects a value with no real host", () => {
    expect(validateLinkedinUrl("notaurl").ok).toBe(false);
    expect(validateLinkedinUrl("https:///in/x").ok).toBe(false);
  });

  it("rejects an over-long URL", () => {
    const long = `https://linkedin.com/in/${"a".repeat(LINKEDIN_URL_MAX)}`;
    expect(validateLinkedinUrl(long).ok).toBe(false);
  });

  it("accepts a plain http URL (still http(s))", () => {
    const r = validateLinkedinUrl("http://linkedin.com/in/x");
    expect(r.ok).toBe(true);
  });

  it("accepts www. and country linkedin subdomains", () => {
    expect(validateLinkedinUrl("https://www.linkedin.com/in/x").ok).toBe(true);
    expect(validateLinkedinUrl("https://ca.linkedin.com/in/x").ok).toBe(true);
    expect(validateLinkedinUrl("linkedin.com/in/x").ok).toBe(true);
  });

  it("rejects a non-LinkedIn host (field is labeled/shared as LinkedIn)", () => {
    expect(validateLinkedinUrl("https://example.com/in/x").ok).toBe(false);
    expect(validateLinkedinUrl("github.com/jane").ok).toBe(false);
    // Not a subdomain of linkedin.com — a lookalike host must not pass.
    expect(validateLinkedinUrl("https://linkedin.com.evil.com/in/x").ok).toBe(
      false,
    );
    expect(validateLinkedinUrl("https://notlinkedin.com/in/x").ok).toBe(false);
  });
});
