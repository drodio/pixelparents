"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/lib/db";
import { signups } from "@/lib/db/schema/signups";
import {
  generateShareToken,
  sanitizeShareFields,
  shareFieldsOrDefault,
  DEFAULT_SHARE_FIELDS,
  isShareVisibility,
  type ShareFieldKey,
  type ShareVisibility,
} from "@/lib/share";
import { isAdminEmail } from "@/lib/admin";
import { primaryEmail } from "@/lib/clerk";
import { shareUrlFor } from "@/lib/url";

export type VisibilityResult = { visibility: ShareVisibility; error?: string };

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

// Visibility — thanks-page entry point. Uses the signupId capability (the
// thanks-page link is the owner's private edit URL, like the controls above).
export async function setShareVisibility(
  signupId: string,
  visibility: string,
): Promise<VisibilityResult> {
  if (!UUID_RE.test(signupId)) return { visibility: "private", error: "We couldn't find your signup." };
  if (!isShareVisibility(visibility)) return { visibility: "private", error: "Invalid visibility." };
  const db = getDb();
  try {
    const [row] = await db
      .select({ token: signups.shareToken })
      .from(signups)
      .where(eq(signups.id, signupId))
      .limit(1);
    if (!row) return { visibility: "private", error: "We couldn't find your signup." };
    const token = row.token ?? generateShareToken();
    await db
      .update(signups)
      .set({ shareVisibility: visibility, shareEnabled: visibility !== "private", shareToken: token })
      .where(eq(signups.id, signupId));
    revalidatePath(`/p/${token}`);
    return { visibility };
  } catch (e) {
    console.error("setShareVisibility failed:", e);
    return { visibility: "private", error: "Something went wrong. Please try again." };
  }
}

// Visibility — /p entry point. The token is public, so authorize via the
// signed-in owner (email match) or an admin; anyone-with-the-link cannot change it.
export async function setShareVisibilityByToken(
  token: string,
  visibility: string,
): Promise<VisibilityResult> {
  if (!isShareVisibility(visibility)) return { visibility: "private", error: "Invalid visibility." };
  const db = getDb();
  try {
    const [row] = await db
      .select({ id: signups.id, email: signups.email, visibility: signups.shareVisibility })
      .from(signups)
      .where(eq(signups.shareToken, token))
      .limit(1);
    if (!row) return { visibility: "private", error: "Not found." };
    const current = isShareVisibility(row.visibility) ? row.visibility : "private";

    const user = await currentUser();
    const email = primaryEmail(user);
    const isOwner = Boolean(email && email.toLowerCase() === row.email.toLowerCase());
    const isAdmin = await isAdminEmail(email);
    if (!isOwner && !isAdmin) {
      return { visibility: current, error: "Only the profile owner can change this." };
    }

    await db
      .update(signups)
      .set({ shareVisibility: visibility, shareEnabled: visibility !== "private" })
      .where(eq(signups.id, row.id));
    revalidatePath(`/p/${token}`);
    return { visibility };
  } catch (e) {
    console.error("setShareVisibilityByToken failed:", e);
    return { visibility: "private", error: "Something went wrong. Please try again." };
  }
}
