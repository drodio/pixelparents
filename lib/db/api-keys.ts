import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { generateApiKey, hashApiKey, parseBearer } from "@/lib/api-keys";
import { getDb } from "./index";
import { ensureApiKeysTable } from "./ensure";
import { apiKeys, type ApiKeyRow } from "./schema/api-keys";

// ---------------------------------------------------------------------------
// Request lifecycle: pending -> approved | rejected. A key is only generated
// (and revealed once) after approval. One active request row per Clerk user.
// ---------------------------------------------------------------------------

export async function getRequestByClerkUser(
  clerkUserId: string,
): Promise<ApiKeyRow | null> {
  await ensureApiKeysTable();
  const [row] = await getDb()
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.clerkUserId, clerkUserId))
    .orderBy(desc(apiKeys.createdAt))
    .limit(1);
  return row ?? null;
}

// Create a pending request for a signed-in user. Returns the existing row
// unchanged if they already have one that isn't rejected (one request per user);
// a rejected user may re-apply (creates a fresh pending row).
export async function createRequest(input: {
  clerkUserId: string;
  name: string;
  email: string;
  intendedUse: string;
}): Promise<ApiKeyRow> {
  await ensureApiKeysTable();
  const existing = await getRequestByClerkUser(input.clerkUserId);
  if (existing && existing.status !== "rejected") return existing;

  const [row] = await getDb()
    .insert(apiKeys)
    .values({
      clerkUserId: input.clerkUserId,
      name: input.name,
      email: input.email,
      intendedUse: input.intendedUse,
      status: "pending",
    })
    .returning();
  return row!;
}

export async function getRequestById(id: string): Promise<ApiKeyRow | null> {
  await ensureApiKeysTable();
  const [row] = await getDb().select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
  return row ?? null;
}

export async function approveRequest(id: string, adminEmail: string): Promise<void> {
  await getDb()
    .update(apiKeys)
    .set({ status: "approved", decidedAt: sql`NOW()`, decidedBy: adminEmail, rejectReason: null })
    .where(eq(apiKeys.id, id));
}

export async function rejectRequest(
  id: string,
  adminEmail: string,
  reason: string | null,
): Promise<void> {
  await getDb()
    .update(apiKeys)
    .set({ status: "rejected", decidedAt: sql`NOW()`, decidedBy: adminEmail, rejectReason: reason })
    .where(eq(apiKeys.id, id));
}

export type RevealedKey = { raw: string; prefix: string };

// Reveal (or, with rotate, replace) the raw key for an approved user. Returns
// null if the user has no approved request. The raw value is returned exactly
// once — we persist only the hash. A previously-revealed key cannot be shown
// again; the user must rotate to get a new one.
export async function revealOrRotateKey(
  clerkUserId: string,
  opts: { rotate?: boolean } = {},
): Promise<RevealedKey | null> {
  const row = await getRequestByClerkUser(clerkUserId);
  if (!row || row.status !== "approved" || row.revokedAt) return null;
  if (row.keyHash && !opts.rotate) return null; // already revealed; can't re-show

  const { raw, hash, prefix } = generateApiKey();
  await getDb()
    .update(apiKeys)
    .set({ keyHash: hash, keyPrefix: prefix, revealedAt: sql`NOW()` })
    .where(eq(apiKeys.id, row.id));
  return { raw, prefix };
}

export type VerifiedKey = { keyId: string; clerkUserId: string | null };

// Verify an Authorization header. Returns the owner on success, or null (→ 401)
// when the key is missing, malformed, unknown, revoked, or not approved.
// Touches last_used_at best-effort.
export async function verifyApiKey(
  authHeader: string | null,
): Promise<VerifiedKey | null> {
  const raw = parseBearer(authHeader);
  if (!raw) return null;
  await ensureApiKeysTable();
  const hash = hashApiKey(raw);
  const [row] = await getDb()
    .select({ id: apiKeys.id, clerkUserId: apiKeys.clerkUserId })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.keyHash, hash),
        eq(apiKeys.status, "approved"),
        isNull(apiKeys.revokedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  try {
    await getDb().update(apiKeys).set({ lastUsedAt: sql`NOW()` }).where(eq(apiKeys.id, row.id));
  } catch {
    // ignore — last_used_at is non-critical telemetry
  }
  return { keyId: row.id, clerkUserId: row.clerkUserId };
}

// --- Admin (called from the Clerk-gated /admin/api-requests page) ---

export async function listRequests(): Promise<ApiKeyRow[]> {
  await ensureApiKeysTable();
  return getDb().select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
}

// Count of requests awaiting a decision (for an admin badge, if wanted).
export async function pendingRequestCount(): Promise<number> {
  await ensureApiKeysTable();
  const [r] = await getDb()
    .select({ c: sql<number>`count(*)::int` })
    .from(apiKeys)
    .where(and(eq(apiKeys.status, "pending"), ne(apiKeys.status, "rejected")));
  return r?.c ?? 0;
}
