import { createHash, randomBytes } from "node:crypto";

// Vendor-namespaced so a holder can tell at a glance this is a Pixel Parents key
// (the way Stripe uses sk_live_ and Anthropic uses sk-ant-). The "live" segment
// leaves room for a future "test" tier.
export const KEY_PREFIX = "sk_pixelparents_live_";

export type Tier = "public" | "approved";

// Generate a new API key. Returns the raw key (shown to the requester exactly
// once), its SHA-256 hash (what we store), and a short display prefix (brand
// prefix + the first 4 random chars, e.g. "sk_pixelparents_live_ab12").
export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const secret = randomBytes(24).toString("base64url"); // 32 url-safe chars
  const raw = `${KEY_PREFIX}${secret}`;
  return { raw, hash: hashApiKey(raw), prefix: raw.slice(0, KEY_PREFIX.length + 4) };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Pull the bearer token out of an Authorization header. Returns null when
// absent or malformed (the caller then returns 401).
export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1]! : null;
}

// Tier gating: does a key of `tier` satisfy an endpoint requiring `required`?
// Public endpoints accept any valid key; approved endpoints need the upgrade.
export function tierSatisfies(tier: Tier, required: Tier): boolean {
  if (required === "public") return true;
  return tier === "approved";
}
