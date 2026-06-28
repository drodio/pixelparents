import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

// The live NFX Signal JWT lives in the DB (app_settings kv) so it can be refreshed
// at runtime — in one click via the admin bookmarklet — without a redeploy. The
// Vercel env var NFX_SIGNAL_TOKEN remains the SEED / fallback (used until the
// first DB refresh, and if the DB read ever fails). See /admin/nfx-refresh.

const NFX_TOKEN_KEY = "nfx_signal_token";

// Resolve the NFX token: DB value first (the refreshed one), env var as fallback.
export async function getNfxToken(): Promise<string | null> {
  try {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, NFX_TOKEN_KEY))
      .limit(1);
    const dbVal = row?.value?.trim();
    if (dbVal) return dbVal;
  } catch {
    // DB unreachable — fall through to the env seed so scoring still works.
  }
  const env = process.env.NFX_SIGNAL_TOKEN?.trim();
  return env || null;
}

// Persist a freshly-captured token (upsert). Called by the refresh endpoint.
export async function setNfxToken(token: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: NFX_TOKEN_KEY, value: token, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: token, updatedAt: new Date() } });
}

// When the DB-stored token was last refreshed (null if never / still on the env seed).
export async function getNfxTokenUpdatedAt(): Promise<Date | null> {
  try {
    const [row] = await db
      .select({ updatedAt: appSettings.updatedAt })
      .from(appSettings)
      .where(eq(appSettings.key, NFX_TOKEN_KEY))
      .limit(1);
    return row?.updatedAt ?? null;
  } catch {
    return null;
  }
}
