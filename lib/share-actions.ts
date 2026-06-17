"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { signups } from "@/lib/db/schema/signups";
import {
  generateShareToken,
  sanitizeShareFields,
  shareFieldsOrDefault,
  DEFAULT_SHARE_FIELDS,
  type ShareFieldKey,
} from "@/lib/share";
import { shareUrlFor } from "@/lib/url";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// What the client gets back after any mutation, so the panel can re-render.
export type ShareResult = {
  enabled: boolean;
  url: string | null;
  fields: ShareFieldKey[];
  error?: string;
};

function err(message: string): ShareResult {
  return { enabled: false, url: null, fields: [...DEFAULT_SHARE_FIELDS], error: message };
}

// The capability here is the signupId itself — the same secret the parent uses
// to reach their /signup/thanks edit page. Anyone with it can already edit the
// family profile, so gating share settings on it is consistent.
export async function setShareEnabled(signupId: string, on: boolean): Promise<ShareResult> {
  if (!UUID_RE.test(signupId)) return err("We couldn't find your signup.");

  const db = getDb();
  try {
    const [row] = await db
      .select({
        token: signups.shareToken,
        fields: signups.shareFields,
      })
      .from(signups)
      .where(eq(signups.id, signupId))
      .limit(1);
    if (!row) return err("We couldn't find your signup.");

    // Generate a token the first time sharing is turned on; keep it thereafter.
    const token = row.token ?? generateShareToken();
    const fields = shareFieldsOrDefault(row.fields);

    await db
      .update(signups)
      .set({
        shareEnabled: on,
        shareToken: token,
        shareFields: row.fields ?? fields,
      })
      .where(eq(signups.id, signupId));

    revalidatePath(`/p/${token}`);
    return { enabled: on, url: shareUrlFor(token), fields };
  } catch (e) {
    console.error("setShareEnabled failed:", e);
    return err("Something went wrong. Please try again.");
  }
}

export async function setShareFields(
  signupId: string,
  rawFields: string[],
): Promise<ShareResult> {
  if (!UUID_RE.test(signupId)) return err("We couldn't find your signup.");
  const fields = sanitizeShareFields(rawFields);

  const db = getDb();
  try {
    const [row] = await db
      .select({ enabled: signups.shareEnabled, token: signups.shareToken })
      .from(signups)
      .where(eq(signups.id, signupId))
      .limit(1);
    if (!row) return err("We couldn't find your signup.");

    await db.update(signups).set({ shareFields: fields }).where(eq(signups.id, signupId));

    if (row.token) revalidatePath(`/p/${row.token}`);
    return {
      enabled: row.enabled,
      url: row.token ? shareUrlFor(row.token) : null,
      fields,
    };
  } catch (e) {
    console.error("setShareFields failed:", e);
    return err("Something went wrong. Please try again.");
  }
}
