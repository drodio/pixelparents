import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  generateApiKey,
  hashApiKey,
  parseBearer,
  type Tier,
} from "@/lib/api-keys";
import { getDb } from "./index";
import { apiKeys } from "./schema/api-keys";

export type IssuedKey = {
  id: string;
  raw: string;
  prefix: string;
  tier: Tier;
  createdAt: Date;
};

// Mint a new self-serve key (tier defaults to 'public' in the schema). The raw
// value is returned to the caller exactly once here — we persist only the hash.
export async function issueApiKey(input: {
  name: string;
  email: string;
  intendedUse: string;
  label?: string | null;
}): Promise<IssuedKey> {
  const { raw, hash, prefix } = generateApiKey();
  const [row] = await getDb()
    .insert(apiKeys)
    .values({
      keyHash: hash,
      keyPrefix: prefix,
      name: input.name,
      email: input.email,
      intendedUse: input.intendedUse,
      label: input.label ?? null,
    })
    .returning({
      id: apiKeys.id,
      tier: apiKeys.tier,
      createdAt: apiKeys.createdAt,
    });
  return {
    id: row!.id,
    raw,
    prefix,
    tier: row!.tier as Tier,
    createdAt: row!.createdAt,
  };
}

export type VerifiedKey = {
  keyId: string;
  tier: Tier;
  label: string | null;
  createdAt: Date;
  approvedAt: Date | null;
};

// Verify an Authorization header against api_keys. Returns the key on success,
// or null (→ 401) when missing, malformed, unknown, or revoked. Touches
// last_used_at best-effort — a transient write failure there must never fail an
// otherwise-valid request.
export async function verifyApiKey(
  authHeader: string | null,
): Promise<VerifiedKey | null> {
  const raw = parseBearer(authHeader);
  if (!raw) return null;
  const hash = hashApiKey(raw);
  const [row] = await getDb()
    .select({
      id: apiKeys.id,
      tier: apiKeys.tier,
      label: apiKeys.label,
      createdAt: apiKeys.createdAt,
      approvedAt: apiKeys.approvedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row) return null;
  try {
    await getDb()
      .update(apiKeys)
      .set({ lastUsedAt: sql`NOW()` })
      .where(eq(apiKeys.id, row.id));
  } catch {
    // ignore — last_used_at is non-critical telemetry
  }
  return {
    keyId: row.id,
    tier: row.tier as Tier,
    label: row.label,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
  };
}

// --- Admin operations (called from the Basic-Auth/Clerk-gated /admin page) ---

export async function listApiKeys() {
  return getDb()
    .select({
      id: apiKeys.id,
      prefix: apiKeys.keyPrefix,
      label: apiKeys.label,
      name: apiKeys.name,
      email: apiKeys.email,
      intendedUse: apiKeys.intendedUse,
      tier: apiKeys.tier,
      createdAt: apiKeys.createdAt,
      approvedAt: apiKeys.approvedAt,
      revokedAt: apiKeys.revokedAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .orderBy(desc(apiKeys.createdAt));
}

export async function approveApiKey(id: string): Promise<void> {
  await getDb()
    .update(apiKeys)
    .set({ tier: "approved", approvedAt: sql`NOW()` })
    .where(eq(apiKeys.id, id));
}

export async function revokeApiKey(id: string): Promise<void> {
  await getDb()
    .update(apiKeys)
    .set({ revokedAt: sql`NOW()` })
    .where(eq(apiKeys.id, id));
}
