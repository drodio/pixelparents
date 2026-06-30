"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { isFamilyVerified } from "@/lib/directory";
import type { SignupRow } from "@/lib/db/schema/signups";
import {
  createResource,
  deleteResource,
  countResourcesByAuthorSince,
} from "@/lib/db/resources";
import {
  validateResourceTitle,
  validateResourceUrl,
  validateResourceNote,
  normalizeResourceTags,
  autoLabelResource,
} from "@/lib/resources-label";

// Server actions for the OHS "Resources" living library. Every action authorizes
// ENTIRELY server-side from the Clerk session (never a client-supplied identity),
// and every actor must be a VERIFIED OHS family. Anyone verified (parent OR
// student) can share a resource; only the author can delete their own. Inputs are
// validated/sanitized; auto-labeling NEVER blocks a submission.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Per-author submission rate limit: at most N new resources in a rolling window.
const RESOURCE_RATE_LIMIT = 10;
const RESOURCE_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

// Resolve the signed-in caller to their VERIFIED OHS family signup, or null. The
// identity is derived from the Clerk session (currentUser → primaryEmail); a
// client can never supply it. Mirrors community/actions.ts.
async function verifiedCaller(): Promise<{ user: SignupRow; clerkId: string } | null> {
  const user = await currentUser();
  if (!user) return null;
  const email = primaryEmail(user);
  if (!email) return null;
  const signup = await getSignupByEmail(email);
  if (!signup) return null;
  if (!isFamilyVerified(signup)) return null;
  return { user: signup, clerkId: user.id };
}

// Share a resource. Caller must be a verified OHS family. Title + URL required;
// note optional. Topic tags are auto-generated server-side (the author's own
// hint tags are merged in, then capped) — and auto-labeling can NEVER block the
// submission (it falls back to heuristic tags on any AI failure / missing key).
export async function createResourceAction(input: {
  title: string;
  url: string;
  note: string;
  // Optional author-supplied hint tags merged with the AI/heuristic tags.
  tags?: string[];
}): Promise<ActionResult> {
  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS member to share a resource." };

  const title = validateResourceTitle(input.title);
  if (!title.ok) return { ok: false, error: title.error };
  const url = validateResourceUrl(input.url);
  if (!url.ok) return { ok: false, error: url.error };
  const note = validateResourceNote(input.note);
  if (!note.ok) return { ok: false, error: note.error };

  // Rate limit: count this author's submissions in the rolling window.
  const recent = await countResourcesByAuthorSince(
    caller.user.id,
    Date.now() - RESOURCE_RATE_WINDOW_MS,
  );
  if (recent >= RESOURCE_RATE_LIMIT) {
    return { ok: false, error: "You've shared a lot recently — please try again later." };
  }

  // Auto-label. Best-effort by design: autoLabelResource never throws and always
  // returns at least one tag, so a missing/failed AI key never blocks a share.
  let tags: string[] = [];
  try {
    tags = await autoLabelResource({ title: title.value, note: note.value, url: url.value });
  } catch {
    tags = [];
  }
  // Merge any author-supplied hint tags, then sanitize + cap.
  const merged = normalizeResourceTags([...(input.tags ?? []), ...tags]);

  try {
    const row = await createResource({
      authorSignupId: caller.user.id,
      authorClerkId: caller.clerkId,
      title: title.value,
      url: url.value,
      note: note.value || null,
      tags: merged,
    });
    revalidatePath("/resources");
    return { ok: true, id: row.id };
  } catch (err) {
    console.error("createResourceAction failed:", err);
    return { ok: false, error: "Couldn't share this resource. Please try again." };
  }
}

// Delete a resource. ONLY the author may delete — enforced by the scoped WHERE in
// deleteResource (a resource owned by someone else matches 0 rows → no-op).
export async function deleteResourceAction(input: { id: string }): Promise<ActionResult> {
  if (!UUID_RE.test(input.id)) return { ok: false, error: "Unknown resource." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS member." };

  try {
    const ok = await deleteResource({ id: input.id, authorSignupId: caller.user.id });
    if (!ok) return { ok: false, error: "You can only remove resources you shared." };
    revalidatePath("/resources");
    return { ok: true };
  } catch (err) {
    console.error("deleteResourceAction failed:", err);
    return { ok: false, error: "Couldn't remove this resource. Please try again." };
  }
}
