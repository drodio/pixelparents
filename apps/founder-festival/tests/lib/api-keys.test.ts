import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, parseBearer } from "@/lib/api-keys";

describe("api-keys crypto", () => {
  it("generateApiKey returns a vendor-namespaced sk_festival_live_ key, its sha256 hash, and a display prefix", () => {
    const { raw, hash, prefix } = generateApiKey();
    expect(raw.startsWith("sk_festival_live_")).toBe(true);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // display prefix = brand prefix + first 4 random chars
    expect(prefix.startsWith("sk_festival_live_")).toBe(true);
    expect(prefix).toBe(raw.slice(0, "sk_festival_live_".length + 4));
    expect(hash).toBe(hashApiKey(raw)); // hash is deterministic for the raw key
  });

  it("generateApiKey is unique per call", () => {
    expect(generateApiKey().raw).not.toBe(generateApiKey().raw);
  });

  it("parseBearer extracts the token, case-insensitively", () => {
    expect(parseBearer("Bearer sk_live_abc")).toBe("sk_live_abc");
    expect(parseBearer("bearer sk_live_abc")).toBe("sk_live_abc");
  });

  it("parseBearer returns null for missing/malformed headers", () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("")).toBeNull();
    expect(parseBearer("sk_live_abc")).toBeNull();
    expect(parseBearer("Basic xyz")).toBeNull();
  });
});
