import { describe, expect, it } from "vitest";
import {
  KEY_PREFIX,
  generateApiKey,
  hashApiKey,
  parseBearer,
} from "@/lib/api-keys";

describe("generateApiKey", () => {
  it("returns a raw key carrying the brand prefix", () => {
    const { raw } = generateApiKey();
    expect(raw.startsWith(KEY_PREFIX)).toBe(true);
    // brand prefix + 32 url-safe secret chars
    expect(raw.length).toBe(KEY_PREFIX.length + 32);
  });

  it("derives the stored hash from the raw key", () => {
    const { raw, hash } = generateApiKey();
    expect(hash).toBe(hashApiKey(raw));
    // sha-256 hex is 64 chars
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("exposes a short display prefix (brand + 4 chars), not the full secret", () => {
    const { raw, prefix } = generateApiKey();
    expect(prefix).toBe(raw.slice(0, KEY_PREFIX.length + 4));
    expect(prefix.length).toBe(KEY_PREFIX.length + 4);
    expect(raw.startsWith(prefix)).toBe(true);
    expect(prefix.length).toBeLessThan(raw.length);
  });

  it("produces a distinct key on each call", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("hashApiKey", () => {
  it("is deterministic and collision-distinct", () => {
    expect(hashApiKey("sk_pixelparents_live_abc")).toBe(
      hashApiKey("sk_pixelparents_live_abc"),
    );
    expect(hashApiKey("a")).not.toBe(hashApiKey("b"));
  });
});

describe("parseBearer", () => {
  it("extracts the token from a well-formed header", () => {
    expect(parseBearer("Bearer sk_pixelparents_live_xyz")).toBe(
      "sk_pixelparents_live_xyz",
    );
  });

  it("is case-insensitive on the scheme", () => {
    expect(parseBearer("bearer tok")).toBe("tok");
    expect(parseBearer("BEARER tok")).toBe("tok");
  });

  it("returns null for missing or malformed headers", () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("")).toBeNull();
    expect(parseBearer("sk_pixelparents_live_xyz")).toBeNull(); // no scheme
    expect(parseBearer("Basic abc")).toBeNull();
    expect(parseBearer("Bearer")).toBeNull(); // no token
    expect(parseBearer("Bearer a b")).toBeNull(); // token has whitespace
  });
});
