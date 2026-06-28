import { db } from "@/db";
import { profileDossiers } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

// The Chief "Deep Intelligence" dossier for a profile. We only ever keep one row
// per evaluation; the profile box renders the share link when it's `ready`.
export type ProfileDossier = {
  evaluationId: string;
  shareUrl: string | null;
  status: string;
  totalCredits: number | null;
  createdAt: Date;
};

// Returns the profile's dossier, or null if none has been run. Callers should
// treat "viewable" as `status === "ready" && shareUrl` (see isDossierViewable).
// Fail-safe: any DB error (e.g. migration 0061 not yet applied) returns null so
// the profile page degrades to "no dossier box" instead of 500ing the whole page.
export async function getProfileDossier(evaluationId: string): Promise<ProfileDossier | null> {
  try {
    const [row] = await db
      .select({
        evaluationId: profileDossiers.evaluationId,
        shareUrl: profileDossiers.shareUrl,
        status: profileDossiers.status,
        totalCredits: profileDossiers.totalCredits,
        createdAt: profileDossiers.createdAt,
      })
      .from(profileDossiers)
      .where(eq(profileDossiers.evaluationId, evaluationId))
      .limit(1);
    return row ?? null;
  } catch (err) {
    console.error("getProfileDossier failed (table missing or DB error):", err);
    return null;
  }
}

// A dossier is shown as "View …" only when it finished and has a public link.
// The link must be https (it's rendered into an anchor href) — anything else
// (none, running, failed, linkless, non-https) shows the "Run …" state.
export function isDossierViewable(d: ProfileDossier | null): d is ProfileDossier & { shareUrl: string } {
  return Boolean(d && d.status === "ready" && d.shareUrl && d.shareUrl.startsWith("https://"));
}

// ── Run / sweep store helpers ─────────────────────────────────────────────────

// Mark a dossier as in-flight: one row per evaluation (PK). Re-running (e.g. after
// a prior failure) overwrites the row and clears the previous result so the box
// reflects the new run. `updatedAt` is the "running since" reference the sweep
// uses for staleness.
export async function startDossier(opts: {
  evaluationId: string;
  // null for a free super-admin run (no buyer to refund).
  buyerClerkUserId: string | null;
  chatId: string;
  messageId: string;
  intelligence: string;
}): Promise<void> {
  await db
    .insert(profileDossiers)
    .values({
      evaluationId: opts.evaluationId,
      buyerClerkUserId: opts.buyerClerkUserId,
      chatId: opts.chatId,
      messageId: opts.messageId,
      intelligence: opts.intelligence,
      status: "running",
    })
    .onConflictDoUpdate({
      target: profileDossiers.evaluationId,
      set: {
        buyerClerkUserId: opts.buyerClerkUserId,
        chatId: opts.chatId,
        messageId: opts.messageId,
        intelligence: opts.intelligence,
        status: "running",
        shareUrl: null,
        rawMarkdown: null,
        totalCredits: null,
        error: null,
        updatedAt: sql`NOW()`,
      },
    });
}

// A dossier still generating, as the sweep needs it.
export type GeneratingDossier = {
  evaluationId: string;
  chatId: string | null;
  messageId: string | null;
  buyerClerkUserId: string | null;
  updatedAt: Date;
};

export async function listGeneratingDossiers(): Promise<GeneratingDossier[]> {
  return db
    .select({
      evaluationId: profileDossiers.evaluationId,
      chatId: profileDossiers.chatId,
      messageId: profileDossiers.messageId,
      buyerClerkUserId: profileDossiers.buyerClerkUserId,
      updatedAt: profileDossiers.updatedAt,
    })
    .from(profileDossiers)
    .where(eq(profileDossiers.status, "running"));
}

export async function markDossierReady(
  evaluationId: string,
  opts: { shareUrl: string; rawMarkdown: string; totalCredits: number | null },
): Promise<void> {
  await db
    .update(profileDossiers)
    .set({
      status: "ready",
      shareUrl: opts.shareUrl,
      rawMarkdown: opts.rawMarkdown,
      totalCredits: opts.totalCredits,
      error: null,
      updatedAt: sql`NOW()`,
    })
    .where(eq(profileDossiers.evaluationId, evaluationId));
}

export async function markDossierFailed(evaluationId: string, error: string): Promise<void> {
  await db
    .update(profileDossiers)
    .set({ status: "failed", error, updatedAt: sql`NOW()` })
    .where(eq(profileDossiers.evaluationId, evaluationId));
}
