import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { families, type FamilyRow } from "@/lib/db/schema/signups";
import { getBaseUrl } from "@/lib/url";

// Hard-to-guess invite token — same unguessable-token recipe as the secret
// share token (lib/share.ts) and developer API keys: 24 random bytes, url-safe.
export function generateFamilyInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

// Create a brand-new family with a fresh invite token and return its row.
export async function createFamily(): Promise<FamilyRow> {
  const [row] = await getDb()
    .insert(families)
    .values({ inviteToken: generateFamilyInviteToken() })
    .returning();
  return row;
}

// Resolve a family by its invite token (used by the co-parent join flow).
export async function getFamilyByInviteToken(token: string): Promise<FamilyRow | null> {
  const [row] = await getDb()
    .select()
    .from(families)
    .where(eq(families.inviteToken, token))
    .limit(1);
  return row ?? null;
}

// The URL a co-parent opens to attach their own signup to an existing family.
export function joinUrlFor(inviteToken: string): string {
  return `${getBaseUrl()}/signup/join/${inviteToken}`;
}
