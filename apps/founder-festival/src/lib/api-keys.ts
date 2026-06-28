import { createHash, randomBytes } from "node:crypto";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

// Vendor-namespaced so a holder can tell at a glance this is a Founder Festival
// key (the way Stripe uses sk_live_/sk_test_ and Anthropic uses sk-ant-). The
// "live" segment leaves room for a future "test" tier.
const KEY_PREFIX = "sk_festival_live_";

// Generate a new API key. Returns the raw key (shown to the user exactly once),
// its SHA-256 hash (what we store), and a short display prefix (brand prefix +
// the first 4 random chars, e.g. "sk_festival_live_ab12").
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

export type VerifiedKey = { keyId: string; clerkUserId: string };

// Verify an Authorization header against api_keys. Returns the owner on success,
// or null (→ 401) when the key is missing, malformed, unknown, or revoked.
// Updates last_used_at on success (best-effort; not awaited-critical).
export async function verifyApiKey(authHeader: string | null): Promise<VerifiedKey | null> {
  const raw = parseBearer(authHeader);
  if (!raw) return null;
  const hash = hashApiKey(raw);
  const [row] = await db
    .select({ id: apiKeys.id, clerkUserId: apiKeys.clerkUserId })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row) return null;
  // Best-effort last_used_at touch: a transient write failure here must NOT
  // fail an otherwise-valid request, so swallow any error.
  try {
    await db.update(apiKeys).set({ lastUsedAt: sql`NOW()` }).where(eq(apiKeys.id, row.id));
  } catch {
    // ignore — last_used_at is non-critical telemetry
  }
  return { keyId: row.id, clerkUserId: row.clerkUserId };
}
