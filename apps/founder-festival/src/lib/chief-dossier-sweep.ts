import { chiefPoll, chiefShare, dossierShareUrl } from "@/lib/chief";
import { refundCredits } from "@/lib/credits";
import { DOSSIER_COST_CENTS } from "@/lib/credit-packs";
import {
  listGeneratingDossiers,
  markDossierFailed,
  markDossierReady,
  type GeneratingDossier,
} from "@/lib/profile-dossier";

// Advances in-flight Chief "Deep Intelligence" dossiers. For each "running" row,
// polls its Chief message: when the answer lands we ensure the chat is publicly
// shared, build the scroll-to share link, and store it ("ready"). A row that has
// been generating too long is failed and the buyer is refunded so they aren't
// charged for a dossier they never received. Each poll/share is a fast GET/POST,
// so no single cron run blocks. Idempotent + safe on a schedule.

// Deep research can take ~10 min; give generous headroom before declaring dead.
const STALE_MS = 20 * 60 * 1000;

async function advanceOne(row: GeneratingDossier, now: number): Promise<"done" | "failed" | "pending"> {
  const age = now - new Date(row.updatedAt).getTime();
  const fail = async (reason: string) => {
    await markDossierFailed(row.evaluationId, reason);
    // Refund the buyer (flat $50). Best-effort: a missing buyer id can't be
    // refunded, but the row is still marked failed so the UI stops spinning.
    if (row.buyerClerkUserId) {
      await refundCredits(row.buyerClerkUserId, DOSSIER_COST_CENTS, row.evaluationId);
    }
  };

  if (!row.chatId || !row.messageId) {
    await fail("Missing Chief handle");
    return "failed";
  }

  const poll = await chiefPoll({ chatId: row.chatId, messageId: row.messageId });
  if (poll.status === "ready") {
    // Ensure a public share link exists, then anchor it to this message.
    const base = await chiefShare(row.chatId);
    if (!base) {
      // Share endpoint hiccup — keep waiting and retry next tick (unless stale).
      if (age > STALE_MS) {
        await fail("Could not create a public share link for the dossier");
        return "failed";
      }
      return "pending";
    }
    await markDossierReady(row.evaluationId, {
      shareUrl: dossierShareUrl(base, row.messageId),
      rawMarkdown: poll.text,
      totalCredits: poll.credits?.total ?? null,
    });
    return "done";
  }

  // pending or a transient poll error this tick — only give up once clearly stale.
  if (age > STALE_MS) {
    await fail("Timed out waiting for Chief (no response after 20 min)");
    return "failed";
  }
  return "pending";
}

export async function sweepChiefDossiers(): Promise<{ done: number; failed: number; pending: number }> {
  const now = Date.now();
  const tally = { done: 0, failed: 0, pending: 0 };
  const rows = await listGeneratingDossiers();
  // Sequential to keep Chief request pressure modest; volume here is low.
  for (const row of rows) {
    const r = await advanceOne(row, now);
    tally[r]++;
  }
  return tally;
}
